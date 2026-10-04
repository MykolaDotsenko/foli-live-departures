import { readFile } from "node:fs/promises";
import path from "node:path";
import { PLACE_PACK_PATH, placePackProblems } from "./place-pack.mjs";

const raw = await readFile(path.resolve(PLACE_PACK_PATH));
const problems = placePackProblems(JSON.parse(raw.toString("utf8")), raw.byteLength);

if (problems.length) {
  throw new Error(
    ["Place pack failed:", ...problems.map((item) => `- ${item}`)].join("\n")
  );
}

const pack = JSON.parse(raw.toString("utf8"));
console.log(
  `Place pack verified: ${pack.places.length} places, ${raw.byteLength} bytes, ODbL with OpenStreetMap attribution, generated ${pack.generatedAt}.`
);
