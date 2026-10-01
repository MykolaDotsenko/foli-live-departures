import createBoundedCache from "../utils/boundedCache";
import client from "./httpClient";
/** @import { PlaceSearchResult } from "../types/journey" */

const PHOTON_URL =
  import.meta.env.VITE_PHOTON_SEARCH_URL ||
  "https://photon.komoot.io/api";
const NOMINATIM_URL =
  import.meta.env.VITE_NOMINATIM_SEARCH_URL ||
  import.meta.env.VITE_PLACE_SEARCH_URL ||
  "https://nominatim.openstreetmap.org/search";

const NOMINATIM_MIN_REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_RESULTS = 5;

// Turku / Raisio / Kaarina and the surrounding Föli area. Photon uses
// minLon,minLat,maxLon,maxLat. Nominatim uses left,top,right,bottom.
const SEARCH_BBOX = "21.2,59.9,23.4,61";
const NOMINATIM_VIEWBOX = "21.2,61,23.4,59.9";
const TURKU_BIAS = { lat: 60.4518, lon: 22.2666 };

/** @type {import("../utils/boundedCache").BoundedCache<string, PlaceSearchResult[]>} */
const cache = createBoundedCache(24);
let nextAllowedNominatimAt = 0;

/** @param {AbortSignal | undefined} signal */
function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  const error = new Error("Place search cancelled.");
  error.name = "AbortError";
  throw error;
}

/** @param {unknown} value */
function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown[]} values */
function compactAddress(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/** @param {unknown} value */
function photonOsmType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "n") return "node";
  if (type === "w") return "way";
  if (type === "r") return "relation";
  return type || "feature";
}

/**
 * @param {any} raw
 * @returns {PlaceSearchResult | null}
 */
function normalizePhotonResult(raw) {
  const coordinates = Array.isArray(raw?.geometry?.coordinates)
    ? raw.geometry.coordinates
    : [];
  const lon = coordinate(coordinates[0]);
  const lat = coordinate(coordinates[1]);
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

  const properties = raw?.properties || {};
  const street = String(properties.street || "").trim();
  const houseNumber = String(properties.housenumber || "").trim();
  const streetAddress = [street, houseNumber].filter(Boolean).join(" ");
  const label = String(
    properties.name || streetAddress || properties.city || ""
  ).trim();
  if (!label) return null;

  const secondaryLabel = compactAddress([
    streetAddress && streetAddress !== label ? streetAddress : "",
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ]);

  const osmId = String(properties.osm_id || "").trim();
  const osmType = photonOsmType(properties.osm_type);

  return {
    id: osmId
      ? `osm:${osmType}:${osmId}`
      : `photon:${lat},${lon}`,
    label,
    secondaryLabel,
    lat,
    lon,
  };
}

/**
 * @param {any} raw
 * @returns {PlaceSearchResult | null}
 */
function normalizeNominatimResult(raw) {
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
 * @param {unknown[]} raw
 * @param {(value: any) => PlaceSearchResult | null} normalize
 */
function normalizeMany(raw, normalize) {
  /** @type {PlaceSearchResult[]} */
  const results = [];
  const seen = new Set();

  for (const value of Array.isArray(raw) ? raw : []) {
    const item = normalize(value);
    if (!item) continue;

    // A provider may return the same OSM object through more than one index
    // representation. Avoid making the passenger choose duplicate cards.
    const key = `${item.id}|${item.lat.toFixed(5)}|${item.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

/**
 * Photon is the primary public browser-side provider. Search happens only
 * after the passenger explicitly submits a query; we deliberately do not
 * use its search-as-you-type capability.
 *
 * @param {string} clean
 * @param {string} language
 * @param {AbortSignal | undefined} signal
 */
async function searchPhoton(clean, language, signal) {
  abortIfNeeded(signal);
  const { data } = await client.get(PHOTON_URL, {
    signal,
    timeout: REQUEST_TIMEOUT_MS,
    params: {
      q: clean,
      limit: MAX_RESULTS,
      lang: String(language).toLowerCase().startsWith("fi") ? "fi" : "en",
      countrycode: "FI",
      bbox: SEARCH_BBOX,
      lat: TURKU_BIAS.lat,
      lon: TURKU_BIAS.lon,
      zoom: 10,
    },
  });

  return normalizeMany(data?.features, normalizePhotonResult);
}

/** Public Nominatim allows at most one request per second. */
/** @param {AbortSignal | undefined} signal */
async function reserveNominatimRequest(signal) {
  abortIfNeeded(signal);
  const now = Date.now();
  const at = Math.max(now, nextAllowedNominatimAt);
  nextAllowedNominatimAt = at + NOMINATIM_MIN_REQUEST_INTERVAL_MS;

  if (at > now) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, at - now));
  }
  abortIfNeeded(signal);
}

/**
 * Nominatim is a fallback only. It is never called from input change and is
 * globally serialized to stay inside the public service usage policy.
 *
 * @param {string} clean
 * @param {string} language
 * @param {AbortSignal | undefined} signal
 */
async function searchNominatim(clean, language, signal) {
  await reserveNominatimRequest(signal);

  const { data } = await client.get(NOMINATIM_URL, {
    signal,
    timeout: REQUEST_TIMEOUT_MS,
    params: {
      q: clean,
      format: "jsonv2",
      limit: MAX_RESULTS,
      countrycodes: "fi",
      layer: "address,poi",
      "accept-language": String(language).toLowerCase().startsWith("fi")
        ? "fi,en"
        : "en,fi",
      viewbox: NOMINATIM_VIEWBOX,
      bounded: 1,
    },
  });

  return normalizeMany(data, normalizeNominatimResult);
}

/**
 * @param {unknown} error
 * @param {AbortSignal | undefined} signal
 */
function rethrowCancellation(error, signal) {
  const failure = /** @type {any} */ (error);
  if (signal?.aborted || failure?.code === "ERR_CANCELED") {
    const aborted = new Error("Place search cancelled.");
    aborted.name = "AbortError";
    throw aborted;
  }
}

/** @param {unknown} error */
function providerFailure(error) {
  const failure = /** @type {any} */ (error);
  if (
    failure?.code === "ECONNABORTED" ||
    failure?.code === "ETIMEDOUT"
  ) {
    return "timeout";
  }

  const status = Number(failure?.response?.status);
  if (Number.isFinite(status) && status > 0) {
    return `http-${status}`;
  }

  return "network";
}

/**
 * Explicit-submit address / POI search. Never call this on input change.
 *
 * Photon is tried first. When it returns no useful match or is unavailable,
 * one rate-limited Nominatim request is used as a fallback. The final result
 * is cached in memory for the current tab only; search history is not
 * persisted to Web Storage.
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

  /** @type {unknown} */
  let photonError = null;

  try {
    const photonResults = await searchPhoton(clean, language, signal);
    if (photonResults.length > 0) {
      cache.set(key, photonResults);
      return photonResults;
    }
  } catch (error) {
    rethrowCancellation(error, signal);
    photonError = error;
  }

  try {
    const fallbackResults = await searchNominatim(clean, language, signal);
    cache.set(key, fallbackResults);
    return fallbackResults;
  } catch (error) {
    rethrowCancellation(error, signal);

    const photonReason = photonError ? providerFailure(photonError) : "empty";
    const fallbackReason = providerFailure(error);
    const failure = new Error(
      `Place search unavailable (primary: ${photonReason}; fallback: ${fallbackReason}).`
    );
    failure.name = "PlaceSearchUnavailableError";
    throw failure;
  }
}

export function resetPlaceSearchForTests() {
  nextAllowedNominatimAt = 0;
  cache.clear();
}
