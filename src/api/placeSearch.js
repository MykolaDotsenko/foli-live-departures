/** @import { PlaceSearchResult } from "../types/journey" */

const CONFIG_FILE = "place-search-config.json";
const CACHE_KEY = "foli-place-search-cache-v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 20;
const MIN_REQUEST_INTERVAL_MS = 1_100;

let configPromise = null;
let lastNetworkStartedAt = 0;
/** @type {Promise<unknown>} */
let networkTail = Promise.resolve();
/** @type {Map<string, Promise<PlaceSearchResult[]>>} */
const inFlight = new Map();

/**
 * @typedef {{
 *   enabled: boolean,
 *   endpoint: string,
 *   countrycodes: string,
 *   viewbox: [number, number, number, number] | null,
 *   limit: number,
 * }} PlaceSearchConfig
 */

/** @param {unknown} value */
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown} value */
function normalizedQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** @returns {PlaceSearchConfig} */
function disabledConfig() {
  return {
    enabled: false,
    endpoint: "",
    countrycodes: "fi",
    viewbox: null,
    limit: 5,
  };
}

/**
 * @param {unknown} raw
 * @returns {PlaceSearchConfig}
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return disabledConfig();

  const endpoint = String(raw.endpoint || "").trim();
  let url;
  try {
    url = new globalThis.URL(endpoint);
  } catch {
    return disabledConfig();
  }

  if (url.protocol !== "https:") return disabledConfig();

  const rawViewbox = Array.isArray(raw.viewbox) ? raw.viewbox : [];
  const viewbox =
    rawViewbox.length === 4 &&
    rawViewbox.every((value) => finite(value) !== null)
      ? /** @type {[number, number, number, number]} */ (
          rawViewbox.map(Number)
        )
      : null;

  const requestedLimit = Number(raw.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(5, Math.max(1, requestedLimit))
    : 5;

  return {
    enabled: raw.enabled === true,
    endpoint: url.href,
    countrycodes: String(raw.countrycodes || "fi")
      .trim()
      .toLowerCase(),
    viewbox,
    limit,
  };
}

/**
 * Runtime config is intentionally same-origin and not precached. It lets the
 * static site disable or repoint public place search without changing the JS
 * bundle.
 *
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<PlaceSearchConfig>}
 */
export async function loadPlaceSearchConfig(signal) {
  if (!configPromise) {
    const url = `${import.meta.env.BASE_URL}${CONFIG_FILE}`;
    configPromise = globalThis.fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return disabledConfig();
        return normalizeConfig(await response.json());
      })
      .catch(() => disabledConfig());
  }

  const config = await configPromise;
  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    throw error;
  }
  return config;
}

/**
 * @returns {{ query: string, savedAt: number, results: PlaceSearchResult[] }[]}
 */
function readCache() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(CACHE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.query === "string" &&
        Number.isFinite(Number(entry.savedAt)) &&
        now - Number(entry.savedAt) <= CACHE_TTL_MS &&
        Array.isArray(entry.results)
    );
  } catch {
    return [];
  }
}

/**
 * @param {string} query
 * @param {PlaceSearchResult[]} results
 */
function writeCache(query, results) {
  try {
    const entries = readCache().filter((entry) => entry.query !== query);
    entries.unshift({ query, savedAt: Date.now(), results });
    globalThis.sessionStorage?.setItem(
      CACHE_KEY,
      JSON.stringify(entries.slice(0, CACHE_LIMIT))
    );
  } catch {
    // Private browsing / blocked storage must never break destination search.
  }
}

/** @param {string} query */
function cachedResults(query) {
  return readCache().find((entry) => entry.query === query)?.results || null;
}

/**
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 */
async function wait(ms, signal) {
  if (ms <= 0) return;
  await new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Public Nominatim requires single-threaded use and an absolute maximum of
 * one request per second. Serializing the whole network task prevents two
 * different explicit searches from waking from the same delay and starting
 * together.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<T>}
 */
async function runSerializedNetwork(task, signal) {
  const run = networkTail
    .catch(() => undefined)
    .then(async () => {
      if (signal?.aborted) {
        const error = new Error("The request was cancelled.");
        error.name = "AbortError";
        throw error;
      }

      const waitMs =
        lastNetworkStartedAt + MIN_REQUEST_INTERVAL_MS - Date.now();
      await wait(waitMs, signal);

      if (signal?.aborted) {
        const error = new Error("The request was cancelled.");
        error.name = "AbortError";
        throw error;
      }

      lastNetworkStartedAt = Date.now();
      return task();
    });

  networkTail = run.catch(() => undefined);
  return run;
}

/**
 * @param {any} row
 * @returns {PlaceSearchResult | null}
 */
function normalizeResult(row) {
  const lat = finite(row?.lat);
  const lon = finite(row?.lon);
  if (
    lat === null ||
    lon === null ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  const osmType = String(row?.osm_type || "").trim().toLowerCase();
  const osmId = String(row?.osm_id || "").trim();
  const placeId = String(row?.place_id || "").trim();
  const id = osmType && osmId ? `${osmType}:${osmId}` : `place:${placeId}`;
  if (!id || id === "place:") return null;

  const displayName = String(row?.display_name || "").trim();
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const names = row?.namedetails && typeof row.namedetails === "object"
    ? row.namedetails
    : {};
  const address = row?.address && typeof row.address === "object"
    ? row.address
    : {};

  const title = String(
    names.name ||
      address.shop ||
      address.amenity ||
      address.tourism ||
      address.leisure ||
      address.office ||
      address.building ||
      parts[0] ||
      displayName
  ).trim();

  if (!title) return null;

  const subtitleParts =
    parts[0]?.toLocaleLowerCase() === title.toLocaleLowerCase()
      ? parts.slice(1)
      : parts;

  return {
    id,
    title,
    subtitle: subtitleParts.slice(0, 4).join(", "),
    lat,
    lon,
    category: String(row?.category || row?.class || ""),
    type: String(row?.addresstype || row?.type || ""),
    provider: "nominatim",
    licence: String(row?.licence || ""),
  };
}

/**
 * Explicit-submit only. Never call from input/change handlers.
 *
 * @param {unknown} value
 * @param {{ signal?: AbortSignal, language?: string }} [options]
 * @returns {Promise<PlaceSearchResult[]>}
 */
export async function searchPlaces(value, options = {}) {
  const query = normalizedQuery(value);
  if (query.length < 3) return [];

  const languageKey = String(options.language || "").trim().toLowerCase();
  const cacheKey = `${query.toLowerCase()}|${languageKey}`;
  const cached = cachedResults(cacheKey);
  if (cached) return cached;

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = (async () => {
    const config = await loadPlaceSearchConfig(options.signal);
    if (!config.enabled || !config.endpoint) return [];

    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      namedetails: "1",
      limit: String(config.limit),
    });

    if (config.countrycodes) {
      params.set("countrycodes", config.countrycodes);
    }
    if (config.viewbox) {
      params.set("viewbox", config.viewbox.join(","));
      // Bias toward the Föli region without making out-of-box Finnish places
      // impossible to resolve.
      params.set("bounded", "0");
    }
    if (options.language) {
      params.set("accept-language", options.language);
    }

    const requestUrl = new globalThis.URL(config.endpoint);
    requestUrl.search = params.toString();

    const results = await runSerializedNetwork(async () => {
      const response = await globalThis.fetch(requestUrl.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        signal: options.signal,
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Place search failed with HTTP ${response.status}.`
        );
      }

      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : [];
      return rows
        .map(normalizeResult)
        .filter(Boolean)
        .slice(0, config.limit);
    }, options.signal);

    writeCache(cacheKey, results);
    return results;
  })();

  inFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
  }
}

/** Test-only reset for module-level rate/config state. */
export function resetPlaceSearchForTests() {
  configPromise = null;
  lastNetworkStartedAt = 0;
  networkTail = Promise.resolve();
  inFlight.clear();
  try {
    globalThis.sessionStorage?.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
