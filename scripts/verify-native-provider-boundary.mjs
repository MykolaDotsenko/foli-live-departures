import { readFile } from "node:fs/promises";
import path from "node:path";
import { documentPolicy } from "./content-security-policy.mjs";

const html = await readFile(path.resolve("dist/index.html"), "utf8");
const policy = documentPolicy(html);
if (!policy) {
  throw new Error("Native build carries no Content-Security-Policy.");
}

const directives = new Map(
  policy
    .split(";")
    .map((clause) => clause.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...sources]) => [name, sources])
);

const connectSources = directives.get("connect-src") || [];
const forbidden = "https://nominatim.openstreetmap.org";
if (connectSources.includes(forbidden)) {
  throw new Error(
    `Native provider boundary failed: connect-src still permits ${forbidden}.`
  );
}

console.log(
  "Native provider boundary verified: packaged build CSP does not permit direct public Nominatim requests."
);
