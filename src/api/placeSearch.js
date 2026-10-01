import createBoundedCache from "../utils/boundedCache";
import client from "./httpClient";
/** @import { PlaceSearchResult } from "../types/journey" */

const SEARCH_URL =
  import.meta.env.VITE_PLACE_SEARCH_URL ||
  "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 7_000;
const SEARCH_VIEWBOX = "21.2,61,23.4,59.9";

/** @type {import("../utils/boundedCache").BoundedCache<string, PlaceSearchResult[]>} */
const cache = createBoundedCache(20);
let nextAllowedRequestAt = 0;

/** @param {AbortSignal | undefined} signal */
function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  const error = new Error("Place search cancelled.");
  error.name = "AbortError";
  throw error;
}

/** Public Nominatim allows at most one request per second. */
/** @param {AbortSignal | undefined} signal */
async function reserveRequest(signal) {
  abortIfNeeded(signal);
  const now = Date.now();
  const at = Math.max(now, nextAllowedRequestAt);
  nextAllowedRequestAt = at + MIN_REQUEST_INTERVAL_MS;
  if (at > now) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, at - now));
  }
  abortIfNeeded(signal);
}

/** @param {unknown} value */
function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

  const osmType = String(raw?.osm_type || "").trim();
  const osmId = String(raw?.osm_id || "").trim();
  const placeId = String(raw?.place_id || "").trim();

  return {
    id:
      osmType && osmId
        ? `osm:${osmType}:${osmId}`
        : `nominatim:${placeId || `${lat},${lon}`}`,
    label,
    secondaryLabel: display.startsWith(`${label},`)
      ? display.slice(label.length + 1).trim()
      : display,
    lat,
    lon,
  };
}

/**
 * Explicit-submit address / POI search. Never call this on input change.
 *
 * @param {unknown} query
 * @param {{ language?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<PlaceSearchResult[]>}
 */
export async function searchPlaces(
  query,
  { language = "en", signal } = {}
) {
  const clean = String(query || "").trim().replace(/\s+/g, " ");
  if (clean.length < 3) return [];

  const key = `${clean.toLocaleLowerCase()}|${language}`;
  const cached = cache.get(key);
  if (cached) return cached;

  await reserveRequest(signal);

  try {
    const { data } = await client.get(SEARCH_URL, {
      signal,
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        q: clean,
        format: "jsonv2",
        limit: 5,
        countrycodes: "fi",
        layer: "address,poi",
        "accept-language": String(language).toLowerCase().startsWith("fi")
          ? "fi,en"
          : "en,fi",
        viewbox: SEARCH_VIEWBOX,
        bounded: 1,
      },
    });

    /** @type {PlaceSearchResult[]} */
    const results = [];
    for (const raw of Array.isArray(data) ? data : []) {
      const item = normalizeResult(raw);
      if (item) results.push(item);
      if (results.length >= 5) break;
    }

    cache.set(key, results);
    return results;
  } catch (error) {
    if (signal?.aborted || error?.code === "ERR_CANCELED") {
      const aborted = new Error("Place search cancelled.");
      aborted.name = "AbortError";
      throw aborted;
    }
    if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
      const timeout = new Error("Place search timed out.");
      timeout.name = "PlaceSearchTimeoutError";
      throw timeout;
    }

    const status = Number(error?.response?.status);
    if (Number.isFinite(status) && status > 0) {
      throw new Error(`Place search failed (${status}).`);
    }
    throw error;
  }
}

export function resetPlaceSearchForTests() {
  nextAllowedRequestAt = 0;
  cache.clear();
}
