import { readFile, stat } from "node:fs/promises";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  throw new Error("Usage: node scripts/address-pack-diff.mjs <before.json> <after.json>");
}

const [beforeText, afterText, beforeStat, afterStat] = await Promise.all([
  readFile(beforePath, "utf8"),
  readFile(afterPath, "utf8"),
  stat(beforePath),
  stat(afterPath),
]);
const before = JSON.parse(beforeText);
const after = JSON.parse(afterText);

const keyOf = (row) =>
  [String(row?.[0] || ""), String(row?.[1] || ""), String(row?.[4] || "")]
    .join("\u0000")
    .toLocaleLowerCase("fi");

const oldRows = new Map((before.addresses || []).map((row) => [keyOf(row), row]));
const newRows = new Map((after.addresses || []).map((row) => [keyOf(row), row]));
const added = [...newRows.keys()].filter((key) => !oldRows.has(key));
const removed = [...oldRows.keys()].filter((key) => !newRows.has(key));

let moved = 0;
for (const [key, next] of newRows) {
  const previous = oldRows.get(key);
  if (
    previous &&
    (Math.abs(Number(previous[2]) - Number(next[2])) > 0.00002 ||
      Math.abs(Number(previous[3]) - Number(next[3])) > 0.00002)
  ) {
    moved += 1;
  }
}

const oldCount = oldRows.size;
const newCount = newRows.size;
const reduction = oldCount > 0 ? (oldCount - newCount) / oldCount : 0;
const warnings = [];
if (reduction > 0.1) {
  warnings.push("⚠️ Address count dropped by more than 10%; review before merging.");
}
if (beforeStat.size > 0 && afterStat.size > beforeStat.size * 1.5) {
  warnings.push("⚠️ Address pack grew by more than 50%; review scope/data quality.");
}

const sample = (keys, map) =>
  keys
    .slice(0, 10)
    .map((key) => {
      const row = map.get(key);
      return `- ${row?.[0] || "?"} ${row?.[1] || ""} ${row?.[4] || ""}`.trim();
    })
    .join("\n");

console.log(`
## Offline address pack

- Addresses: **${oldCount.toLocaleString("en-US")} → ${newCount.toLocaleString("en-US")}**
- Streets: **${(before.streets || []).length.toLocaleString("en-US")} → ${(after.streets || []).length.toLocaleString("en-US")}**
- Raw size: **${beforeStat.size.toLocaleString("en-US")} → ${afterStat.size.toLocaleString("en-US")} bytes**
- Added addresses: **${added.length}**
- Removed addresses: **${removed.length}**
- Coordinates changed: **${moved}**
- Generated: **${after.generatedAt || "unknown"}**

${warnings.length ? warnings.join("\n") : "✅ No suspicious address count/size shift detected."}

### Added address sample
${sample(added, newRows) || "- None"}

### Removed address sample
${sample(removed, oldRows) || "- None"}
`);
