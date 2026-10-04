// Rebuilds public/places/foli-places.json from OpenStreetMap. Run by hand
// when the places should be refreshed, and commit the result:
//
//   npm run build:place-pack
//   npm run build:place-pack -- --endpoint https://overpass.kumi.systems/api/interpreter
//
// The build itself never contacts Overpass, so a release does not depend on
// a third-party service being up.

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PLACE_PACK_PATH,
  overpassQuery,
  placePack,
  placePackProblems,
  placeRows,
} from "./place-pack.mjs";

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 240_000;

const args = process.argv.slice(2);
const endpointIndex = args.indexOf("--endpoint");
const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : DEFAULT_ENDPOINT;

const response = await globalThis.fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    // Overpass asks clients to identify themselves.
    "User-Agent": "turku-departures-place-pack (https://github.com/MykolaDotsenko/foli-live-departures)",
  },
  body: new URLSearchParams({ data: overpassQuery() }).toString(),
  signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

if (!response.ok) {
  throw new Error(`Overpass answered HTTP ${response.status}.`);
}

const payload = await response.json();
const rows = placeRows(payload?.elements);
const pack = placePack(rows, new Date().toISOString());
const body = `${JSON.stringify(pack)}\n`;
const problems = placePackProblems(pack, Buffer.byteLength(body));
if (problems.length) {
  throw new Error(["The new place pack is not fit to ship:", ...problems].join("\n- "));
}

const outPath = path.resolve(PLACE_PACK_PATH);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, body);
console.log(
  `Wrote ${rows.length} places (${Buffer.byteLength(body)} bytes) to ${PLACE_PACK_PATH}.`
);
