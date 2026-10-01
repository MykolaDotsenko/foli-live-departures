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

const REQUEST_TIMEOUT_MS = 7_000;
const NOMINATIM_INTERVAL_MS = 1_100;
const MAX_RESULTS = 5;

/** @type {import("../utils/boundedCache").BoundedCache<string, PlaceSearchResult[]>} */
const cache = createBoundedCache(24);
let nextNominatimAt = 0;

/** @param {AbortSignal | undefined} signal */
function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  const error = new Error("Place search cancelled.");
  error.name = "AbortError";
  throw error;
}

/** @param {unknown} value */
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown[]} values */
function addressParts(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/**
 * Normalize either Photon GeoJSON properties or a Nominatim row into the
 * app's provider-neutral place model.
 *
 * @param {any} raw
 * @returns {PlaceSearchResult | null}
 */
function normalizeResult(raw) {
  const photon = Boolean(raw?.geometry?.coordinates);
  const properties = photon ? raw?.properties || {} : raw || {};
  const coordinates = photon ? raw.geometry.coordinates : null;
  const lat = numberOrNull(photon ? coordinates?.[1] : properties.lat);
  const lon = numberOrNull(photon ? coordinates?.[0] : properties.lon);

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

  const street = String(properties.street || "").trim();
  const houseNumber = String(properties.housenumber || "").trim();
  const streetAddress = [street, houseNumber].filter(Boolean).join(" ");
  const display = String(properties.display_name || "").trim();
  const label = String(
    properties.name ||
      streetAddress ||
      display.split(",")[0] ||
      properties.city ||
      ""
  ).trim();
  if (!label) return null;

  const secondaryLabel = display
    ? display.startsWith(`${label},`)
      ? display.slice(label.length + 1).trim()
      : display
    : addressParts([
        streetAddress !== label ? streetAddress : "",
        properties.district,
        properties.city,
        properties.county,
        properties.state,
        properties.postcode,
        properties.country,
      ]);

  const rawType = String(properties.osm_type || "").trim().toLowerCase();
  const osmType =
    rawType === "n"
      ? "node"
      : rawType === "w"
        ? "way"
        : rawType === "r"
          ? "relation"
          : rawType;
  const osmId = String(properties.osm_id || "").trim();
  const providerId = String(properties.place_id || "").trim();

  return {
    id:
      osmType && osmId
        ? `osm:${osmType}:${osmId}`
        : `${photon ? "photon" : "nominatim"}:${providerId || `${lat},${lon}`}`,
    label,
    secondaryLabel,
    lat,
    lon,
  };
}

/** @param {unknown} rows */
function normalizeResults(rows) {
  /** @type {PlaceSearchResult[]} */
  const results = [];

  for (const raw of Array.isArray(rows) ? rows : []) {
    const item = normalizeResult(raw);
    if (!item || results.some((existing) => existing.id === item.id)) continue;
    results.push(item);
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

/** @param {AbortSignal | undefined} signal */
async function reserveNominatim(signal) {
  abortIfNeeded(signal);
  const now = Date.now();
  const at = Math.max(now, nextNominatimAt);
  nextNominatimAt = at + NOMINATIM_INTERVAL_MS;
  if (at > now) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, at - now));
  }
  abortIfNeeded(signal);
}

/**
 * @param {"photon" | "nominatim"} provider
 * @param {string} query
 * @param {string} language
 * @param {AbortSignal | undefined} signal
 */
async function providerSearch(provider, query, language, signal) {
  const photon = provider === "photon";
  if (!photon) await reserveNominatim(signal);
  else abortIfNeeded(signal);

  const { data } = await client.get(photon ? PHOTON_URL : NOMINATIM_URL, {
    signal,
    timeout: REQUEST_TIMEOUT_MS,
    params: photon
      ? {
          q: query,
          limit: MAX_RESULTS,
          lang: String(language).toLowerCase().startsWith("fi") ? "fi" : "en",
          countrycode: "FI",
          bbox: "21.2,59.9,23.4,61",
          lat: 60.4518,
          lon: 22.2666,
          zoom: 10,
        }
      : {
          q: query,
          format: "jsonv2",
          limit: MAX_RESULTS,
          countrycodes: "fi",
          layer: "address,poi",
          "accept-language": String(language).toLowerCase().startsWith("fi")
            ? "fi,en"
            : "en,fi",
          viewbox: "21.2,61,23.4,59.9",
          bounded: 1,
        },
  });

  return normalizeResults(photon ? data?.features : data);
}

/** @param {unknown} error @param {AbortSignal | undefined} signal */
function rethrowCancellation(error, signal) {
  const failure = /** @type {any} */ (error);
  if (!signal?.aborted && failure?.code !== "ERR_CANCELED") return;
  const aborted = new Error("Place search cancelled.");
  aborted.name = "AbortError";
  throw aborted;
}

/**
 * Explicit-submit address / POI search. Never call this on input change.
 *
 * Photon is primary. An empty/unavailable primary falls back to serialized
 * public Nominatim. Final results are cached only in memory for this tab.
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

  try {
    const primary = await providerSearch("photon", clean, language, signal);
    if (primary.length > 0) {
      cache.set(key, primary);
      return primary;
    }
  } catch (error) {
    rethrowCancellation(error, signal);
  }

  try {
    const fallback = await providerSearch(
      "nominatim",
      clean,
      language,
      signal
    );
    cache.set(key, fallback);
    return fallback;
  } catch (error) {
    rethrowCancellation(error, signal);
    const unavailable = new Error("Place search unavailable.");
    unavailable.name = "PlaceSearchUnavailableError";
    throw unavailable;
  }
}

export function resetPlaceSearchForTests() {
  nextNominatimAt = 0;
  cache.clear();
}
