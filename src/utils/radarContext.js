import { distanceInMeters, hasCoordinates } from "./geo";
import { bearingDegrees, radarPoint } from "./stopRadar";

/** @import { ParsedAddressPack, PackAddress } from "../api/addressPack" */
/** @typedef {Map<string, PackAddress[]>} RadarContextIndex */

const CELL_DEGREES = 0.006;

/** @param {number} value */
function cell(value) {
  return Math.floor(value / CELL_DEGREES);
}

/** @param {number} lat @param {number} lon */
function key(lat, lon) {
  return `${lat}:${lon}`;
}

/**
 * Index the already-shipped OSM address points once. The radar then reads only
 * the surrounding cells instead of scanning the complete pack on every fix.
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
  const lat = cell(origin.lat);
  const lon = cell(origin.lon);
  const result = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      for (const item of index.get(key(lat + y, lon + x)) || []) {
        const distance = distanceInMeters(origin, item);
        if (!Number.isFinite(distance) || Number(distance) > radius) continue;
        result.push({ item, distance: Number(distance) });
      }
    }
  }
  return result.sort((a, b) => a.distance - b.distance);
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
 * Produce two compact SVG paths: approximate local street axes and address
 * blocks used only as orientation cues. They are not cadastral footprints or
 * pedestrian routing.
 *
 * @param {RadarContextIndex | null | undefined} index
 * @param {{lat:number,lon:number}|null|undefined} position
 * @param {number|null} heading
 * @param {number} range
 */
export function buildRadarContext(index, position, heading, range) {
  const empty = { buildingPath: "", roadPath: "" };
  if (
    !(index instanceof Map) ||
    !hasCoordinates(position) ||
    !Number.isFinite(range) ||
    Number(range) <= 0
  ) {
    return empty;
  }

  const origin = { lat: Number(position?.lat), lon: Number(position?.lon) };
  const radarRange = Number(range);
  const entries = nearby(index, origin, Math.min(500, radarRange));

  const used = new Set();
  let roadPath = "";
  let roadCount = 0;
  for (let i = 0; i < entries.length && roadCount < 6; i += 1) {
    const first = entries[i];
    const street = String(first.item.street || "");
    if (!street || used.has(street)) continue;

    let second = null;
    for (let j = i + 1; j < entries.length; j += 1) {
      const candidate = entries[j];
      if (candidate.item.street !== street) continue;
      const span = distanceInMeters(first.item, candidate.item);
      if (Number.isFinite(span) && Number(span) >= 24) {
        second = candidate;
        break;
      }
    }
    if (!second) continue;

    const a = point(origin, first.item, heading, radarRange);
    const b = point(origin, second.item, heading, radarRange);
    if (!a || !b) continue;
    roadPath += `M${Math.round(a.x)} ${Math.round(a.y)}L${Math.round(b.x)} ${Math.round(b.y)}`;
    used.add(street);
    roadCount += 1;
  }

  let buildingPath = "";
  for (const entry of entries.slice(0, 40)) {
    const p = point(origin, entry.item, heading, radarRange);
    if (!p) continue;
    buildingPath += `M${Math.round(p.x) - 1} ${Math.round(p.y) - 1}h2v2h-2z`;
  }

  return { buildingPath, roadPath };
}
