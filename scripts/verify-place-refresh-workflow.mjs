import { readFile } from "node:fs/promises";
import path from "node:path";

const workflow = await readFile(
  path.resolve(".github/workflows/osm-place-refresh.yml"),
  "utf8"
);
const failures = [];
for (const token of [
  "schedule:",
  "workflow_dispatch:",
  "contents: write",
  "pull-requests: write",
  "npm run build:place-pack",
  "npm run verify:place-pack",
  "npm run build:address-pack",
  "npm run verify:address-pack",
  "scripts/place-pack-diff.mjs",
  "scripts/address-pack-diff.mjs",
  "public/addresses/foli-addresses.json",
  "gh pr create",
  "automation/osm-data-refresh",
]) {
  if (!workflow.includes(token)) failures.push(`Missing OSM refresh contract: ${token}`);
}
if (/gh\s+pr\s+merge|enable-auto-merge|auto[_-]?merge/i.test(workflow)) {
  failures.push("OSM data refresh must never merge its own pull request.");
}
if (!workflow.includes("github.actor != 'github-actions[bot]'")) {
  failures.push("OSM refresh must guard its automation-branch push from recursion.");
}
if (failures.length) {
  throw new Error(["OSM refresh workflow contract failed:", ...failures.map((x) => `- ${x}`)].join("\n"));
}
console.log("OSM refresh workflow verified: POI + address packs, reviewed PR only, no automatic merge.");
