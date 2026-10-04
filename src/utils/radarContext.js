import { distanceInMeters, hasCoordinates } from "./geo";
import { bearingDegrees, radarPoint } from "./stopRadar";

/** @import { ParsedAddressPack, PackAddress } from "../api/addressPack" */

/** @typedef {Map<string, PackAddress[]>} RadarContextIndex */

const CELL_DEGREES = 0.006;
const MAX_CONTEXT_METERS = 500;
const MAX_BUILDINGS = 40;
const MAX_ROADS = 6;
const MIN_ROAD_SPAN_METERS = 24;

function cell(value) {
  return Math.floor(Number(value) / CELL_DEGREES);
}

function key(lat, lon) {
  return `${lat}:${lon}`;
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

function point(origin, item, heading, range) {
  const bearing = bearingDegrees(origin, item);
  const distance = distanceInMeters(origin, item);
  if (!Number.isFinite(bearing) || !Number.isFinite(distance)) return null;
  return radarPoint(Number(bearing), heading, Number(distance), range);
}

function nearestStreet(index, target) {
  if (!hasCoordinates(target)) return "";
  const origin = { lat: Number(target?.lat), lon: Number(target?.lon) };
  return String(nearby(index, origin, 160)[0]?.item?.street || "");
}

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
  if (!a || !b) return null;

  return {
    id: `road:${street}`,
    street,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    labelX: (a.x + b.x) / 2,
    labelY: (a.y + b.y) / 2,
    nearestDistance: entries[0].distanceMeters,
    count: entries.length,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/**
 * Approximate orientation context. Address points are visual building cues;
 * repeated addresses on one named street form a simple local street axis.
 * They are not cadastral footprints or a pedestrian route.
 */
export function buildRadarContext(index, position, target, heading, range) {
  const empty = { buildings: [], roads: [], targetStreet: "" };
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

  const roadCandidates = [];
  for (const [street, group] of streets) {
    const road = roadFor(street, group, origin, heading, radarRange);
    if (road) roadCandidates.push(road);
  }
  roadCandidates.sort(
    (a, b) =>
      Number(b.street === targetStreet) - Number(a.street === targetStreet) ||
      a.nearestDistance - b.nearestDistance ||
      b.count - a.count
  );

  const selected = roadCandidates.slice(0, MAX_ROADS);
  const angles = new Map(selected.map((road) => [road.street, road.angle]));
  const roads = selected.map((road, indexValue) => ({
    id: road.id,
    street: road.street,
    x1: road.x1,
    y1: road.y1,
    x2: road.x2,
    y2: road.y2,
    labelX: road.labelX,
    labelY: road.labelY,
    targetStreet: road.street === targetStreet,
    showLabel:
      radarRange <= 500 &&
      (road.street === targetStreet || indexValue < 2),
  }));

  const seen = new Set();
  const size =
    radarRange <= 100 ? 2.8 : radarRange <= 200 ? 2.2 : radarRange <= 400 ? 1.7 : 1.2;
  const buildings = [];
  for (const entry of entries) {
    if (entry.distanceMeters > radarRange) continue;
    const p = point(origin, entry.item, heading, radarRange);
    if (!p) continue;
    const block = `${Math.round(p.x / 3)}:${Math.round(p.y / 3)}`;
    if (seen.has(block)) continue;
    seen.add(block);
    buildings.push({
      id: entry.item.id,
      x: p.x,
      y: p.y,
      size,
      rotation: Number(angles.get(entry.item.street) || 0),
      street: entry.item.street,
      targetStreet: entry.item.street === targetStreet,
    });
    if (buildings.length >= MAX_BUILDINGS) break;
  }

  return { buildings, roads, targetStreet };
}
