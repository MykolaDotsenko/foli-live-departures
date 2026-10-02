import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("production build metadata records the exact versioned origin/base path", async () => {
  const source = fs.readFileSync("scripts/build-production-site.mjs", "utf8");
  assert.match(source, /dist\/\.production-site\.json/);
  assert.match(source, /basePath: config\.basePath/);
  assert.match(source, /siteUrl: config\.siteUrl/);

  const verifier = fs.readFileSync("scripts/verify-pwa.mjs", "utf8");
  assert.match(verifier, /\.production-site\.json/);
  assert.match(verifier, /productionBuild\?\.basePath \|\| envBasePath \|\| "\/"/);
  assert.match(verifier, /PWA verification base-path mismatch/);
  assert.match(verifier, /site\.pathname !== BASE_PATH/);
});

test("production metadata remains build-output-only, not a public source file", () => {
  assert.equal(fs.existsSync("public/.production-site.json"), false);
  assert.equal(fs.existsSync("src/.production-site.json"), false);
});
