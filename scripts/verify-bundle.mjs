import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DIST_DIR = path.resolve("dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");
const MANIFEST_PATH = path.join(DIST_DIR, ".vite", "manifest.json");

// The original release budgets remain the startup invariant: only code/styles
// in the static import graph are parsed before the passenger can use the app.
const MAX_EAGER_JS_CSS_BYTES = 625_000;
const MAX_EAGER_GZIP_JS_CSS_BYTES = 180_000;

// Optional language packs may load on demand, but code splitting must not hide
// unbounded growth. These caps cover the complete shipped JS/CSS set and each
// individual lazy asset independently. The complete-app raw budget was raised
// once, from 625,000 to 632,000 bytes, for on-device place search (destination
// suggestions from the shipped OpenStreetMap place pack, 2026-10-04): about
// 5 KB of code and styles. Startup and gzip budgets stay unchanged.
const MAX_SHIPPED_JS_CSS_BYTES = 632_000;
const MAX_SHIPPED_GZIP_JS_CSS_BYTES = 180_000;
const MAX_LAZY_ASSET_BYTES = 125_000;
const MAX_LAZY_ASSET_GZIP_BYTES = 45_000;

// Locale strings are generated from the canonical source dictionaries into
// same-origin JSON packs. They are not executable code, but moving them out
// of JS must not make translation growth invisible to release QA.
const MAX_LOCALE_PACK_RAW_BYTES = 180_000;
const MAX_LOCALE_PACK_GZIP_BYTES = 55_000;

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry);
if (!entryKey) {
  throw new Error("Vite manifest has no application entry; bundle budget cannot be verified.");
}

const eagerFiles = new Set();
const visited = new Set();

function collectStaticGraph(key) {
  if (visited.has(key)) return;
  visited.add(key);

  const item = manifest[key];
  if (!item) {
    throw new Error(`Vite manifest references missing static import ${key}.`);
  }

  if (item.file && /\.(?:js|css)$/.test(item.file)) eagerFiles.add(item.file);
  for (const css of item.css || []) {
    if (/\.css$/.test(css)) eagerFiles.add(css);
  }
  for (const imported of item.imports || []) collectStaticGraph(imported);
}

collectStaticGraph(entryKey);

const files = await readdir(ASSETS_DIR);
let shippedRaw = 0;
let shippedGzip = 0;
let eagerRaw = 0;
let eagerGzip = 0;
const measured = [];

for (const file of files) {
  if (!/\.(?:js|css)$/.test(file)) continue;

  const filePath = path.join(ASSETS_DIR, file);
  const [metadata, body] = await Promise.all([stat(filePath), readFile(filePath)]);
  const gzipBytes = gzipSync(body, { level: 9 }).byteLength;
  const manifestPath = `assets/${file}`;
  const eager = eagerFiles.has(manifestPath);

  shippedRaw += metadata.size;
  shippedGzip += gzipBytes;
  if (eager) {
    eagerRaw += metadata.size;
    eagerGzip += gzipBytes;
  } else if (
    metadata.size > MAX_LAZY_ASSET_BYTES ||
    gzipBytes > MAX_LAZY_ASSET_GZIP_BYTES
  ) {
    throw new Error(
      `Lazy asset ${manifestPath} is ${metadata.size} raw / ${gzipBytes} gzip bytes; ` +
        `limits are ${MAX_LAZY_ASSET_BYTES} raw / ${MAX_LAZY_ASSET_GZIP_BYTES} gzip.`
    );
  }

  measured.push({ file, rawBytes: metadata.size, gzipBytes, eager });
}

if (eagerRaw > MAX_EAGER_JS_CSS_BYTES) {
  throw new Error(
    `Eager production JS/CSS is ${eagerRaw} raw bytes, above the ${MAX_EAGER_JS_CSS_BYTES}-byte startup budget.`
  );
}
if (eagerGzip > MAX_EAGER_GZIP_JS_CSS_BYTES) {
  throw new Error(
    `Eager production JS/CSS is ${eagerGzip} gzip bytes, above the ${MAX_EAGER_GZIP_JS_CSS_BYTES}-byte startup transfer budget.`
  );
}
if (shippedRaw > MAX_SHIPPED_JS_CSS_BYTES) {
  throw new Error(
    `Shipped production JS/CSS is ${shippedRaw} raw bytes, above the ${MAX_SHIPPED_JS_CSS_BYTES}-byte complete-app budget.`
  );
}
if (shippedGzip > MAX_SHIPPED_GZIP_JS_CSS_BYTES) {
  throw new Error(
    `Shipped production JS/CSS is ${shippedGzip} gzip bytes, above the ${MAX_SHIPPED_GZIP_JS_CSS_BYTES}-byte complete-app transfer budget.`
  );
}

const localeDir = path.join(DIST_DIR, "locales");
const localeFiles = await readdir(localeDir);
let localeRaw = 0;
let localeGzip = 0;

for (const file of localeFiles) {
  // Count the shared source-key table as part of the same unchanged locale
  // budget. Deduplicating keys is an optimization, not a way to move bytes
  // outside the release gate.
  if (!/^(?:keys|[a-z]{2})\.json$/.test(file)) continue;
  const body = await readFile(path.join(localeDir, file));
  localeRaw += body.byteLength;
  localeGzip += gzipSync(body, { level: 9 }).byteLength;
}

if (localeRaw > MAX_LOCALE_PACK_RAW_BYTES) {
  throw new Error(
    `Locale packs are ${localeRaw} raw bytes, above the ${MAX_LOCALE_PACK_RAW_BYTES}-byte locale budget.`
  );
}
if (localeGzip > MAX_LOCALE_PACK_GZIP_BYTES) {
  throw new Error(
    `Locale packs are ${localeGzip} gzip bytes, above the ${MAX_LOCALE_PACK_GZIP_BYTES}-byte locale transfer budget.`
  );
}

for (const entry of measured.sort((a, b) => b.rawBytes - a.rawBytes)) {
  console.log(
    `  ${entry.file}: ${entry.rawBytes} raw / ${entry.gzipBytes} gzip bytes (${entry.eager ? "eager" : "lazy"})`
  );
}

console.log(
  `Startup JS/CSS budgets: ${eagerRaw} / ${MAX_EAGER_JS_CSS_BYTES} raw; ` +
    `${eagerGzip} / ${MAX_EAGER_GZIP_JS_CSS_BYTES} gzip. ` +
    `Complete shipped JS/CSS: ${shippedRaw} / ${MAX_SHIPPED_JS_CSS_BYTES} raw; ` +
    `${shippedGzip} / ${MAX_SHIPPED_GZIP_JS_CSS_BYTES} gzip. ` +
    `Locale packs: ${localeRaw} / ${MAX_LOCALE_PACK_RAW_BYTES} raw; ` +
    `${localeGzip} / ${MAX_LOCALE_PACK_GZIP_BYTES} gzip.`
);
