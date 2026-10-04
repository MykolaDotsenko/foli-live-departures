import { normalizeStopQuery } from "../utils/stopSearch";

/**
 * @typedef {{
 *   id: string,
 *   kind: "address",
 *   street: string,
 *   house: string,
 *   title: string,
 *   lat: number,
 *   lon: number,
 *   city: string,
 *   streetKey: string,
 *   addressKey: string,
 * }} PackAddress
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: "street",
 *   street: string,
 *   house: "",
 *   title: string,
 *   lat: number,
 *   lon: number,
 *   city: string,
 *   streetKey: string,
 *   addressKey: string,
 * }} PackStreet
 */

/** @typedef {{ addresses: PackAddress[], streets: PackStreet[] }} ParsedAddressPack */

const PACK_FILE = "addresses/foli-addresses.json";
const ADDRESS_FIELDS = ["street", "house", "lat", "lon", "city"];
const STREET_FIELDS = ["street", "lat", "lon", "city"];

/** @type {Promise<ParsedAddressPack> | null} */
let packPromise = null;

/** @param {unknown} value */
function key(value) {
  return normalizeStopQuery(value);
}

/** @param {any} raw @returns {ParsedAddressPack} */
export function parseAddressPack(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    JSON.stringify(raw.addressFields) !== JSON.stringify(ADDRESS_FIELDS) ||
    JSON.stringify(raw.streetFields) !== JSON.stringify(STREET_FIELDS) ||
    !Array.isArray(raw.addresses) ||
    !Array.isArray(raw.streets)
  ) {
    return { addresses: [], streets: [] };
  }

  /** @type {PackAddress[]} */
  const addresses = [];
  for (const row of raw.addresses) {
    if (!Array.isArray(row)) continue;
    const [street, house, lat, lon, city = ""] = row;
    if (
      typeof street !== "string" ||
      typeof house !== "string" ||
      !street.trim() ||
      !house.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }
    const streetKey = key(street);
    const addressKey = key(`${street} ${house}`);
    const cityText = String(city || "");
    addresses.push({
      id: `address:${streetKey}:${key(house)}:${key(cityText)}`,
      kind: "address",
      street,
      house,
      title: `${street} ${house}`,
      lat,
      lon,
      city: cityText,
      streetKey,
      addressKey,
    });
  }

  /** @type {PackStreet[]} */
  const streets = [];
  for (const row of raw.streets) {
    if (!Array.isArray(row)) continue;
    const [street, lat, lon, city = ""] = row;
    if (
      typeof street !== "string" ||
      !street.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }
    const streetKey = key(street);
    streets.push({
      id: `street:${streetKey}`,
      kind: "street",
      street,
      house: "",
      title: street,
      lat,
      lon,
      city: String(city || ""),
      streetKey,
      addressKey: streetKey,
    });
  }
  return { addresses, streets };
}

/** @returns {Promise<ParsedAddressPack>} */
export function loadAddressPack() {
  if (!packPromise) {
    packPromise = globalThis
      .fetch(`${import.meta.env.BASE_URL}${PACK_FILE}`, {
        credentials: "same-origin",
      })
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        const parsed = parseAddressPack(raw);
        if (parsed.addresses.length === 0 || parsed.streets.length === 0) {
          packPromise = null;
        }
        return parsed;
      })
      .catch(() => {
        packPromise = null;
        return { addresses: [], streets: [] };
      });
  }
  return packPromise;
}

export function resetAddressPackForTests() {
  packPromise = null;
}
