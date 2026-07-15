// Dev-only: fetch open-license images for every species from Wikimedia Commons,
// downscale to WebP under assets/images/, and write credits back into the region
// JSON files and credits.html.
//
// Usage:  node fetch_images.mjs [--force] [region ...]
//   --force        re-download even if the target file already exists
//   region names   limit to given regions (default: all)
//
// Only Public Domain / CC0 / CC-BY / CC-BY-SA images are kept. Each image is
// attributed (author, license, source URL).

import sharp from "sharp";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// ---- proxy / TLS (remote sandbox) ----
if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const UA = "LocalWildlifeApp/1.0 (educational wildlife learning app; contact via GitHub)";
const API = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const regionFilter = args.filter((a) => !a.startsWith("--"));
const REGIONS = regionFilter.length
  ? regionFilter
  : ["england", "germany", "virginia"];

const IMG_WIDTH = 900; // px
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// license acceptance ----------------------------------------------------------
function classifyLicense(meta) {
  const short = (meta?.LicenseShortName?.value || "").toString();
  const lic = (meta?.License?.value || "").toString().toLowerCase();
  const s = short.toLowerCase();
  const text = `${s} ${lic}`;
  if (/\bnc\b|noncommercial|no-?deriv|\bnd\b/.test(text)) return null; // reject NC/ND
  if (/public domain|\bpd\b/.test(text)) return "Public domain";
  if (/cc0/.test(text)) return "CC0";
  if (/cc[ -]?by[ -]?sa/.test(text)) return short || "CC BY-SA";
  if (/cc[ -]?by/.test(text)) return short || "CC BY";
  return null;
}

function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function api(base, params) {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: "json", ...params }).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

// Get file license/author/url metadata for a File: title on Commons.
async function fileInfo(fileTitle, width) {
  const data = await api(COMMONS, {
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "extmetadata|url|mime",
    iiurlwidth: String(width),
  });
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const mime = info.mime || "";
  if (!/^image\/(jpeg|png|webp|tiff|gif)/.test(mime)) return null; // skip svg/pdf
  const license = classifyLicense(info.extmetadata);
  if (!license) return null;
  const author = stripHtml(info.extmetadata?.Artist?.value) || "Wikimedia Commons";
  return {
    thumburl: info.thumburl || info.url,
    credit: author,
    license,
    source: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`,
  };
}

// Lead image of a Wikipedia article (by title), then its Commons license.
async function leadImage(title, width) {
  const data = await api(API, {
    action: "query",
    titles: title,
    prop: "pageimages",
    piprop: "original|name",
    redirects: "1",
  });
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const name = page?.pageimage;
  if (!name) return null;
  return await fileInfo(`File:${name}`, width);
}

const NAME_STOPWORDS = new Set([
  "common", "european", "eurasian", "northern", "southern", "eastern", "western",
  "great", "greater", "lesser", "american", "house", "wild", "red", "grey",
  "gray", "blue", "black", "white", "spotted", "little",
]);

// Distinctive lowercase tokens identifying a species (genus, epithet, and
// meaningful words from the English name). Used to reject irrelevant search hits.
function speciesTokens(entry) {
  const tokens = new Set();
  for (const w of (entry.scientific || "").split(/\s+/)) {
    if (w.length >= 3) tokens.add(w.toLowerCase());
  }
  for (const w of (entry.name_en || "").split(/[\s/()-]+/)) {
    const lw = w.toLowerCase();
    if (lw.length >= 4 && !NAME_STOPWORDS.has(lw)) tokens.add(lw);
  }
  return [...tokens];
}

const FLIGHT_RX = /\b(flight|flying|wing|spread|soaring)\b/i;

// Search Commons for a file with an acceptable license. If `requireTokens` is
// given, the file title MUST contain at least one of them (species relevance).
// If `flight` is set, the title must also read as a flight/wings image.
async function searchCommons(query, width, { requireTokens = null, flight = false, limit = 20 } = {}) {
  const data = await api(COMMONS, {
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "extmetadata|url|mime",
    iiurlwidth: String(width),
  });
  const pages = data?.query?.pages;
  if (!pages) return null;
  const candidates = Object.values(pages);
  for (const page of candidates) {
    const title = page.title || "";
    if (requireTokens && !requireTokens.some((t) => title.toLowerCase().includes(t))) continue;
    if (flight && !FLIGHT_RX.test(title)) continue;
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    const mime = info.mime || "";
    if (!/^image\/(jpeg|png|webp|tiff|gif)/.test(mime)) continue;
    const license = classifyLicense(info.extmetadata);
    if (!license) continue;
    return {
      thumburl: info.thumburl || info.url,
      credit: stripHtml(info.extmetadata?.Artist?.value) || "Wikimedia Commons",
      license,
      source: info.descriptionurl,
    };
  }
  return null;
}

async function downloadToWebp(url, outAbs) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf)
        .resize({ width: IMG_WIDTH, height: IMG_WIDTH, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outAbs);
      return true;
    } catch (e) {
      await sleep(600 * (attempt + 1));
    }
  }
  return false;
}

// Find the best main image for an entry: try the English Wikipedia lead image by
// scientific name, then by English common name, then a Commons search.
async function findMain(entry) {
  const tries = [entry.scientific, entry.name_en].filter(Boolean);
  for (const t of tries) {
    const info = await leadImage(t, IMG_WIDTH);
    if (info) return info;
  }
  // Fallback search must still be about this species.
  return (
    (await searchCommons(entry.scientific || entry.name_en, IMG_WIDTH, {
      requireTokens: speciesTokens(entry),
    })) || null
  );
}

async function findFlight(entry) {
  const tokens = speciesTokens(entry);
  // Try scientific-name query first (most precise), then common name.
  for (const q of [`${entry.scientific} in flight`, `${entry.name_en} in flight`]) {
    const info = await searchCommons(q, IMG_WIDTH, { requireTokens: tokens, flight: true });
    if (info) return info;
  }
  return null;
}

const credits = []; // {region, category, name, credit, license, source}

async function processEntry(region, category, entry) {
  const dir = resolve(root, "assets/images", region, category);
  mkdirSync(dir, { recursive: true });
  const mainRel = `assets/images/${region}/${category}/${entry.slug}.webp`;
  const mainAbs = resolve(root, mainRel);

  // main image
  if (FORCE || !existsSync(mainAbs) || !entry.images?.length) {
    const info = await findMain(entry);
    if (info && (await downloadToWebp(info.thumburl, mainAbs))) {
      entry.images = [
        { file: mainRel, credit: info.credit, license: info.license, source: info.source },
      ];
      credits.push({ region, category, name: entry.name_en, ...info, file: mainRel });
      console.log(`  ✓ ${entry.name_en}  [${info.license}]`);
    } else {
      entry.images = entry.images || [];
      console.log(`  ✗ ${entry.name_en}  (no open-license image found)`);
    }
    await sleep(300);
  } else if (entry.images?.[0]) {
    credits.push({ region, category, name: entry.name_en, ...entry.images[0] });
  }

  // bird flight image
  if (category === "birds") {
    const flightRel = `assets/images/${region}/${category}/${entry.slug}-flight.webp`;
    const flightAbs = resolve(root, flightRel);
    if (FORCE || !existsSync(flightAbs) || !entry.flight_image) {
      const info = await findFlight(entry);
      if (info && (await downloadToWebp(info.thumburl, flightAbs))) {
        entry.flight_image = {
          file: flightRel,
          credit: info.credit,
          license: info.license,
          source: info.source,
        };
        credits.push({ region, category, name: `${entry.name_en} (wings spread)`, ...info, file: flightRel });
        console.log(`    ↳ flight ✓`);
      } else {
        entry.flight_image = entry.flight_image || null;
        console.log(`    ↳ flight ✗ (falls back to portrait)`);
      }
      await sleep(300);
    } else if (entry.flight_image) {
      credits.push({ region, category, name: `${entry.name_en} (wings spread)`, ...entry.flight_image });
    }
  }
}

function writeCredits() {
  const rows = credits
    .map(
      (c) => `      <li><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(
        c.credit
      )}, ${escapeHtml(c.license)}${
        c.source ? ` · <a href="${escapeHtml(c.source)}" target="_blank" rel="noopener">source</a>` : ""
      }</li>`
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Image credits — Local Wildlife</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="app-header"><a class="brand" href="#/"><span class="brand-mark">🌿</span><span class="brand-text">Local Wildlife</span></a></header>
  <main class="app">
    <h1 class="page-title">Image credits &amp; licenses</h1>
    <p class="page-sub">All images are used under open licenses (Public Domain / CC0 / CC BY / CC BY-SA) and sourced from Wikimedia Commons.</p>
    <ul>
${rows || "      <li>No images yet.</li>"}
    </ul>
    <p><a class="back-link" href="index.html">‹ Back to the app</a></p>
  </main>
</body>
</html>
`;
  writeFileSync(resolve(root, "credits.html"), html);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function main() {
  for (const region of REGIONS) {
    const jsonPath = resolve(root, "data", `${region}.json`);
    if (!existsSync(jsonPath)) {
      console.log(`(skip ${region}: no data/${region}.json)`);
      continue;
    }
    console.log(`\n=== ${region} ===`);
    const data = JSON.parse(readFileSync(jsonPath, "utf8"));
    for (const category of Object.keys(data.categories || {})) {
      console.log(` ${category}:`);
      for (const entry of data.categories[category]) {
        await processEntry(region, category, entry);
      }
    }
    writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
    console.log(`  wrote data/${region}.json`);
  }
  writeCredits();
  console.log(`\nDone. ${credits.length} images credited.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
