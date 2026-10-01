import createBoundedCache from "../utils/boundedCache";
import client from "./httpClient";
/** @import { PlaceSearchResult } from "../types/journey" */

const PHOTON_URL =
  import.meta.env.VITE_PHOTON_SEARCH_URL ||
  "https://photon.komoot.io/api";

const REQUEST_TIMEOUT_MS = 7_000;
const MAX_RESULTS = 5;

/** @type {import("../utils/boundedCache").BoundedCache<string, PlaceSearchResult[]>} */
const cache = createBoundedCache(24);

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
 * Normalize Photon GeoJSON into the app's provider-neutral place model.
 *
 * @param {any} raw
 * @returns {PlaceSearchResult | null}
 */
function normalizeResult(raw) {
  const properties = raw?.properties || {};
  const coordinates = raw?.geometry?.coordinates;
  const lat = numberOrNull(coordinates?.[1]);
  const lon = numberOrNull(coordinates?.[0]);

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
  const label = String(
    properties.name ||
      streetAddress ||
      properties.city ||
      ""
  ).trim();
  if (!label) return null;

  const secondaryLabel = addressParts([
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

  return {
    id:
      osmType && osmId
        ? `osm:${osmType}:${osmId}`
        : `photon:${lat},${lon}`,
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
 * Results are cached only in memory for the current tab. No passenger GPS
 * is sent: the location bias is the fixed Turku city centre.
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

  abortIfNeeded(signal);

  try {
    const { data } = await client.get(PHOTON_URL, {
      signal,
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        q: clean,
        limit: MAX_RESULTS,
        lang: String(language).toLowerCase().startsWith("fi") ? "fi" : "en",
        countrycode: "FI",
        bbox: "21.2,59.9,23.4,61",
        lat: 60.4518,
        lon: 22.2666,
        zoom: 10,
      },
    });

    const results = normalizeResults(data?.features);
    cache.set(key, results);
    return results;
  } catch (error) {
    rethrowCancellation(error, signal);
    const unavailable = new Error("Place search unavailable.");
    unavailable.name = "PlaceSearchUnavailableError";
    throw unavailable;
  }
}

export function resetPlaceSearchForTests() {
  cache.clear();
}
