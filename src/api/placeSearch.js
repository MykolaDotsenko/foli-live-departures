import createBoundedCache from "../utils/boundedCache";
import client from "./httpClient";
/** @import { PlaceSearchResult } from "../types/journey" */

const PHOTON_URL =
  import.meta.env.VITE_PHOTON_SEARCH_URL || "https://photon.komoot.io/api";
const cache = createBoundedCache(24);

/** @param {unknown} value */
function number(value) {
  const parsed = Number(value);
  return value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(parsed)
    ? null
    : parsed;
}

/** @param {any} raw @returns {PlaceSearchResult | null} */
function normalize(raw) {
  const properties = raw?.properties || {};
  const [rawLon, rawLat] = raw?.geometry?.coordinates || [];
  const lat = number(rawLat);
  const lon = number(rawLon);

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
  const house = String(properties.housenumber || "").trim();
  const streetAddress = [street, house].filter(Boolean).join(" ");
  const label = String(
    properties.name || streetAddress || properties.city || ""
  ).trim();
  if (!label) return null;

  const parts = [
    streetAddress !== label ? streetAddress : "",
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const secondaryLabel = [...new Set(parts)].join(", ");
  const rawType = String(properties.osm_type || "").trim().toLowerCase();
  const osmType = { n: "node", w: "way", r: "relation" }[rawType] || rawType;
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

/**
 * Explicit-submit address / POI search. Never call this on input change.
 * Cache is memory-only for the current tab. Passenger GPS is never sent:
 * search bias is a fixed Turku-region coordinate.
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

  if (signal?.aborted) {
    const error = new Error("Place search cancelled.");
    error.name = "AbortError";
    throw error;
  }

  try {
    const { data } = await client.get(PHOTON_URL, {
      signal,
      timeout: 7_000,
      params: {
        q: clean,
        limit: 5,
        lang: String(language).toLowerCase().startsWith("fi") ? "fi" : "en",
        countrycode: "FI",
        bbox: "21.2,59.9,23.4,61",
        lat: 60.4518,
        lon: 22.2666,
        zoom: 10,
      },
    });

    /** @type {PlaceSearchResult[]} */
    const results = [];
    const ids = new Set();

    for (const raw of Array.isArray(data?.features) ? data.features : []) {
      const item = normalize(raw);
      if (!item || ids.has(item.id)) continue;
      ids.add(item.id);
      results.push(item);
      if (results.length === 5) break;
    }

    cache.set(key, results);
    return results;
  } catch (error) {
    const failure = /** @type {any} */ (error);
    if (signal?.aborted || failure?.code === "ERR_CANCELED") {
      const aborted = new Error("Place search cancelled.");
      aborted.name = "AbortError";
      throw aborted;
    }

    const unavailable = new Error("Place search unavailable.");
    unavailable.name = "PlaceSearchUnavailableError";
    throw unavailable;
  }
}

export function resetPlaceSearchForTests() {
  cache.clear();
}
