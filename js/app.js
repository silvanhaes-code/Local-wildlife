import {
  REGIONS,
  CATEGORIES,
  loadRegion,
  getRegionMeta,
  getCategoryMeta,
} from "./data.js";
import { registerPWA } from "./pwa.js";

const app = document.getElementById("app");
const crumbsEl = document.getElementById("crumbs");

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return raw.split("/").filter(Boolean);
}

const PLACEHOLDER = "assets/icons/placeholder.svg";

function imgTag(img, alt, cls) {
  const src = img && img.file ? img.file : PLACEHOLDER;
  return `<img class="${cls}" loading="lazy" src="${esc(src)}" alt="${esc(alt)}"
    onerror="this.onerror=null;this.src='${PLACEHOLDER}'" />`;
}

function creditLine(img) {
  if (!img || !img.credit) return "";
  const src = img.source
    ? `<a href="${esc(img.source)}" target="_blank" rel="noopener">source</a>`
    : "";
  return `<span class="credit-line">${esc(img.credit)} · ${esc(
    img.license || ""
  )} ${src ? "· " + src : ""}</span>`;
}

function setCrumbs(parts) {
  crumbsEl.innerHTML = parts
    .map((p, i) => {
      const item = p.href
        ? `<a href="${esc(p.href)}">${esc(p.label)}</a>`
        : `<span>${esc(p.label)}</span>`;
      const sep = i < parts.length - 1 ? '<span class="sep">›</span>' : "";
      return item + sep;
    })
    .join(" ");
}

function scrollTop() {
  window.scrollTo({ top: 0 });
}

// ---------- views ----------
function viewHome() {
  setCrumbs([{ label: "Regions" }]);
  const cards = REGIONS.map(
    (r) => `
    <a class="card tile" href="#/${r.id}">
      <span class="emoji">${r.emoji}</span>
      <span class="tile-title">${esc(r.name)}</span>
      <span class="tile-sub">${esc(r.sub)}</span>
    </a>`
  ).join("");
  app.innerHTML = `
    <h1 class="page-title">Choose a region</h1>
    <p class="page-sub">Discover the trees, plants, birds and animals around you.</p>
    <div class="grid">${cards}</div>`;
  scrollTop();
}

function viewRegion(regionId) {
  const region = getRegionMeta(regionId);
  if (!region) return viewNotFound();
  setCrumbs([{ label: "Regions", href: "#/" }, { label: region.name }]);
  const cards = CATEGORIES.map(
    (c) => `
    <a class="card tile" href="#/${regionId}/${c.id}">
      <span class="emoji">${c.emoji}</span>
      <span class="tile-title">${esc(c.name)}</span>
    </a>`
  ).join("");
  app.innerHTML = `
    <h1 class="page-title">${esc(region.name)}</h1>
    <p class="page-sub">Pick a category to explore.</p>
    <div class="grid">${cards}</div>`;
  scrollTop();
}

async function viewCategory(regionId, categoryId) {
  const region = getRegionMeta(regionId);
  const category = getCategoryMeta(categoryId);
  if (!region || !category) return viewNotFound();
  setCrumbs([
    { label: "Regions", href: "#/" },
    { label: region.name, href: `#/${regionId}` },
    { label: category.name },
  ]);
  app.innerHTML = `<p class="loading">Loading ${esc(category.name)}…</p>`;

  let data;
  try {
    data = await loadRegion(regionId);
  } catch (e) {
    app.innerHTML = `<p class="empty">Could not load data for ${esc(region.name)}.</p>`;
    return;
  }
  const entries = (data.categories && data.categories[categoryId]) || [];
  const bilingual = !!data.bilingual;

  if (!entries.length) {
    app.innerHTML = `<h1 class="page-title">${esc(category.name)}</h1>
      <p class="empty">No entries yet.</p>`;
    return;
  }

  const cards = entries
    .map((e) => {
      const localName =
        bilingual && e.name_local && e.name_local !== e.name_en
          ? `<div class="name-local">${esc(e.name_local)}</div>`
          : "";
      const main = (e.images && e.images[0]) || null;
      return `
      <a class="card species-card" href="#/${regionId}/${categoryId}/${esc(e.slug)}">
        ${imgTag(main, e.name_en, "thumb")}
        <div class="body">
          <div class="name">${esc(e.name_en)}</div>
          ${localName}
          <div class="sci">${esc(e.scientific || "")}</div>
        </div>
      </a>`;
    })
    .join("");

  app.innerHTML = `
    <h1 class="page-title">${category.emoji} ${esc(category.name)}</h1>
    <p class="page-sub">${esc(region.name)} · ${entries.length} species</p>
    <div class="grid">${cards}</div>`;
  scrollTop();
}

async function viewDetail(regionId, categoryId, slug) {
  const region = getRegionMeta(regionId);
  const category = getCategoryMeta(categoryId);
  if (!region || !category) return viewNotFound();
  app.innerHTML = `<p class="loading">Loading…</p>`;

  let data;
  try {
    data = await loadRegion(regionId);
  } catch (e) {
    app.innerHTML = `<p class="empty">Could not load data.</p>`;
    return;
  }
  const entries = (data.categories && data.categories[categoryId]) || [];
  const e = entries.find((x) => x.slug === slug);
  if (!e) return viewNotFound();

  const bilingual = !!data.bilingual;
  setCrumbs([
    { label: "Regions", href: "#/" },
    { label: region.name, href: `#/${regionId}` },
    { label: category.name, href: `#/${regionId}/${categoryId}` },
    { label: e.name_en },
  ]);

  // figures: main image + any extra images + bird flight image
  const figures = [];
  const mainImg = (e.images && e.images[0]) || null;
  figures.push(
    `<figure class="figure detail-hero">
      ${imgTag(mainImg, e.name_en, "")}
      <figcaption>${creditLine(mainImg)}</figcaption>
    </figure>`
  );
  if (e.flight_image && e.flight_image.file) {
    figures.push(
      `<figure class="figure">
        <span class="fig-label">Wings spread</span>
        ${imgTag(e.flight_image, `${e.name_en} in flight`, "fig-img")}
        <figcaption>${creditLine(e.flight_image)}</figcaption>
      </figure>`
    );
  }

  // bilingual fact rendering
  const fact = (title, en, local) => {
    if (!en && !local) return "";
    if (bilingual && local && local !== en) {
      return `<section class="fact">
        <h2>${esc(title)}</h2>
        <p><span class="lang-tag">EN</span>${esc(en)}</p>
        <p><span class="lang-tag">DE</span>${esc(local)}</p>
      </section>`;
    }
    return `<section class="fact"><h2>${esc(title)}</h2><p>${esc(en || local)}</p></section>`;
  };

  const localName =
    bilingual && e.name_local && e.name_local !== e.name_en
      ? `<p class="local-name">${esc(e.name_local)}</p>`
      : "";

  app.innerHTML = `
    <a class="back-link" href="#/${regionId}/${categoryId}">‹ ${esc(category.name)}</a>
    <div class="detail">
      ${figures.join("")}
      <h1>${esc(e.name_en)}</h1>
      ${localName}
      <p class="sci-name">${esc(e.scientific || "")}</p>
      ${fact("About", e.description_en, e.description_local)}
      ${fact("How to identify", e.identify_en, e.identify_local)}
      ${fact("Habitat", e.habitat_en, e.habitat_local)}
    </div>`;
  scrollTop();
}

function viewNotFound() {
  setCrumbs([{ label: "Regions", href: "#/" }]);
  app.innerHTML = `<p class="empty">Nothing here. <a href="#/">Back to regions</a>.</p>`;
  scrollTop();
}

// ---------- router ----------
function router() {
  const parts = parseHash();
  try {
    if (parts.length === 0) return viewHome();
    if (parts.length === 1) return viewRegion(parts[0]);
    if (parts.length === 2) return viewCategory(parts[0], parts[1]);
    if (parts.length >= 3) return viewDetail(parts[0], parts[1], parts[2]);
  } catch (err) {
    console.error(err);
    viewNotFound();
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
router();
registerPWA();
