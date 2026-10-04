import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ADDRESS_PACK_PATH,
  addressPackProblems,
} from "./address-pack.mjs";

const body = await readFile(path.resolve(ADDRESS_PACK_PATH));
const pack = JSON.parse(body.toString("utf8"));
const problems = addressPackProblems(pack, Buffer.byteLength(body));
if (problems.length) {
  throw new Error(["Production address pack failed:", ...problems.map((x) => `- ${x}`)].join("\n"));
}
console.log(
  `Address pack verified: ${pack.addresses.length} addresses, ${pack.streets.length} streets, ${body.byteLength} bytes, generated ${pack.generatedAt}.`
);
