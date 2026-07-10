// Loads and caches region data files.

export const REGIONS = [
  { id: "england", emoji: "🏴", name: "England", sub: "United Kingdom" },
  { id: "germany", emoji: "🇩🇪", name: "Germany", sub: "Deutschland" },
  { id: "virginia", emoji: "🦌", name: "Virginia", sub: "United States" },
];

export const CATEGORIES = [
  { id: "trees", emoji: "🌳", name: "Trees" },
  { id: "plants", emoji: "🌼", name: "Plants" },
  { id: "birds", emoji: "🐦", name: "Birds" },
  { id: "animals", emoji: "🦊", name: "Animals" },
];

const cache = new Map();

export async function loadRegion(regionId) {
  if (cache.has(regionId)) return cache.get(regionId);
  const res = await fetch(`data/${regionId}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load region "${regionId}"`);
  const data = await res.json();
  cache.set(regionId, data);
  return data;
}

export function getRegionMeta(regionId) {
  return REGIONS.find((r) => r.id === regionId);
}

export function getCategoryMeta(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId);
}
