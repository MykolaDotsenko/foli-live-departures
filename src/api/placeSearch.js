/** @import { PlaceSearchResult } from "../types/journey" */

const DEFAULT_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const SEARCH_URL =
  import.meta.env.VITE_PLACE_SEARCH_URL || DEFAULT_SEARCH_URL;

const CACHE_KEY = "journey-place-search-v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;
const MIN_REQUEST_INTERVAL_MS = 1_100;

let nextAllowedRequestAt = 0;

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizedQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {string} language
 */
function compactCoordinate(value) {
  return String(Number(Number(value).toFixed(6)));
}

/**
 * @param {string} language
 */
function providerLanguages(language) {
  return String(language || "").toLowerCase().startsWith("fi")
    ? "fi,en"
    : "en,fi";
}

/**
 * Session-only cache: repeated searches in one app session do not hit the
 * donated public service again, while destination history is not persisted.
 */
function readCache() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage.getItem(CACHE_KEY));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Cache is an optimization only.
  }
  return [];
}

/**
 * @param {any[]} entries
 */
function writeCache(entries) {
  try {
    globalThis.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify(entries.slice(0, MAX_CACHE_ENTRIES))
    );
  } catch {
    // Search must still work when storage is unavailable.
  }
}

/**
 * @param {string} key
 * @returns {PlaceSearchResult[] | null}
 */
function cachedResults(key) {
  const now = Date.now();
  const entry = readCache().find(
    (item) =>
      item?.key === key &&
      Number.isFinite(Number(item.savedAt)) &&
      now - Number(item.savedAt) <= CACHE_TTL_MS &&
      Array.isArray(item.results)
  );
  return entry ? entry.results : null;
}

/**
 * @param {string} key
 * @param {PlaceSearchResult[]} results
 */
function storeResults(key, results) {
  const current = readCache().filter((item) => item?.key !== key);
  writeCache([{ key, savedAt: Date.now(), results }, ...current]);
}

/**
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 */
function delay(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        const error = new Error("The request was cancelled.");
        error.name = "AbortError";
        reject(error);
      },
      { once: true }
    );
  });
}

/**
 * Public Nominatim requires <= 1 request/second. Calls are explicit-submit
 * only; this guard also protects accidental double-clicks.
 *
 * @param {AbortSignal | undefined} signal
 */
async function waitForRateLimit(signal) {
  const now = Date.now();
  const reservedAt = Math.max(now, nextAllowedRequestAt);
  nextAllowedRequestAt = reservedAt + MIN_REQUEST_INTERVAL_MS;
  await delay(reservedAt - now, signal);
}

/**
 * @param {any} raw
 * @param {string} language
 * @returns {PlaceSearchResult | null}
 */
function normalizeResult(raw, language) {
  const lat = finiteCoordinate(raw?.lat);
  const lon = finiteCoordinate(raw?.lon);
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

  const display = String(raw?.display_name || "").trim();
  const names = raw?.namedetails || {};
  const languageKey = String(language || "").toLowerCase().startsWith("fi")
    ? "name:fi"
    : "name:en";
  const label = String(
    raw?.name ||
      names?.[languageKey] ||
      names?.name ||
      display.split(",")[0] ||
      ""
  ).trim();
  if (!label) return null;

  const secondaryLabel = display
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index) => index > 0 || part !== label)
    .slice(0, 4)
    .join(", ");

  const osmType = String(raw?.osm_type || "").trim();
  const osmId = String(raw?.osm_id || "").trim();
  const placeId = String(raw?.place_id || "").trim();
  const id =
    osmType && osmId
      ? `osm:${osmType}:${osmId}`
      : `nominatim:${placeId || `${lat},${lon}`}`;

  return {
    id,
    label,
    secondaryLabel,
    lat,
    lon,
    category: String(raw?.addresstype || raw?.type || raw?.category || ""),
    provider: "nominatim",
  };
}

/**
 * @param {readonly any[]} stops
 * @returns {string}
 */
export function placeSearchViewbox(stops) {
  const coordinates = (Array.isArray(stops) ? stops : [])
    .map((stop) => ({
      lat: finiteCoordinate(stop?.lat),
      lon: finiteCoordinate(stop?.lon),
    }))
    .filter(
      (point) =>
        point.lat !== null &&
        point.lon !== null &&
        point.lat >= -90 &&
        point.lat <= 90 &&
        point.lon >= -180 &&
        point.lon <= 180
    );

  if (coordinates.length < 2) return "";

  const lats = coordinates.map((point) => point.lat);
  const lons = coordinates.map((point) => point.lon);
  const padding = 0.02;

  const minLat = Math.max(-90, Math.min(...lats) - padding);
  const maxLat = Math.min(90, Math.max(...lats) + padding);
  const minLon = Math.max(-180, Math.min(...lons) - padding);
  const maxLon = Math.min(180, Math.max(...lons) + padding);

  return [minLon, maxLat, maxLon, minLat]
    .map(compactCoordinate)
    .join(",");
}

/**
 * Explicit-submit address / POI search. Never call this on input change.
 *
 * @param {unknown} query
 * @param {{
 *   language?: string,
 *   viewbox?: string,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<PlaceSearchResult[]>}
 */
export async function searchPlaces(
  query,
  { language = "en", viewbox = "", signal } = {}
) {
  const cleanQuery = normalizedQuery(query);
  if (cleanQuery.length < 3) return [];

  const key = [
    cleanQuery.toLocaleLowerCase(),
    language,
    viewbox,
  ].join("|");
  const cached = cachedResults(key);
  if (cached) return cached;

  await waitForRateLimit(signal);

  const url = new globalThis.URL(SEARCH_URL);
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "fi");
  url.searchParams.set("layer", "address,poi");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("accept-language", providerLanguages(language));
  if (viewbox) {
    url.searchParams.set("viewbox", viewbox);
    url.searchParams.set("bounded", "1");
  }

  const response = await globalThis.fetch(url, {
    signal,
    referrerPolicy: "strict-origin-when-cross-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Place search failed (${response.status}).`);
  }

  const payload = await response.json();
  const results = (Array.isArray(payload) ? payload : [])
    .map((item) => normalizeResult(item, language))
    .filter(Boolean)
    .slice(0, 5);

  storeResults(key, results);
  return results;
}

export function resetPlaceSearchForTests() {
  nextAllowedRequestAt = 0;
  try {
    globalThis.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Test cleanup only.
  }
}
