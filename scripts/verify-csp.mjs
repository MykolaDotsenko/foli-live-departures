import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  documentPolicy,
  inlineScripts,
  scriptHash,
} from "./content-security-policy.mjs";

// The shipped page must carry its policy, and the policy must still admit
// the inline script it was built for: an edit to index.html that changed the
// theme script without a rebuilt hash would leave first paint unthemed.
const html = await readFile(path.resolve("dist/index.html"), "utf8");
const policy = documentPolicy(html);
const failures = [];

if (!policy) {
  throw new Error("dist/index.html carries no Content-Security-Policy.");
}

const directives = new Map(
  policy
    .split(";")
    .map((clause) => clause.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...sources]) => [name, sources])
);

const required = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
};
for (const [name, sources] of Object.entries(required)) {
  const actual = directives.get(name) || [];
  for (const source of sources) {
    if (!actual.includes(source)) failures.push(`${name} lacks ${source}.`);
  }
}

const requiredConnectSources = [
  "https://data.foli.fi",
  "https://photon.komoot.io",
];
const connectSources = directives.get("connect-src") || [];
for (const source of requiredConnectSources) {
  if (!connectSources.includes(source)) {
    failures.push(`connect-src lacks ${source}.`);
  }
}

for (const [name, sources] of directives) {
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", "*"]) {
    if (sources.includes(unsafe)) failures.push(`${name} allows ${unsafe}.`);
  }
}

const scriptSources = directives.get("script-src") || [];
for (const body of inlineScripts(html)) {
  const hash = scriptHash(body);
  if (!scriptSources.includes(hash)) {
    failures.push(`An inline script is not admitted by script-src (${hash}).`);
  }
}

const policyAt = html.indexOf("Content-Security-Policy");
const firstScriptAt = html.search(/<script\b/i);
if (firstScriptAt !== -1 && firstScriptAt < policyAt) {
  failures.push("A script comes before the policy, so the policy does not cover it.");
}

if (failures.length > 0) {
  throw new Error(`Content-Security-Policy check failed:\n- ${failures.join("\n- ")}`);
}

console.log(
  `Content-Security-Policy: ${directives.size} directives, ${
    inlineScripts(html).length
  } inline script(s) admitted by hash.`
);
