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
// individual lazy asset independently. The complete-app raw budget has two
// reviewed feature allocations: 625,000 → 632,000 bytes for on-device POI
// search, then 632,000 → 640,000 bytes for the offline address search,
// journey-confidence and route-diversity layer (2026-10-04). The latter build
// measured 637,070 raw bytes before that allocation.
//
// The stop-radar offline street/building context is emitted as compact SVG
// paths from its lazy chunk. After optimization the complete app measures
// 180,520 gzip bytes, so the reviewed complete-app cap is tightened from the
// earlier 182,000 allocation to 181,000 bytes. The eager startup transfer cap
// remains unchanged at 180,000 bytes.
//
// The stop-radar walking fixes (2026-10-04: street axes along each street's
// addresses, direction of travel at walking pace, arrival hysteresis,
// throttled screen-reader guidance, focus on open and on "Open target stop",
// a wake lock while guiding, a stale last fix through background pauses)
// measure 181,011–181,082 gzip bytes; master measured 180,498–180,525 in the
// same three-build sample. CSS module names are allocated in processing
// order, which moves the gzip total by about ±40 bytes from build to build,
// so the reviewed cap is 181,300 bytes. Raw bytes stay inside 640,000.
//
// The passenger-clarity pass (2026-10-04: a language picker listing every
// language in its own name instead of a button cycling through them, which
// keeps the latest choice while a pack loads, a confirmation after ★, a
// compact refresh icon, "You're near" at the stop on an accurate fix,
// plain-language copy and hints by the stop radar and the get-off alert's
// Start) measures 641,720–641,768 raw and 181,831–181,905 gzip bytes; master
// measured 639,293–639,429 raw and 181,017–181,053 gzip in the same session.
// The reviewed caps are 642,500 raw and 182,100 gzip bytes.
const MAX_SHIPPED_JS_CSS_BYTES = 642_500;
const MAX_SHIPPED_GZIP_JS_CSS_BYTES = 182_100;
const MAX_LAZY_ASSET_BYTES = 125_000;
const MAX_LAZY_ASSET_GZIP_BYTES = 45_000;

// Locale strings are generated from the canonical source dictionaries into
// same-origin JSON packs. They are not executable code, but moving them out
// of JS must not make translation growth invisible to release QA.
// The 2026-10-04 offline-address/confidence/final-walk release added reviewed
// FI/SV/UK copy and measured 182,592 raw locale bytes. Keep a small bounded
// headroom without changing the gzip transfer gate.
const MAX_LOCALE_PACK_RAW_BYTES = 185_000;
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
