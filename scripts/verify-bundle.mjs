import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS_DIR = path.resolve("dist/assets");

// Raw bytes still matter for parse/execution and accidental dependency growth.
// The previous 600 kB ceiling had <1% headroom after intentional production
// hardening, so the release gate now keeps ~5% measured headroom rather than
// forcing changes whose only effect is satisfying an arbitrary cliff.
const MAX_TOTAL_JS_CSS_BYTES = 625_000;

// Transfer size is the second independent invariant. GitHub Pages/CDNs may use
// Brotli or gzip depending on the client; deterministic level-9 gzip gives CI
// a stable conservative signal without relying on network behaviour.
const MAX_TOTAL_GZIP_JS_CSS_BYTES = 180_000;

const files = await readdir(ASSETS_DIR);
let total = 0;
let gzipTotal = 0;
const measured = [];

for (const file of files) {
  if (!/\.(?:js|css)$/.test(file)) continue;

  const filePath = path.join(ASSETS_DIR, file);
  const [metadata, content] = await Promise.all([
    stat(filePath),
    readFile(filePath),
  ]);
  const gzipBytes = gzipSync(content, { level: 9 }).byteLength;

  total += metadata.size;
  gzipTotal += gzipBytes;
  measured.push({
    file,
    rawBytes: metadata.size,
    gzipBytes,
  });
}

if (total > MAX_TOTAL_JS_CSS_BYTES) {
  throw new Error(
    `Production JS/CSS is ${total} raw bytes, above the ${MAX_TOTAL_JS_CSS_BYTES}-byte release budget.`
  );
}

if (gzipTotal > MAX_TOTAL_GZIP_JS_CSS_BYTES) {
  throw new Error(
    `Production JS/CSS is ${gzipTotal} gzip bytes, above the ${MAX_TOTAL_GZIP_JS_CSS_BYTES}-byte transfer budget.`
  );
}

for (const entry of measured.sort((a, b) => b.rawBytes - a.rawBytes)) {
  console.log(
    `  ${entry.file}: ${entry.rawBytes} raw / ${entry.gzipBytes} gzip bytes`
  );
}

console.log(
  `Production JS/CSS budgets: ${total} / ${MAX_TOTAL_JS_CSS_BYTES} raw bytes; ${gzipTotal} / ${MAX_TOTAL_GZIP_JS_CSS_BYTES} gzip bytes.`
);
