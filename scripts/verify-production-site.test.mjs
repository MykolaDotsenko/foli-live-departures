import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import { stampDeployment } from "./stamp-deployment.mjs";
import { verifyProductionSite } from "./verify-production-site.mjs";

const EXPECTED_SHA = "0123456789abcdef0123456789abcdef01234567";
const STALE_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const BASE_PATH = "/foli-live-departures/";

function fixtureHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
    <title>Turku Departures · Live bus times</title>
    <link rel="manifest" href="${BASE_PATH}manifest.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${BASE_PATH}assets/app.js"></script>
  </body>
</html>`;
}

async function withFixtureServer(
  {
    metadataShas = [EXPECTED_SHA],
    placeSearchEnabled = false,
    missingModule = false,
    missingPrivacy = false,
  } = {},
  run
) {
  let metadataReads = 0;
  let moduleReads = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const send = (status, type, body) => {
      response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    };

    if (url.pathname === BASE_PATH) {
      send(200, "text/html; charset=utf-8", fixtureHtml());
      return;
    }
    if (url.pathname === `${BASE_PATH}deployment.json`) {
      const sha =
        metadataShas[Math.min(metadataReads, metadataShas.length - 1)];
      metadataReads += 1;
      send(200, "application/json", JSON.stringify({ schema: 1, sha }));
      return;
    }
    if (url.pathname === `${BASE_PATH}manifest.webmanifest`) {
      send(
        200,
        "application/manifest+json",
        JSON.stringify({
          name: "Turku Departures",
          display: "standalone",
          start_url: "./",
          scope: "./",
        })
      );
      return;
    }
    if (url.pathname === `${BASE_PATH}assets/app.js`) {
      moduleReads += 1;
      if (missingModule) {
        send(404, "text/plain", "missing");
      } else {
        send(200, "text/javascript", "export const app = true;".padEnd(1_200, " "));
      }
      return;
    }
    if (url.pathname === `${BASE_PATH}sw.js`) {
      send(
        200,
        "text/javascript",
        `const BASE_PATH = ${JSON.stringify(BASE_PATH)};\nconst PRECACHE_URLS = [BASE_PATH];\n`
      );
      return;
    }
    if (url.pathname === `${BASE_PATH}place-search-config.json`) {
      send(
        200,
        "application/json",
        JSON.stringify({ enabled: placeSearchEnabled })
      );
      return;
    }

    if (url.pathname === `${BASE_PATH}privacy.html`) {
      if (missingPrivacy) {
        send(404, "text/plain", "missing");
      } else {
        send(
          200,
          "text/html; charset=utf-8",
          `<!doctype html>
<title>Privacy policy · Turku Departures</title>
<p>No advertising SDK or analytics SDK</p>
<p>does not request Android background-location permission</p>
<p>Transit requests use data.foli.fi</p>
<a href="mailto:docnikolaj1990@gmail.com">Contact</a>`
        );
      }
      return;
    }

    send(404, "text/plain", "not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const siteUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  try {
    return await run({
      siteUrl,
      metadataReads: () => metadataReads,
      moduleReads: () => moduleReads,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("stamps only an exact Git commit SHA into the deploy artifact", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "foli-deploy-"));
  try {
    const outputPath = await stampDeployment({
      sha: EXPECTED_SHA.toUpperCase(),
      outputDir: directory,
    });
    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(payload, { schema: 1, sha: EXPECTED_SHA });
    await assert.rejects(
      stampDeployment({ sha: "master", outputDir: directory }),
      /exact 40-character Git commit SHA/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verifies the live static/PWA contract at the exact revision", async () => {
  await withFixtureServer({}, async ({ siteUrl }) => {
    const result = await verifyProductionSite({
      siteUrl,
      expectedSha: EXPECTED_SHA,
      attempts: 1,
      retryDelayMs: 0,
      fetchTimeoutMs: 1_000,
    });
    assert.equal(result.sha, EXPECTED_SHA);
    assert.equal(result.siteUrl, siteUrl);
  });
});

test("retries while Pages still serves the previous revision", async () => {
  await withFixtureServer(
    { metadataShas: [STALE_SHA, EXPECTED_SHA] },
    async ({ siteUrl, metadataReads }) => {
      await verifyProductionSite({
        siteUrl,
        expectedSha: EXPECTED_SHA,
        attempts: 2,
        retryDelayMs: 1,
        fetchTimeoutMs: 1_000,
      });
      assert.equal(metadataReads(), 2);
    }
  );
});

test("fails closed when the live place-search policy is enabled", async () => {
  await withFixtureServer(
    { placeSearchEnabled: true },
    async ({ siteUrl }) => {
      await assert.rejects(
        verifyProductionSite({
          siteUrl,
          expectedSha: EXPECTED_SHA,
          attempts: 1,
          retryDelayMs: 0,
          fetchTimeoutMs: 1_000,
        }),
        /place-search policy is not fail-closed/
      );
    }
  );
});


test("fails closed when the public Play privacy policy is missing", async () => {
  await withFixtureServer(
    { missingPrivacy: true },
    async ({ siteUrl }) => {
      await assert.rejects(
        verifyProductionSite({
          siteUrl,
          expectedSha: EXPECTED_SHA,
          attempts: 1,
          retryDelayMs: 0,
          fetchTimeoutMs: 1_000,
        }),
        /Production privacy policy returned HTTP 404/
      );
    }
  );
});

test("does not hide a contract failure behind propagation retries after the exact SHA appears", async () => {
  await withFixtureServer(
    { missingModule: true },
    async ({ siteUrl, metadataReads, moduleReads }) => {
      await assert.rejects(
        verifyProductionSite({
          siteUrl,
          expectedSha: EXPECTED_SHA,
          attempts: 3,
          retryDelayMs: 1,
          fetchTimeoutMs: 1_000,
        }),
        /Module entry asset returned HTTP 404/
      );
      assert.equal(metadataReads(), 1);
      assert.equal(moduleReads(), 1);
    }
  );
});
