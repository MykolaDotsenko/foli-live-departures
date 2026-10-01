import createBoundedCache from "../utils/boundedCache";
import client from "./httpClient";
/** @import { PlaceSearchResult } from "../types/journey" */

const PHOTON =
  import.meta.env.VITE_PHOTON_SEARCH_URL || "https://photon.komoot.io/api";
const NOMINATIM =
  import.meta.env.VITE_NOMINATIM_SEARCH_URL ||
  import.meta.env.VITE_PLACE_SEARCH_URL ||
  "https://nominatim.openstreetmap.org/search";

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
function text(value) {
  return String(value || "").trim();
}

/** @param {unknown} value */
function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {any} raw
 * @returns {PlaceSearchResult | null}
 */
function normalize(raw) {
  const photon = Array.isArray(raw?.geometry?.coordinates);
  const properties = photon ? raw?.properties || {} : raw || {};
  const coordinates = photon
    ? raw.geometry.coordinates
    : [properties.lon, properties.lat];
  const lon = coordinate(coordinates[0]);
  const lat = coordinate(coordinates[1]);

  if (
    lat === null ||
    lon === null ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return null;
  }

  const street = [text(properties.street), text(properties.housenumber)]
    .filter(Boolean)
    .join(" ");
  const display = text(properties.display_name);
  const label =
    text(properties.name) ||
    street ||
    text(display.split(",")[0]) ||
    text(properties.city);
  if (!label) return null;

  const secondaryLabel = display
    ? display.startsWith(`${label},`)
      ? display.slice(label.length + 1).trim()
      : display
    : [
        street !== label ? street : "",
        properties.district,
        properties.city,
        properties.postcode,
        properties.country,
      ]
        .map(text)
        .filter(Boolean)
        .join(", ");

  const rawType = text(properties.osm_type).toLowerCase();
  const osmType = { n: "node", w: "way", r: "relation" }[rawType] || rawType;
  const osmId = text(properties.osm_id);
  const providerId = text(properties.place_id);

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
function normalizeRows(rows) {
  /** @type {PlaceSearchResult[]} */
  const results = [];
  const ids = new Set();

  for (const raw of Array.isArray(rows) ? rows : []) {
    const item = normalize(raw);
    if (!item || ids.has(item.id)) continue;
    ids.add(item.id);
    results.push(item);
    if (results.length === 5) break;
  }

  return results;
}

/**
 * @param {"photon" | "nominatim"} provider
 * @param {string} query
 * @param {string} language
 * @param {AbortSignal | undefined} signal
 */
async function providerSearch(provider, query, language, signal) {
  const photon = provider === "photon";
  abortIfNeeded(signal);

  if (!photon) {
    const now = Date.now();
    const at = Math.max(now, nextNominatimAt);
    nextNominatimAt = at + 1_100;
    if (at > now) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, at - now));
    }
    abortIfNeeded(signal);
  }

  const finnish = String(language).toLowerCase().startsWith("fi");
  const { data } = await client.get(photon ? PHOTON : NOMINATIM, {
    signal,
    timeout: 7_000,
    params: photon
      ? {
          q: query,
          limit: 5,
          lang: finnish ? "fi" : "en",
          countrycode: "FI",
          bbox: "21.2,59.9,23.4,61",
          lat: 60.4518,
          lon: 22.2666,
        }
      : {
          q: query,
          format: "jsonv2",
          limit: 5,
          countrycodes: "fi",
          layer: "address,poi",
          "accept-language": finnish ? "fi,en" : "en,fi",
          viewbox: "21.2,61,23.4,59.9",
          bounded: 1,
        },
  });

  return normalizeRows(photon ? data?.features : data);
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
 * Explicit-submit address / POI search. Photon is primary; Nominatim is the
 * rate-limited fallback. Results are cached only in memory for this tab.
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
    if (primary.length) {
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
