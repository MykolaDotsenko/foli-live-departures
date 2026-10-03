import { readFile } from "node:fs/promises";

const PRODUCT_NAME = "Turku Departures";

const publicBrandFiles = [
  "src/App.jsx",
  "src/app/AppHeader.jsx",
  "src/app/AppFooter.jsx",
  "src/components/AppErrorBoundary.jsx",
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

// The banner carries the name; the footer, how to reach the maker.
if (!sources.get("src/app/AppHeader.jsx").includes(PRODUCT_NAME)) {
  throw new Error(`Missing ${PRODUCT_NAME} in the app's banner (src/app/AppHeader.jsx).`);
}
const footer = sources.get("src/app/AppFooter.jsx");
for (const expected of [
  'mailto:docnikolaj1990@gmail.com?subject=Turku%20Departures%20feedback',
  'issues/new?template=bug_report.yml',
  'https://github.com/MykolaDotsenko/foli-live-departures',
]) {
  if (!footer.includes(expected)) {
    throw new Error(`Missing trust/contact contract in src/app/AppFooter.jsx: ${expected}`);
  }
}

if (!sources.get("README.md").startsWith(`# ${PRODUCT_NAME}\n`)) {
  throw new Error(`README must lead with "# ${PRODUCT_NAME}".`);
}

if (!sources.get("scripts/build-social-card.mjs").includes(PRODUCT_NAME)) {
  throw new Error("Social-card source does not carry the product name.");
}

console.log(`Branding verified: ${PRODUCT_NAME}`);
