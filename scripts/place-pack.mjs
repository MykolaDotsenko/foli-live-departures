// The place pack: shops, health care, schools and other named places in
// the Föli area, from OpenStreetMap, shipped with the app so destination
// search can find "Lidl" or "Prisma" without sending the query anywhere.
//
// Shared by the build script (which writes it) and the verifier (which
// fails a release on a malformed or oversized pack).

export const PLACE_PACK_PATH = "public/places/foli-places.json";
export const PLACE_PACK_VERSION = 1;
export const PLACE_PACK_FIELDS = [
  "id",
  "name",
  "lat",
  "lon",
  "street",
  "city",
  "nameSv",
];

// The seven current Föli municipalities, pinned to their OSM administrative
// boundary relation IDs so names such as "Rusko" cannot resolve to a
// namesake outside Finland.
export const FOLI_MUNICIPALITY_RELATIONS = {
  Turku: 399906,
  Kaarina: 2506378,
  Raisio: 2506383,
  Naantali: 2376175,
  Lieto: 2380603,
  Rusko: 2379142,
  Paimio: 2506382,
};
export const FOLI_MUNICIPALITIES = Object.keys(FOLI_MUNICIPALITY_RELATIONS);

// Generous around all seven municipalities (including Naantali's archipelago), for the verifier's sanity check.
export const FOLI_AREA_BOUNDS = {
  south: 60.05,
  north: 60.85,
  west: 21.2,
  east: 23.15,
};

// Raw JSON is fetched once, when the destination field is first used, and
// precached for offline use; keep it a small fraction of the app.
export const MAX_PLACE_PACK_BYTES = 400_000;
export const MIN_PLACE_COUNT = 200;

const SELECTORS = [
  'nwr["shop"~"^(supermarket|convenience|mall|department_store|doityourself|hardware|furniture|electronics|sports|garden_centre|variety_store)$"]["name"]',
  'nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|university|college|school|library|townhall|courthouse|police|post_office|theatre|cinema|arts_centre|community_centre|marketplace|bus_station|ferry_terminal|place_of_worship)$"]["name"]',
  'nwr["leisure"~"^(sports_centre|stadium|ice_rink|water_park)$"]["name"]',
  'nwr["tourism"~"^(museum|attraction|zoo|theme_park|hotel)$"]["name"]',
  'nwr["railway"="station"]["name"]',
  'nwr["aeroway"="aerodrome"]["name"]',
];

/** The Overpass query for every named place of interest in the area. */
export function overpassQuery() {
  const relationIds = Object.values(FOLI_MUNICIPALITY_RELATIONS).join(",");
  const selectors = SELECTORS.map((selector) => `  ${selector}(area.foli);`).join(
    "\n"
  );
  return `[out:json][timeout:180];
rel(id:${relationIds})->.foliRelations;
.foliRelations map_to_area -> .foli;
(
${selectors}
);
out center tags;`;
}

/** @param {unknown} value */
function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {number} value */
function rounded(value) {
  return Math.round(value * 1e5) / 1e5;
}

/** @param {string} value */
function foldKey(value) {
  return value
    .toLocaleLowerCase("fi")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 */
function metersBetween(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * Overpass elements to compact pack rows, deduplicated: a shop mapped both
 * as a point and as its building is one place.
 *
 * @param {any[]} elements
 * @returns {(string | number)[][]}
 */
export function placeRows(elements) {
  /** @type {{ id: string, name: string, lat: number, lon: number, street: string, city: string, nameSv: string }[]} */
  const places = [];

  for (const element of Array.isArray(elements) ? elements : []) {
    const tags = element?.tags || {};
    if (tags.access === "private" || tags.disused || tags["disused:shop"]) continue;
    const name = cleanText(tags.name);
    if (!name || name.length > 80) continue;
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const street = cleanText(
      [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ")
    );
    const nameSv = cleanText(tags["name:sv"]);
    places.push({
      id: `${String(element.type || "n").charAt(0)}${element.id}`,
      name,
      lat: rounded(lat),
      lon: rounded(lon),
      street,
      city: cleanText(tags["addr:city"]),
      nameSv: nameSv && nameSv !== name ? nameSv : "",
    });
  }

  // Richer entries first, so the copy kept of a duplicate has an address.
  places.sort(
    (a, b) =>
      Number(Boolean(b.street)) - Number(Boolean(a.street)) ||
      a.id.localeCompare(b.id)
  );
  /** @type {typeof places} */
  const kept = [];
  for (const place of places) {
    const key = foldKey(place.name);
    const duplicate = kept.some(
      (other) => foldKey(other.name) === key && metersBetween(other, place) < 80
    );
    if (!duplicate) kept.push(place);
  }

  kept.sort(
    (a, b) => a.name.localeCompare(b.name, "fi") || a.id.localeCompare(b.id)
  );
  return kept.map((place) => {
    const row = [
      place.id,
      place.name,
      place.lat,
      place.lon,
      place.street,
      place.city,
      place.nameSv,
    ];
    while (row.length > 4 && row[row.length - 1] === "") row.pop();
    return row;
  });
}

/**
 * @param {(string | number)[][]} rows
 * @param {string} generatedAt
 */
export function placePack(rows, generatedAt) {
  return {
    version: PLACE_PACK_VERSION,
    generatedAt,
    source: "OpenStreetMap, via the Overpass API",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    fields: PLACE_PACK_FIELDS,
    places: rows,
  };
}

/**
 * @param {any} pack
 * @param {number} byteLength
 * @returns {string[]} problems; empty when the pack is fit to ship
 */
export function placePackProblems(pack, byteLength) {
  const problems = [];
  if (!pack || typeof pack !== "object") return ["The place pack is not a JSON object."];
  if (pack.version !== PLACE_PACK_VERSION) {
    problems.push(`Place pack version must be ${PLACE_PACK_VERSION}.`);
  }
  if (pack.license !== "ODbL-1.0" || pack.attribution !== "© OpenStreetMap contributors") {
    problems.push("Place pack must carry its ODbL licence and OpenStreetMap attribution.");
  }
  if (JSON.stringify(pack.fields) !== JSON.stringify(PLACE_PACK_FIELDS)) {
    problems.push("Place pack fields do not match the reader.");
  }
  if (!Number.isFinite(Date.parse(pack.generatedAt))) {
    problems.push("Place pack must say when it was generated.");
  }
  if (byteLength > MAX_PLACE_PACK_BYTES) {
    problems.push(
      `Place pack is ${byteLength} bytes, above the ${MAX_PLACE_PACK_BYTES}-byte budget.`
    );
  }
  const places = Array.isArray(pack.places) ? pack.places : [];
  if (places.length < MIN_PLACE_COUNT) {
    problems.push(
      `Place pack has ${places.length} places; a real Föli-area extract has at least ${MIN_PLACE_COUNT}.`
    );
  }
  const ids = new Set();
  for (const row of places) {
    const [id, name, lat, lon] = Array.isArray(row) ? row : [];
    if (typeof id !== "string" || !id || ids.has(id)) {
      problems.push(`Place pack row has a missing or repeated id: ${JSON.stringify(row)}`);
      break;
    }
    ids.add(id);
    if (typeof name !== "string" || !name.trim()) {
      problems.push(`Place pack row ${id} has no name.`);
      break;
    }
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < FOLI_AREA_BOUNDS.south ||
      lat > FOLI_AREA_BOUNDS.north ||
      lon < FOLI_AREA_BOUNDS.west ||
      lon > FOLI_AREA_BOUNDS.east
    ) {
      problems.push(`Place pack row ${id} lies outside the Föli area.`);
      break;
    }
  }
  return problems;
}
