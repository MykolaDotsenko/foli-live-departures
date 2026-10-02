import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadProductionSiteConfig,
  validateProductionSiteConfig,
} from "./production-site-config.mjs";

const current = {
  schema: 1,
  provider: "github-pages",
  siteUrl: "https://mykoladotsenko.github.io/foli-live-departures/",
  basePath: "/foli-live-departures/",
  customDomain: null,
  legacySiteUrls: [],
};

test("accepts the current GitHub Pages project-path contract", () => {
  assert.deepEqual(validateProductionSiteConfig(current), current);
});

test("accepts a root custom-domain cutover only with matching CNAME and legacy origin", () => {
  const result = validateProductionSiteConfig(
    {
      ...current,
      siteUrl: "https://departures.example/",
      basePath: "/",
      customDomain: "departures.example",
      legacySiteUrls: [current.siteUrl],
    },
    { cname: "departures.example\n" }
  );
  assert.equal(result.siteUrl, "https://departures.example/");
  assert.equal(result.basePath, "/");
  assert.equal(result.customDomain, "departures.example");
});

test("rejects unsafe or inconsistent cutover configurations", () => {
  assert.throws(
    () =>
      validateProductionSiteConfig({
        ...current,
        siteUrl: "http://example.test/foli-live-departures/",
      }),
    /HTTPS/
  );
  assert.throws(
    () =>
      validateProductionSiteConfig({
        ...current,
        siteUrl: "https://mykoladotsenko.github.io/",
      }),
    /does not match basePath/
  );
  assert.throws(
    () =>
      validateProductionSiteConfig(
        {
          ...current,
          siteUrl: "https://departures.example/",
          basePath: "/",
          customDomain: "departures.example",
          legacySiteUrls: [current.siteUrl],
        },
        { cname: "wrong.example" }
      ),
    /CNAME/
  );
  assert.throws(
    () =>
      validateProductionSiteConfig(
        {
          ...current,
          siteUrl: "https://departures.example/app/",
          basePath: "/app/",
          customDomain: "departures.example",
          legacySiteUrls: [current.siteUrl],
        },
        { cname: "departures.example" }
      ),
    /root basePath/
  );
});

test("loadProductionSiteConfig enforces CNAME state from disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foli-prod-site-"));
  try {
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(root, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "config/production-site.json"),
      JSON.stringify({
        ...current,
        siteUrl: "https://departures.example/",
        basePath: "/",
        customDomain: "departures.example",
        legacySiteUrls: [current.siteUrl],
      })
    );
    assert.throws(() => loadProductionSiteConfig(root), /CNAME/);
    fs.writeFileSync(path.join(root, "public/CNAME"), "departures.example\n");
    assert.equal(loadProductionSiteConfig(root).customDomain, "departures.example");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
