import { distanceInMeters, hasCoordinates } from "./geo";
import { bearingDegrees, radarPoint } from "./stopRadar";

/** @import { ParsedAddressPack, PackAddress } from "../api/addressPack" */

/** @typedef {Map<string, PackAddress[]>} RadarContextIndex */
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

  const usedStreets = new Set();
  let roadPath = "";
  let roadCount = 0;
  for (let i = 0; i < entries.length && roadCount < MAX_ROADS; i += 1) {
    const first = entries[i];
    const street = String(first.item.street || "");
    if (!street || usedStreets.has(street)) continue;

    let second = null;
    for (let j = i + 1; j < entries.length; j += 1) {
      const candidate = entries[j];
      if (candidate.item.street !== street) continue;
      const span = distanceInMeters(first.item, candidate.item);
      if (Number.isFinite(span) && Number(span) >= MIN_ROAD_SPAN_METERS) {
        second = candidate;
        break;
      }
    }
    if (!second) continue;

    const a = point(origin, first.item, heading, radarRange);
    const b = point(origin, second.item, heading, radarRange);
    if (!a || !b) continue;

    roadPath += `M${crisp(a.x)} ${crisp(a.y)}L${crisp(b.x)} ${crisp(b.y)}`;
    usedStreets.add(street);
    roadCount += 1;
  }

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
