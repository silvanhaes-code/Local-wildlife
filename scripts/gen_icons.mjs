// Generate PWA PNG icons from assets/icons/icon.svg
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const iconsDir = resolve(root, "assets/icons");
const svg = readFileSync(resolve(iconsDir, "icon.svg"));

async function render(size, out, { padding = 0, bg = null } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  let img = sharp(svg).resize(inner, inner);
  if (padding > 0) {
    const pad = Math.round((size - inner) / 2);
    img = img.extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: bg || "#2f6b3d",
    });
  }
  await img.png().toFile(resolve(iconsDir, out));
  console.log("wrote", out);
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(180, "icon-180.png");
// maskable needs a safe zone (~10% padding) on a solid background
await render(512, "icon-maskable-512.png", { padding: 0.12, bg: "#2f6b3d" });

console.log("Icons generated.");
