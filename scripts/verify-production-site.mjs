import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

class RetriableDeploymentError extends Error {}

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function normalizeSiteUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Production site URL must use HTTP or HTTPS.");
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function exactSha(value) {
  const sha = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("EXPECTED_DEPLOYMENT_SHA must be an exact 40-character Git commit SHA.");
  }
  return sha;
}

function attribute(tag, name) {
  const match = String(tag).match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i")
  );
  return match?.[2] || "";
}

function tags(html, name) {
  return String(html).match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

function sameAppUrl(reference, baseUrl, label) {
  const url = new URL(reference, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    throw new Error(`${label} resolves outside the deployed app scope: ${url.href}`);
  }
  return url;
}

function cacheBusted(url, sha, attempt) {
  const next = new URL(url);
  next.searchParams.set("__production_smoke", `${sha.slice(0, 12)}-${attempt}`);
  return next;
}

async function fetchRequired(
  url,
  { label, timeoutMs, retriable = true }
) {
  const Failure = retriable ? RetriableDeploymentError : Error;
  let response;
  try {
    response = await globalThis.fetch(url, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      signal: globalThis.AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new Failure(
      `${label} could not be fetched from production: ${cause?.message || cause}`
    );
  }

  if (!response.ok) {
    throw new Failure(
      `${label} returned HTTP ${response.status} from production.`
    );
  }
  return response;
}

async function verifyOnce({ baseUrl, expectedSha, attempt, fetchTimeoutMs }) {
  const metadataUrl = cacheBusted(
    new URL("deployment.json", baseUrl),
    expectedSha,
    attempt
  );
  const metadataResponse = await fetchRequired(metadataUrl, {
    label: "Deployment metadata",
    timeoutMs: fetchTimeoutMs,
  });

  let metadata;
  try {
    metadata = await metadataResponse.json();
  } catch {
    throw new RetriableDeploymentError(
      "Production deployment metadata is not valid JSON yet."
    );
  }

  if (metadata?.schema !== 1 || metadata?.sha !== expectedSha) {
    throw new RetriableDeploymentError(
      `Production still serves revision ${metadata?.sha || "unknown"}; expected ${expectedSha}.`
    );
  }

  // Once the exact metadata revision is visible, all remaining failures are
  // treated as real contract failures rather than propagation lag.
  const htmlResponse = await fetchRequired(
    cacheBusted(baseUrl, expectedSha, attempt),
    { label: "Production app shell", timeoutMs: fetchTimeoutMs, retriable: false }
  );
  const html = await htmlResponse.text();
  if (!/text\/html/i.test(htmlResponse.headers.get("content-type") || "")) {
    throw new Error("Production app shell is not served as HTML.");
  }
  if (!html.includes("<title>Turku Departures") || !html.includes('id="root"')) {
    throw new Error("Production app shell does not contain the expected Turku Departures root.");
  }

  const cspMeta = tags(html, "meta").find(
    (tag) => attribute(tag, "http-equiv").toLowerCase() === "content-security-policy"
  );
  const csp = attribute(cspMeta, "content");
  if (!csp || !csp.includes("default-src 'self'")) {
    throw new Error("Production app shell is missing the shipped Content-Security-Policy.");
  }

  const manifestTag = tags(html, "link").find((tag) =>
    attribute(tag, "rel")
      .toLowerCase()
      .split(/\s+/)
      .includes("manifest")
  );
  const manifestHref = attribute(manifestTag, "href");
  if (!manifestHref) {
    throw new Error("Production app shell has no web app manifest link.");
  }
  const manifestUrl = sameAppUrl(manifestHref, baseUrl, "Manifest");
  const manifestResponse = await fetchRequired(
    cacheBusted(manifestUrl, expectedSha, attempt),
    { label: "Web app manifest", timeoutMs: fetchTimeoutMs, retriable: false }
  );
  const manifest = await manifestResponse.json();
  if (
    manifest?.name !== "Turku Departures" ||
    manifest?.display !== "standalone" ||
    manifest?.start_url !== "./" ||
    manifest?.scope !== "./"
  ) {
    throw new Error("Production manifest no longer matches the install contract.");
  }

  const moduleTag = tags(html, "script").find(
    (tag) => attribute(tag, "type").toLowerCase() === "module" && attribute(tag, "src")
  );
  const moduleSrc = attribute(moduleTag, "src");
  if (!moduleSrc) {
    throw new Error("Production app shell has no module entry asset.");
  }
  const moduleUrl = sameAppUrl(moduleSrc, baseUrl, "Module entry asset");
  const moduleResponse = await fetchRequired(moduleUrl, {
    label: "Module entry asset",
    timeoutMs: fetchTimeoutMs,
    retriable: false,
  });
  const moduleSource = await moduleResponse.text();
  if (moduleSource.length < 1_000) {
    throw new Error("Production module entry asset is unexpectedly small.");
  }

  const serviceWorkerUrl = cacheBusted(
    new URL("sw.js", baseUrl),
    expectedSha,
    attempt
  );
  const serviceWorker = await (
    await fetchRequired(serviceWorkerUrl, {
      label: "Service worker",
      timeoutMs: fetchTimeoutMs,
      retriable: false,
    })
  ).text();
  if (
    !serviceWorker.includes(`const BASE_PATH = ${JSON.stringify(baseUrl.pathname)};`) ||
    !serviceWorker.includes("const PRECACHE_URLS = [")
  ) {
    throw new Error("Production service worker does not match the deployed base path/PWA contract.");
  }

  const placeConfigUrl = cacheBusted(
    new URL("place-search-config.json", baseUrl),
    expectedSha,
    attempt
  );
  const placeConfig = await (
    await fetchRequired(placeConfigUrl, {
      label: "Production place-search policy",
      timeoutMs: fetchTimeoutMs,
      retriable: false,
    })
  ).json();
  if (placeConfig?.enabled !== false) {
    throw new Error("Production place-search policy is not fail-closed.");
  }

  const privacyUrl = cacheBusted(
    new URL("privacy.html", baseUrl),
    expectedSha,
    attempt
  );
  const privacyResponse = await fetchRequired(privacyUrl, {
    label: "Production privacy policy",
    timeoutMs: fetchTimeoutMs,
    retriable: false,
  });
  const privacyHtml = await privacyResponse.text();
  if (!/text\/html/i.test(privacyResponse.headers.get("content-type") || "")) {
    throw new Error("Production privacy policy is not served as HTML.");
  }
  for (const required of [
    "<title>Privacy policy · Turku Departures</title>",
    "No advertising SDK or analytics SDK",
    "does not request Android background-location permission",
    "data.foli.fi",
    "docnikolaj1990@gmail.com",
  ]) {
    if (!privacyHtml.includes(required)) {
      throw new Error(
        `Production privacy policy is missing required disclosure: ${required}`
      );
    }
  }

  return {
    sha: expectedSha,
    siteUrl: baseUrl.href,
    moduleUrl: moduleUrl.href,
  };
}

/**
 * Verify the exact static revision now served by production.
 *
 * @param {{
 *   siteUrl: string,
 *   expectedSha: string,
 *   expectedSiteUrl?: string,
 *   attempts?: number,
 *   retryDelayMs?: number,
 *   fetchTimeoutMs?: number,
 * }} options
 */
export async function verifyProductionSite({
  siteUrl,
  expectedSha,
  expectedSiteUrl = "",
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  if (expectedSiteUrl) {
    const configuredUrl = normalizeSiteUrl(expectedSiteUrl);
    if (baseUrl.href !== configuredUrl.href) {
      throw new Error(
        `Production smoke URL ${baseUrl.href} does not match configured production site ${configuredUrl.href}.`
      );
    }
  }
  const sha = exactSha(expectedSha);
  const tries = Number(attempts);
  if (!Number.isInteger(tries) || tries < 1) {
    throw new Error("Production smoke attempts must be a positive integer.");
  }

  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await verifyOnce({
        baseUrl,
        expectedSha: sha,
        attempt,
        fetchTimeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetriableDeploymentError) || attempt === tries) {
        throw error;
      }
      await delay(retryDelayMs);
    }
  }

  throw lastError || new Error("Production site verification failed.");
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const { loadProductionSiteConfig } = await import("./production-site-config.mjs");
  const production = loadProductionSiteConfig();
  const result = await verifyProductionSite({
    siteUrl: process.env.PRODUCTION_SITE_URL || "",
    expectedSha: process.env.EXPECTED_DEPLOYMENT_SHA || "",
    expectedSiteUrl: production.siteUrl,
  });
  console.log(
    `Verified production ${result.siteUrl} at exact revision ${result.sha}.`
  );
}
