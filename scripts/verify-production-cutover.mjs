import fs from "node:fs";
import path from "node:path";
import { loadProductionSiteConfig } from "./production-site-config.mjs";

const root = process.cwd();
const config = loadProductionSiteConfig(root);
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");
const failures = [];

const vite = read("vite.config.js");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy-pages.yml");
const pkg = JSON.parse(read("package.json"));
const contact = JSON.parse(read("play/contact.json"));
const listing = read("play/listings/en-US/full-description.txt");
const readme = read("README.md");
const runbook = read("docs/DOMAIN_CUTOVER.md");

if (!vite.includes('from "./scripts/production-site-config.mjs"')) {
  failures.push("Vite must load the versioned production site config.");
}
if (vite.includes("https://mykoladotsenko.github.io/foli-live-departures/")) {
  failures.push("Vite still hardcodes the current production origin.");
}
if (pkg.scripts?.["build:production-site"] !== "node scripts/build-production-site.mjs") {
  failures.push("package.json must expose the canonical production build command.");
}
for (const [label, source] of [["CI", ci], ["Pages deploy", deploy]]) {
  if (!source.includes("npm run build:production-site")) {
    failures.push(`${label} must build through the versioned production-site config.`);
  }
  if (/VITE_BASE_PATH:\s*\/foli-live-departures\//.test(source)) {
    failures.push(`${label} still hardcodes the GitHub Pages base path.`);
  }
}

if (contact.websiteUrl !== config.siteUrl) {
  failures.push("Play website URL does not match production-site config.");
}
if (contact.privacyPolicyUrl !== new URL("privacy.html", config.siteUrl).href) {
  failures.push("Play privacy-policy URL does not match production-site config.");
}
if (!listing.includes(new URL("privacy.html", config.siteUrl).href)) {
  failures.push("Play listing does not contain the configured production privacy URL.");
}
if (!readme.includes(config.siteUrl)) {
  failures.push("README does not link the configured production site.");
}

const publicFacing = {
  "README.md": readme,
  "play/contact.json": read("play/contact.json"),
  "play/listings/en-US/full-description.txt": listing,
};
for (const legacy of config.legacySiteUrls) {
  for (const [file, source] of Object.entries(publicFacing)) {
    if (source.includes(legacy)) {
      failures.push(`${file} still exposes retired production URL ${legacy}`);
    }
  }
}

for (const phrase of [
  "Browser storage cannot move cross-origin automatically",
  "Download backup",
  "Rollback",
  "old origin",
  "exact green",
]) {
  if (!runbook.includes(phrase)) {
    failures.push(`Domain cutover runbook is missing: ${phrase}`);
  }
}

if (failures.length) {
  throw new Error(
    ["Production cutover contract failed:", ...failures.map((f) => `- ${f}`)].join("\n")
  );
}
console.log(
  `Production cutover contract verified for ${config.siteUrl}; custom domain is ${config.customDomain || "not configured (manual gate remains open)"}.`
);
