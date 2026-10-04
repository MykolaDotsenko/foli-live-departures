import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ADDRESS_PACK_PATH,
  addressOverpassQuery,
  addressPack,
  addressPackProblems,
  addressRows,
} from "./address-pack.mjs";

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const args = process.argv.slice(2);
const endpointIndex = args.indexOf("--endpoint");
const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : DEFAULT_ENDPOINT;

const response = await globalThis.fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "turku-departures-address-pack (https://github.com/MykolaDotsenko/foli-live-departures)",
  },
  body: new URLSearchParams({ data: addressOverpassQuery() }).toString(),
  signal: globalThis.AbortSignal.timeout(300_000),
});
if (!response.ok) throw new Error(`Overpass answered HTTP ${response.status}.`);

const payload = await response.json();
const rows = addressRows(payload?.elements);
const pack = addressPack(rows, new Date().toISOString());
const body = `${JSON.stringify(pack)}\n`;
const problems = addressPackProblems(pack, Buffer.byteLength(body));
if (problems.length) {
  throw new Error(["The new address pack is not fit to ship:", ...problems].join("\n- "));
}
const output = path.resolve(ADDRESS_PACK_PATH);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, body);
console.log(
  `Wrote ${rows.addresses.length} addresses + ${rows.streets.length} streets (${Buffer.byteLength(body)} bytes) to ${ADDRESS_PACK_PATH}.`
);
