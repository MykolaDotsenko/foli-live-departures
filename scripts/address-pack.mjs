import {
  FOLI_AREA_BOUNDS,
  FOLI_MUNICIPALITY_RELATIONS,
} from "./place-pack.mjs";

export const ADDRESS_PACK_PATH = "public/addresses/foli-addresses.json";
export const ADDRESS_PACK_VERSION = 1;
export const ADDRESS_FIELDS = ["street", "house", "lat", "lon", "city"];
export const STREET_FIELDS = ["street", "lat", "lon", "city"];
export const MAX_ADDRESS_PACK_BYTES = 5_000_000;
export const MIN_ADDRESS_COUNT = 5_000;
export const MIN_STREET_COUNT = 400;

export function addressOverpassQuery() {
  const relationIds = Object.values(FOLI_MUNICIPALITY_RELATIONS).join(",");
  return `[out:json][timeout:240];
rel(id:${relationIds})->.foliRelations;
.foliRelations map_to_area -> .foli;
(
  nwr["addr:street"]["addr:housenumber"](area.foli);
  way["highway"]["name"](area.foli);
);
out center tags;`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function rounded(value) {
  return Math.round(value * 1e5) / 1e5;
}

function fold(value) {
  return clean(value)
    .toLocaleLowerCase("fi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function addressRows(elements) {
  const addresses = new Map();
  const streets = new Map();

  for (const element of Array.isArray(elements) ? elements : []) {
    const tags = element?.tags || {};
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const addressStreet = clean(tags["addr:street"]);
    const house = clean(tags["addr:housenumber"]);
    const city = clean(tags["addr:city"]);
    if (addressStreet && house) {
      const key = `${fold(addressStreet)}\u0000${fold(house)}\u0000${fold(city)}`;
      if (!addresses.has(key)) {
        addresses.set(key, [
          addressStreet,
          house,
          rounded(lat),
          rounded(lon),
          city,
        ]);
      }
    }

    const roadStreet = clean(tags.highway ? tags.name : "");
    if (roadStreet) {
      const key = fold(roadStreet);
      if (!streets.has(key)) {
        streets.set(key, [roadStreet, rounded(lat), rounded(lon), city]);
      }
    }
  }

  const addressList = [...addresses.values()].sort(
    (a, b) =>
      String(a[0]).localeCompare(String(b[0]), "fi", { numeric: true }) ||
      String(a[1]).localeCompare(String(b[1]), "fi", { numeric: true })
  );
  const streetList = [...streets.values()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), "fi")
  );
  return { addresses: addressList, streets: streetList };
}

export function addressPack(rows, generatedAt) {
  return {
    version: ADDRESS_PACK_VERSION,
    generatedAt,
    source: "OpenStreetMap, via the Overpass API",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    addressFields: ADDRESS_FIELDS,
    streetFields: STREET_FIELDS,
    addresses: rows.addresses,
    streets: rows.streets,
  };
}

function validCoordinate(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= FOLI_AREA_BOUNDS.south &&
    lat <= FOLI_AREA_BOUNDS.north &&
    lon >= FOLI_AREA_BOUNDS.west &&
    lon <= FOLI_AREA_BOUNDS.east
  );
}

export function addressPackProblems(pack, byteLength) {
  const problems = [];
  if (!pack || typeof pack !== "object") return ["The address pack is not a JSON object."];
  if (pack.version !== ADDRESS_PACK_VERSION) problems.push("Address pack version is invalid.");
  if (pack.license !== "ODbL-1.0" || pack.attribution !== "© OpenStreetMap contributors") {
    problems.push("Address pack must carry ODbL licence and OpenStreetMap attribution.");
  }
  if (JSON.stringify(pack.addressFields) !== JSON.stringify(ADDRESS_FIELDS)) {
    problems.push("Address fields do not match the reader.");
  }
  if (JSON.stringify(pack.streetFields) !== JSON.stringify(STREET_FIELDS)) {
    problems.push("Street fields do not match the reader.");
  }
  if (!Number.isFinite(Date.parse(pack.generatedAt))) problems.push("Address pack has no valid generatedAt.");
  if (byteLength > MAX_ADDRESS_PACK_BYTES) {
    problems.push(`Address pack is ${byteLength} bytes, above ${MAX_ADDRESS_PACK_BYTES}.`);
  }

  const addresses = Array.isArray(pack.addresses) ? pack.addresses : [];
  const streets = Array.isArray(pack.streets) ? pack.streets : [];
  if (addresses.length < MIN_ADDRESS_COUNT) {
    problems.push(`Address pack has only ${addresses.length} addresses.`);
  }
  if (streets.length < MIN_STREET_COUNT) {
    problems.push(`Address pack has only ${streets.length} streets.`);
  }

  const addressKeys = new Set();
  for (const row of addresses) {
    const [street, house, lat, lon, city = ""] = Array.isArray(row) ? row : [];
    const key = `${fold(street)}\u0000${fold(house)}\u0000${fold(city)}`;
    if (!street || !house || addressKeys.has(key) || !validCoordinate(lat, lon)) {
      problems.push(`Invalid or duplicate address row: ${JSON.stringify(row)}`);
      break;
    }
    addressKeys.add(key);
  }

  const streetKeys = new Set();
  for (const row of streets) {
    const [street, lat, lon] = Array.isArray(row) ? row : [];
    const key = fold(street);
    if (!street || streetKeys.has(key) || !validCoordinate(lat, lon)) {
      problems.push(`Invalid or duplicate street row: ${JSON.stringify(row)}`);
      break;
    }
    streetKeys.add(key);
  }
  return problems;
}
