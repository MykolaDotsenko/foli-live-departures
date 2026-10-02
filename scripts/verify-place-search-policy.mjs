import { readFile } from "node:fs/promises";
import path from "node:path";

const configPath = path.resolve("public/place-search-config.json");
const raw = await readFile(configPath, "utf8");
const config = JSON.parse(raw);

const failures = [];

if (config.enabled !== false) {
  failures.push(
    "Production direct address/POI search must stay disabled by default until an explicit provider/scaling policy is approved."
  );
}

if (
  String(config.endpoint || "") !==
  "https://nominatim.openstreetmap.org/search"
) {
  failures.push(
    "The dormant endpoint must remain the reviewed public Nominatim origin; changing providers requires an explicit policy review."
  );
}

if (String(config.countrycodes || "").toLowerCase() !== "fi") {
  failures.push("Dormant place-search policy must remain Finland-scoped.");
}

if (!Array.isArray(config.viewbox) || config.viewbox.length !== 4) {
  failures.push("Dormant place-search policy must retain a valid four-value Föli-region viewbox.");
}

if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 5) {
  failures.push("Dormant place-search result limit must stay between 1 and 5.");
}

if (failures.length) {
  throw new Error(
    ["Production place-search policy failed:", ...failures.map((item) => `- ${item}`)].join(
      "\n"
    )
  );
}

console.log(
  "Production place-search policy verified: direct public address/POI lookup is disabled by default and the app must hand off to the official Turku journey planner."
);
