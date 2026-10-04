import { readFile, stat } from "node:fs/promises";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  throw new Error("Usage: node scripts/place-pack-diff.mjs <before.json> <after.json>");
}

const [beforeRaw, afterRaw, beforeStat, afterStat] = await Promise.all([
  readFile(beforePath, "utf8"),
  readFile(afterPath, "utf8"),
  stat(beforePath),
  stat(afterPath),
]);
const before = JSON.parse(beforeRaw);
const after = JSON.parse(afterRaw);
const fields = ["id", "name", "lat", "lon", "street", "city", "nameSv"];
const rows = (pack) => {
  if (JSON.stringify(pack?.fields) !== JSON.stringify(fields)) {
    throw new Error("Cannot diff a place pack with an unknown field layout.");
  }
  return new Map(
    (Array.isArray(pack.places) ? pack.places : []).map((row) => [
      String(row[0]),
      {
        id: String(row[0]),
        name: String(row[1] || ""),
        lat: Number(row[2]),
        lon: Number(row[3]),
        street: String(row[4] || ""),
        city: String(row[5] || ""),
        nameSv: String(row[6] || ""),
      },
    ])
  );
};

const oldRows = rows(before);
const newRows = rows(after);
const added = [...newRows.keys()].filter((id) => !oldRows.has(id));
const removed = [...oldRows.keys()].filter((id) => !newRows.has(id));
let renamed = 0;
let moved = 0;
let addressChanged = 0;

for (const [id, next] of newRows) {
  const previous = oldRows.get(id);
  if (!previous) continue;
  if (previous.name !== next.name || previous.nameSv !== next.nameSv) renamed += 1;
  if (
    Math.abs(previous.lat - next.lat) > 0.00002 ||
    Math.abs(previous.lon - next.lon) > 0.00002
  ) {
    moved += 1;
  }
  if (previous.street !== next.street || previous.city !== next.city) {
    addressChanged += 1;
  }
}

const oldCount = oldRows.size;
const newCount = newRows.size;
const reduction = oldCount > 0 ? (oldCount - newCount) / oldCount : 0;
const warnings = [];
if (reduction > 0.1) {
  warnings.push(
    `⚠️ Place count dropped by ${Math.round(reduction * 100)}%; review before merging.`
  );
}
if (afterStat.size > beforeStat.size * 1.5 && beforeStat.size > 0) {
  warnings.push("⚠️ Raw pack size grew by more than 50%; review scope/data quality.");
}

const sample = (ids, map) =>
  ids
    .slice(0, 12)
    .map((id) => `- ${map.get(id)?.name || id} (${id})`)
    .join("\n");

console.log(`## OpenStreetMap place-pack refresh

- Places: **${oldCount.toLocaleString("en-US")} → ${newCount.toLocaleString("en-US")}**
- Raw size: **${beforeStat.size.toLocaleString("en-US")} → ${afterStat.size.toLocaleString("en-US")} bytes**
- Added: **${added.length}**
- Removed: **${removed.length}**
- Renamed: **${renamed}**
- Coordinates changed: **${moved}**
- Address/city changed: **${addressChanged}**
- Generated: **${after.generatedAt || "unknown"}**
- Source/licence: **OpenStreetMap / ODbL-1.0**

${warnings.length ? warnings.join("\n") : "✅ No suspicious count/size shift detected."}

### Added sample
${sample(added, newRows) || "- None"}

### Removed sample
${sample(removed, oldRows) || "- None"}

The production verifier still enforces the pack schema, ODbL attribution, size budget, unique IDs and Föli-area bounds. This automation only opens a PR; it never merges it.
`);
