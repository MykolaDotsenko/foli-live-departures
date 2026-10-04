import { distanceInMeters, hasCoordinates } from "./geo";
import { bearingDegrees, radarPoint } from "./stopRadar";

/** @import { ParsedAddressPack, PackAddress } from "../api/addressPack" */

/** @typedef {Map<string, PackAddress[]>} RadarContextIndex */
/** @typedef {[string, {x:number,y:number}, {x:number,y:number}, number, number]} RoadCue */

const CELL_DEGREES = 0.006;
const MAX_CONTEXT_METERS = 500;
const MAX_BUILDINGS = 40;
const MAX_ROADS = 6;
const MIN_ROAD_SPAN_METERS = 24;

/** @param {number} value */
function cell(value) {
  return Math.floor(value / CELL_DEGREES);
}

/** @param {number} lat @param {number} lon */
function key(lat, lon) {
  return `${lat}:${lon}`;
}

/** @param {number} value */
function crisp(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Compact grid for the address data already shipped by destination search.
 * @param {ParsedAddressPack | null | undefined} pack
 * @returns {RadarContextIndex}
 */
export function createRadarContextIndex(pack) {
  /** @type {RadarContextIndex} */
  const index = new Map();
  for (const item of pack?.addresses || []) {
    if (!hasCoordinates(item)) continue;
    const id = key(cell(item.lat), cell(item.lon));
    const bucket = index.get(id);
    if (bucket) bucket.push(item);
    else index.set(id, [item]);
  }
  return index;
}

/**
 * @param {RadarContextIndex} index
 * @param {{lat:number,lon:number}} origin
 * @param {number} radius
 */
function nearby(index, origin, radius) {
  const centerLat = cell(origin.lat);
  const centerLon = cell(origin.lon);
  const result = [];

  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      for (const item of index.get(key(centerLat + y, centerLon + x)) || []) {
        const raw = distanceInMeters(origin, item);
        if (!Number.isFinite(raw) || Number(raw) > radius) continue;
        result.push({ item, distanceMeters: Number(raw) });
      }
    }
  }
  return result.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * @param {{lat:number,lon:number}} origin
 * @param {PackAddress} item
 * @param {number|null} heading
 * @param {number} range
 */
function point(origin, item, heading, range) {
  const bearing = bearingDegrees(origin, item);
  const distance = distanceInMeters(origin, item);
  if (!Number.isFinite(bearing) || !Number.isFinite(distance)) return null;
  return radarPoint(Number(bearing), heading, Number(distance), range);
}

/**
 * @param {RadarContextIndex} index
 * @param {{lat:number,lon:number}|null|undefined} target
 */
function nearestStreet(index, target) {
  if (!hasCoordinates(target)) return "";
  const origin = { lat: Number(target?.lat), lon: Number(target?.lon) };
  return String(nearby(index, origin, 160)[0]?.item?.street || "");
}

/**
 * @param {string} street
 * @param {{item:PackAddress,distanceMeters:number}[]} entries
 * @param {{lat:number,lon:number}} origin
 * @param {number|null} heading
 * @param {number} range
 * @returns {RoadCue | null}
 */
function roadFor(street, entries, origin, heading, range) {
  if (entries.length < 2) return null;

  const first = entries[0];
  let second = null;
  let span = 0;
  for (const candidate of entries.slice(1)) {
    const raw = distanceInMeters(first.item, candidate.item);
    if (Number.isFinite(raw) && Number(raw) > span) {
      span = Number(raw);
      second = candidate;
    }
  }
  if (!second || span < MIN_ROAD_SPAN_METERS) return null;

  const a = point(origin, first.item, heading, range);
  const b = point(origin, second.item, heading, range);
  return a && b
    ? [street, a, b, entries[0].distanceMeters, entries.length]
    : null;
}

/**
 * Approximate orientation context. It reuses the shipped address pack and
 * emits two compact SVG paths rather than dozens of React SVG children.
 *
 * @param {RadarContextIndex | null | undefined} index
 * @param {{lat:number,lon:number}|null|undefined} position
 * @param {{lat:number,lon:number}|null|undefined} target
 * @param {number|null} heading
 * @param {number} range
 */
export function buildRadarContext(index, position, target, heading, range) {
  const empty = { buildingPath: "", roadPath: "", targetStreet: "" };
  if (
    !(index instanceof Map) ||
    !hasCoordinates(position) ||
    !Number.isFinite(range) ||
    Number(range) <= 0
  ) {
    return empty;
  }

  const origin = {
    lat: Number(position?.lat),
    lon: Number(position?.lon),
  };
  const radarRange = Number(range);
  const entries = nearby(
    index,
    origin,
    Math.min(MAX_CONTEXT_METERS, Math.max(120, radarRange * 1.2))
  );
  const targetStreet = nearestStreet(index, target);

  const streets = new Map();
  for (const entry of entries) {
    const name = String(entry.item.street || "");
    if (!name) continue;
    const group = streets.get(name);
    if (group) group.push(entry);
    else streets.set(name, [entry]);
  }

  /** @type {RoadCue[]} */
  const roads = [];
  for (const [street, group] of streets) {
    const road = roadFor(street, group, origin, heading, radarRange);
    if (road) roads.push(road);
  }
  roads.sort(
    (a, b) =>
      Number(b[0] === targetStreet) - Number(a[0] === targetStreet) ||
      a[3] - b[3] ||
      b[4] - a[4]
  );

  const roadPath = roads
    .slice(0, MAX_ROADS)
    .map(
      (road) =>
        `M${crisp(road[1].x)} ${crisp(road[1].y)}L${crisp(road[2].x)} ${crisp(road[2].y)}`
    )
    .join("");

  const seen = new Set();
  const size =
    radarRange <= 100 ? 2.8 : radarRange <= 200 ? 2.2 : radarRange <= 400 ? 1.7 : 1.2;
  let buildingPath = "";
  let count = 0;
  for (const entry of entries) {
    if (entry.distanceMeters > radarRange) continue;
    const p = point(origin, entry.item, heading, radarRange);
    if (!p) continue;
    const block = `${Math.round(p.x / 3)}:${Math.round(p.y / 3)}`;
    if (seen.has(block)) continue;
    seen.add(block);
    const x = crisp(p.x - size / 2);
    const y = crisp(p.y - size / 2);
    buildingPath += `M${x} ${y}h${size}v${size}h-${size}z`;
    count += 1;
    if (count >= MAX_BUILDINGS) break;
  }

  return { buildingPath, roadPath, targetStreet };
}
