import { loadRuntimeConfig } from "../utils/runtimeConfig";

const MIN_QUERY_LENGTH = 3;
const MIN_REQUEST_INTERVAL_MS = 1_100;
const SESSION_CACHE_KEY = "foli-place-search-cache-v1";
const MAX_CACHE_ENTRIES = 20;

let lastRequestAtMs = 0;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   lat: number,
 *   lon: number,
 *   category: string,
 *   source: "nominatim",
 * }} GeocodedPlace
 */

function normalizeQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cacheKey(query) {
  return query.toLocaleLowerCase();
}

function readCache() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    const entries = Object.entries(cache).slice(-MAX_CACHE_ENTRIES);
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // Session caching is an optimization; search still works without storage.
  }
}

async function respectRateLimit(signal) {
  const waitMs = Math.max(
    0,
    MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAtMs)
  );
  if (waitMs <= 0) return;

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, waitMs);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        const error = new Error("The request was cancelled.");
        error.name = "AbortError";
        reject(error);
      },
      { once: true }
    );
  });
}

function parseCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

/**
 * @param {any} item
 * @returns {GeocodedPlace | null}
 */
function normalizeNominatimResult(item) {
  const lat = parseCoordinate(item?.lat, -90, 90);
  const lon = parseCoordinate(item?.lon, -180, 180);
  const osmType = String(item?.osm_type || "").trim();
  const osmId = String(item?.osm_id || "").trim();
  const displayName = String(item?.display_name || "").trim();
  const name = String(item?.name || "").trim();

  if (
    lat === null ||
    lon === null ||
    !osmType ||
    !osmId ||
    !displayName
  ) {
    return null;
  }

  return {
    id: `nominatim:${osmType}:${osmId}`,
    label: name || displayName.split(",")[0].trim() || displayName,
    description: displayName,
    lat,
    lon,
    category: String(item?.type || item?.addresstype || "").trim(),
    source: "nominatim",
  };
}

/**
 * Explicit user-triggered search only. Do not call from input/change handlers:
 * the public Nominatim policy prohibits client-side autocomplete.
 *
 * @param {unknown} rawQuery
 * @param {{ language?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<GeocodedPlace[]>}
 */
export async function searchPlaces(
  rawQuery,
  { language = "fi,en", signal } = {}
) {
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return [];

  const cached = readCache();
  const key = cacheKey(query);
  if (Array.isArray(cached[key])) return cached[key];

  const runtime = await loadRuntimeConfig(signal);
  const config = runtime.geocoder;
  if (!config.enabled || config.provider !== "nominatim") {
    const error = new Error("Place search is disabled.");
    error.code = "GEOCODER_DISABLED";
    throw error;
  }

  await respectRateLimit(signal);
  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  const url = new URL("/search", config.baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("limit", String(config.resultLimit));
  url.searchParams.set("accept-language", String(language || "fi,en"));

  if (config.countryCodes.length > 0) {
    url.searchParams.set("countrycodes", config.countryCodes.join(","));
  }
  if (config.viewbox) {
    url.searchParams.set("viewbox", config.viewbox);
    url.searchParams.set("bounded", "0");
  }

  lastRequestAtMs = Date.now();
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  if (!response.ok) {
    throw new Error("Place search is temporarily unavailable.");
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Invalid place-search response.");
  }

  const results = payload
    .map(normalizeNominatimResult)
    .filter(Boolean)
    .slice(0, config.resultLimit);

  const nextCache = {
    ...cached,
    [key]: results,
  };
  writeCache(nextCache);
  return results;
}

export function resetPlaceSearchForTests() {
  lastRequestAtMs = 0;
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Test helper only.
  }
}
