/** @import { PlaceSearchResult } from "../types/journey" */

const SEARCH_URL =
  import.meta.env.VITE_PLACE_SEARCH_URL ||
  "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1_100;
const MAX_CACHE_ENTRIES = 20;

/** @type {Map<string, PlaceSearchResult[]>} */
const cache = new Map();
let nextAllowedRequestAt = 0;

/** @param {unknown} value */
function cleanQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** @param {unknown} value */
function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Public Nominatim allows at most one request per second. */
/** @param {AbortSignal | undefined} signal */
async function reserveRequest(signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const now = Date.now();
  const at = Math.max(now, nextAllowedRequestAt);
  nextAllowedRequestAt = at + MIN_REQUEST_INTERVAL_MS;
  if (at > now) {
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, at - now)
    );
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

/** @param {string} key @param {PlaceSearchResult[]} results */
function cacheSet(key, results) {
  cache.delete(key);
  cache.set(key, results);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

/** @param {any} raw @returns {PlaceSearchResult | null} */
function normalizeResult(raw) {
  const lat = coordinate(raw?.lat);
  const lon = coordinate(raw?.lon);
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
  const label = String(raw?.name || display.split(",")[0] || "").trim();
  if (!label) return null;

  const secondaryLabel = display.startsWith(`${label},`)
    ? display.slice(label.length + 1).trim()
    : display;

  const osmType = String(raw?.osm_type || "").trim();
  const osmId = String(raw?.osm_id || "").trim();
  const placeId = String(raw?.place_id || "").trim();

  return {
    id:
      osmType && osmId
        ? `osm:${osmType}:${osmId}`
        : `nominatim:${placeId || `${lat},${lon}`}`,
    label,
    secondaryLabel,
    lat,
    lon,
  };
}

/**
 * @param {readonly any[]} stops
 * @returns {string}
 */
export function placeSearchViewbox(stops) {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  let count = 0;

  for (const stop of Array.isArray(stops) ? stops : []) {
    const lat = coordinate(stop?.lat);
    const lon = coordinate(stop?.lon);
    if (
      lat === null ||
      lon === null ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      continue;
    }
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    count += 1;
  }

  if (count < 2) return "";

  /** @param {number} value */
  const compact = (value) => String(Number(value.toFixed(6)));
  return [
    Math.max(-180, minLon - 0.02),
    Math.min(90, maxLat + 0.02),
    Math.min(180, maxLon + 0.02),
    Math.max(-90, minLat - 0.02),
  ]
    .map(compact)
    .join(",");
}

/**
 * Explicit-submit address / POI search. Never call this on input change.
 *
 * @param {unknown} query
 * @param {{ language?: string, viewbox?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<PlaceSearchResult[]>}
 */
export async function searchPlaces(
  query,
  { language = "en", viewbox = "", signal } = {}
) {
  const clean = cleanQuery(query);
  if (clean.length < 3) return [];

  const key = `${clean.toLocaleLowerCase()}|${language}|${viewbox}`;
  const cached = cache.get(key);
  if (cached) return cached;

  await reserveRequest(signal);

  const url = new globalThis.URL(SEARCH_URL);
  url.searchParams.set("q", clean);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "fi");
  url.searchParams.set("layer", "address,poi");
  url.searchParams.set(
    "accept-language",
    String(language).toLowerCase().startsWith("fi") ? "fi,en" : "en,fi"
  );
  if (viewbox) {
    url.searchParams.set("viewbox", viewbox);
    url.searchParams.set("bounded", "1");
  }

  const response = await globalThis.fetch(url, {
    signal,
    referrerPolicy: "strict-origin-when-cross-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Place search failed (${response.status}).`);
  }

  const payload = await response.json();
  /** @type {PlaceSearchResult[]} */
  const results = [];
  for (const raw of Array.isArray(payload) ? payload : []) {
    const item = normalizeResult(raw);
    if (item) results.push(item);
    if (results.length >= 5) break;
  }

  cacheSet(key, results);
  return results;
}

export function resetPlaceSearchForTests() {
  nextAllowedRequestAt = 0;
  cache.clear();
}
