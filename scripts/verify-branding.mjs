import { readFile } from "node:fs/promises";

const PRODUCT_NAME = "Turku Departures";

const publicBrandFiles = [
  "src/App.jsx",
  "src/components/HelpGuide.jsx",
  "src/i18n/fi/app.js",
  "index.html",
  "public/manifest.webmanifest",
  "README.md",
  "docs/PRODUCT_POSITIONING.md",
  "scripts/build-social-card.mjs",
];

const retiredPublicNames = [
  "Föli departures",
  "Föli Live Departures",
  "Turku Föli",
  "Turku bus departures · Föli live times",
];

const sources = new Map(
  await Promise.all(
    publicBrandFiles.map(async (file) => [file, await readFile(file, "utf8")])
  )
);

for (const [file, source] of sources) {
  for (const retired of retiredPublicNames) {
    if (source.includes(retired)) {
      throw new Error(
        `Retired public name "${retired}" returned in ${file}. Use ${PRODUCT_NAME}.`
      );
    }
  }
}

const manifest = JSON.parse(sources.get("public/manifest.webmanifest"));
if (manifest.name !== PRODUCT_NAME || manifest.short_name !== PRODUCT_NAME) {
  throw new Error(
    `PWA name drifted: expected both name and short_name to be "${PRODUCT_NAME}".`
  );
}

const html = sources.get("index.html");
for (const expected of [
  `<meta name="apple-mobile-web-app-title" content="${PRODUCT_NAME}" />`,
  `<meta property="og:site_name" content="${PRODUCT_NAME}" />`,
]) {
  if (!html.includes(expected)) {
    throw new Error(`Missing branding contract in index.html: ${expected}`);
  }
}

const app = sources.get("src/App.jsx");
for (const expected of [
  PRODUCT_NAME,
  'mailto:docnikolaj1990@gmail.com?subject=Turku%20Departures%20feedback',
  'issues/new?template=bug_report.yml',
  'https://github.com/MykolaDotsenko/foli-live-departures',
]) {
  if (!app.includes(expected)) {
    throw new Error(`Missing trust/contact contract in App.jsx: ${expected}`);
  }
}

if (!sources.get("README.md").startsWith(`# ${PRODUCT_NAME}\n`)) {
  throw new Error(`README must lead with "# ${PRODUCT_NAME}".`);
}

if (!sources.get("scripts/build-social-card.mjs").includes(PRODUCT_NAME)) {
  throw new Error("Social-card source does not carry the product name.");
}

console.log(`Branding verified: ${PRODUCT_NAME}`);
