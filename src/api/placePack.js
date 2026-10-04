import { normalizeStopQuery } from "../utils/stopSearch";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   lat: number,
 *   lon: number,
 *   street: string,
 *   city: string,
 *   nameSv: string,
 *   nameWords: string[],
 *   otherWords: string[],
 * }} PackPlace
 */

// Shops, health care, schools and other named places in the Föli area from
// OpenStreetMap (scripts/build-place-pack.mjs). The file ships with the app
// and is precached, so a query never leaves the phone and works offline.
const PACK_FILE = "places/foli-places.json";
const FIELDS = ["id", "name", "lat", "lon", "street", "city", "nameSv"];

/** @type {Promise<PackPlace[]> | null} */
let packPromise = null;

/** @param {string} text */
function words(text) {
  return normalizeStopQuery(text)
    .split(/[\s,.:;/()&-]+/)
    .filter(Boolean);
}

/**
 * @param {any} raw
 * @returns {PackPlace[]}
 */
export function parsePlacePack(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    JSON.stringify(raw.fields) !== JSON.stringify(FIELDS) ||
    !Array.isArray(raw.places)
  ) {
    return [];
  }

  /** @type {PackPlace[]} */
  const places = [];
  for (const row of raw.places) {
    if (!Array.isArray(row)) continue;
    const [id, name, lat, lon, street = "", city = "", nameSv = ""] = row;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }
    places.push({
      id,
      name,
      lat,
      lon,
      street: String(street || ""),
      city: String(city || ""),
      nameSv: String(nameSv || ""),
      nameWords: [...words(name), ...words(String(nameSv || ""))],
      otherWords: [...words(String(street || "")), ...words(String(city || ""))],
    });
  }
  return places;
}

/**
 * Loaded once, the first time the destination field is used. A failed
 * load (offline before the app was ever opened online) is tried again on
 * the next use rather than remembered.
 *
 * @returns {Promise<PackPlace[]>}
 */
export function loadPlacePack() {
  if (!packPromise) {
    packPromise = globalThis
      .fetch(`${import.meta.env.BASE_URL}${PACK_FILE}`, {
        credentials: "same-origin",
      })
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        const places = parsePlacePack(raw);
        if (places.length === 0) packPromise = null;
        return places;
      })
      .catch(() => {
        packPromise = null;
        return [];
      });
  }
  return packPromise;
}

/** Test-only reset of the module-level cache. */
export function resetPlacePackForTests() {
  packPromise = null;
}
