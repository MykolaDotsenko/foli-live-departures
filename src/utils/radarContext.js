import { distanceInMeters, hasCoordinates } from "./geo";
import { bearingDegrees, radarPoint } from "./stopRadar";

/** @import { ParsedAddressPack, PackAddress, PackStreet } from "../api/addressPack" */

/**
 * @typedef {{
 *   addressCells: Map<string, PackAddress[]>,
 *   streetCells: Map<string, PackStreet[]>,
 *   addressCount: number,
 *   streetCount: number,
 * }} RadarContextIndex
 */

/**
 * @typedef {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   size: number,
 *   rotation: number,
 *   street: string,
 *   targetStreet: boolean,
 * }} RadarBuildingCue
 */

/**
 * @typedef {{
 *   id: string,
 *   street: string,
 *   x1: number,
 *   y1: number,
 *   x2: number,
 *   y2: number,
 *   labelX: number,
 *   labelY: number,
 *   targetStreet: boolean,
 *   showLabel: boolean,
 * }} RadarRoadCue
 */

/**
 * @typedef {{
 *   buildings: RadarBuildingCue[],
 *   roads: RadarRoadCue[],
 *   targetStreet: string,
 *   sourceAddressCount: number,
 * }} RadarContext
 */

const CELL_DEGREES = 0.004;
const MIN_CONTEXT_RADIUS_METERS = 120;
const MAX_CONTEXT_RADIUS_METERS = 500;
const TARGET_STREET_RADIUS_METERS = 160;
const MAX_BUILDINGS = 48;
const MAX_ROADS = 8;
const MIN_ROAD_SPAN_METERS = 24;

function cellNumber(value) {
  return Math.floor(Number(value) / CELL_DEGREES);
}

function cellKey(latCell, lonCell) {
  return `${latCell}:${lonCell}`;
}

function addToCell(map, item) {
  const key = cellKey(cellNumber(item.lat), cellNumber(item.lon));
  const current = map.get(key);
  if (current) current.push(item);
  else map.set(key, [item]);
}

/**
 * Build a small in-memory spatial index once after the shipped address pack
 * is loaded. Radar fixes then query a handful of cells instead of scanning
 * 33k+ addresses on every GPS update.
 *
 * @param {ParsedAddressPack | null | undefined} pack
 * @returns {RadarContextIndex}
 */
export function createRadarContextIndex(pack) {
  /** @type {Map<string, PackAddress[]>} */
  const addressCells = new Map();
  /** @type {Map<string, PackStreet[]>} */
  const streetCells = new Map();

  const addresses = Array.isArray(pack?.addresses) ? pack.addresses : [];
  const streets = Array.isArray(pack?.streets) ? pack.streets : [];

  for (const item of addresses) {
    if (hasCoordinates(item) && item.street) addToCell(addressCells, item);
  }
  for (const item of streets) {
    if (hasCoordinates(item) && item.street) addToCell(streetCells, item);
  }

  return {
    addressCells,
    streetCells,
    addressCount: addresses.length,
    streetCount: streets.length,
  };
}

function metersPerLongitudeDegree(lat) {
  const cosine = Math.cos((Number(lat) * Math.PI) / 180);
  return 111_320 * Math.max(0.2, Math.abs(cosine));
}

function projectedMeters(origin, point) {
  return {
    x:
      (Number(point.lon) - Number(origin.lon)) *
      metersPerLongitudeDegree(origin.lat),
    y: (Number(point.lat) - Number(origin.lat)) * 111_320,
  };
}

function unprojectMeters(origin, point) {
  return {
    lat: Number(origin.lat) + Number(point.y) / 111_320,
    lon:
      Number(origin.lon) +
      Number(point.x) / metersPerLongitudeDegree(origin.lat),
  };
}

/**
 * @template T
 * @param {Map<string, T[]>} cells
 * @param {{lat:number,lon:number}} center
 * @param {number} radiusMeters
 * @returns {T[]}
 */
function queryCells(cells, center, radiusMeters) {
  if (!hasCoordinates(center) || !(cells instanceof Map)) return [];

  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / metersPerLongitudeDegree(center.lat);
  const minLatCell = cellNumber(center.lat - latDelta);
  const maxLatCell = cellNumber(center.lat + latDelta);
  const minLonCell = cellNumber(center.lon - lonDelta);
  const maxLonCell = cellNumber(center.lon + lonDelta);
  const result = [];

  for (let latCell = minLatCell; latCell <= maxLatCell; latCell += 1) {
    for (let lonCell = minLonCell; lonCell <= maxLonCell; lonCell += 1) {
      const bucket = cells.get(cellKey(latCell, lonCell));
      if (bucket) result.push(...bucket);
    }
  }
  return result;
}

function pointsWithin(cells, center, radiusMeters) {
  return queryCells(cells, center, radiusMeters)
    .map((item) => ({
      item,
      distanceMeters: distanceInMeters(center, item),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.distanceMeters) &&
        entry.distanceMeters <= radiusMeters
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function nearestStreet(index, target) {
  if (!hasCoordinates(target)) return "";

  const candidates = [
    ...pointsWithin(
      index.addressCells,
      target,
      TARGET_STREET_RADIUS_METERS
    ),
    ...pointsWithin(index.streetCells, target, TARGET_STREET_RADIUS_METERS),
  ].sort((a, b) => a.distanceMeters - b.distanceMeters);

  return String(candidates[0]?.item?.street || "");
}

function roadFromAddresses(street, points, origin, heading, range) {
  if (points.length < 2) return null;

  const local = points.map((entry) => ({
    ...projectedMeters(origin, entry.item),
    distanceMeters: entry.distanceMeters,
  }));
  const meanX = local.reduce((sum, point) => sum + point.x, 0) / local.length;
  const meanY = local.reduce((sum, point) => sum + point.y, 0) / local.length;

  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of local) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }

  const axis = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(axis);
  const uy = Math.sin(axis);
  let minProjection = Infinity;
  let maxProjection = -Infinity;

  for (const point of local) {
    const projection = (point.x - meanX) * ux + (point.y - meanY) * uy;
    minProjection = Math.min(minProjection, projection);
    maxProjection = Math.max(maxProjection, projection);
  }

  const span = maxProjection - minProjection;
  if (!Number.isFinite(span) || span < MIN_ROAD_SPAN_METERS) return null;

  const endpointA = unprojectMeters(origin, {
    x: meanX + minProjection * ux,
    y: meanY + minProjection * uy,
  });
  const endpointB = unprojectMeters(origin, {
    x: meanX + maxProjection * ux,
    y: meanY + maxProjection * uy,
  });
  const midpoint = unprojectMeters(origin, { x: meanX, y: meanY });

  const distanceA = distanceInMeters(origin, endpointA);
  const distanceB = distanceInMeters(origin, endpointB);
  const distanceMid = distanceInMeters(origin, midpoint);
  const bearingA = bearingDegrees(origin, endpointA);
  const bearingB = bearingDegrees(origin, endpointB);
  const bearingMid = bearingDegrees(origin, midpoint);
  const pointA = radarPoint(bearingA, heading, distanceA, range);
  const pointB = radarPoint(bearingB, heading, distanceB, range);
  const labelPoint = radarPoint(bearingMid, heading, distanceMid, range);

  if (!pointA || !pointB || !labelPoint) return null;

  return {
    id: `road:${street}`,
    street,
    x1: pointA.x,
    y1: pointA.y,
    x2: pointB.x,
    y2: pointB.y,
    labelX: labelPoint.x,
    labelY: labelPoint.y,
    nearestDistance: Math.min(...local.map((point) => point.distanceMeters)),
    count: local.length,
    screenAngle:
      (Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x) * 180) / Math.PI,
  };
}

/**
 * Derive light-weight visual orientation cues from the already-shipped
 * OpenStreetMap address pack. Address points become small building cues;
 * repeated addresses on one named street are reduced to an approximate
 * street axis. These are orientation aids, not cadastral footprints or a
 * walking route.
 *
 * @param {RadarContextIndex | null | undefined} index
 * @param {{lat:number,lon:number}|null|undefined} position
 * @param {{lat:number,lon:number}|null|undefined} target
 * @param {number|null} heading
 * @param {number} range
 * @returns {RadarContext}
 */
export function buildRadarContext(index, position, target, heading, range) {
  const empty = {
    buildings: [],
    roads: [],
    targetStreet: "",
    sourceAddressCount: 0,
  };
  if (
    !index ||
    !hasCoordinates(position) ||
    !Number.isFinite(range) ||
    range <= 0
  ) {
    return empty;
  }

  const contextRadius = Math.min(
    MAX_CONTEXT_RADIUS_METERS,
    Math.max(MIN_CONTEXT_RADIUS_METERS, Number(range) * 1.2)
  );
  const addressEntries = pointsWithin(
    index.addressCells,
    position,
    contextRadius
  );
  const targetStreet = nearestStreet(index, target);

  /** @type {Map<string, {item: PackAddress, distanceMeters:number}[]>} */
  const byStreet = new Map();
  for (const entry of addressEntries) {
    const key = String(entry.item.streetKey || entry.item.street || "");
    if (!key) continue;
    const current = byStreet.get(key);
    if (current) current.push(entry);
    else byStreet.set(key, [entry]);
  }

  const roadCandidates = [];
  for (const entries of byStreet.values()) {
    const street = String(entries[0]?.item?.street || "");
    const road = roadFromAddresses(street, entries, position, heading, range);
    if (road) roadCandidates.push(road);
  }

  roadCandidates.sort(
    (a, b) =>
      Number(b.street === targetStreet) - Number(a.street === targetStreet) ||
      a.nearestDistance - b.nearestDistance ||
      b.count - a.count ||
      a.street.localeCompare(b.street, "fi")
  );

  const selectedRoads = roadCandidates.slice(0, MAX_ROADS);
  const labelRoadIds = new Set(
    selectedRoads
      .filter((road, indexValue) => road.street === targetStreet || indexValue < 2)
      .slice(0, 3)
      .map((road) => road.id)
  );

  const roads = selectedRoads.map((road) => ({
    id: road.id,
    street: road.street,
    x1: road.x1,
    y1: road.y1,
    x2: road.x2,
    y2: road.y2,
    labelX: road.labelX,
    labelY: road.labelY,
    targetStreet: road.street === targetStreet,
    showLabel: labelRoadIds.has(road.id) && Number(range) <= 500,
  }));

  const roadAngleByStreet = new Map(
    selectedRoads.map((road) => [road.street, road.screenAngle])
  );
  const seenBlocks = new Set();
  const buildingSize =
    range <= 100 ? 2.8 : range <= 200 ? 2.2 : range <= 400 ? 1.7 : 1.2;
  const buildings = [];

  for (const entry of addressEntries) {
    if (entry.distanceMeters > range) continue;
    const local = projectedMeters(position, entry.item);
    const blockKey = `${Math.round(local.x / 14)}:${Math.round(local.y / 14)}`;
    if (seenBlocks.has(blockKey)) continue;
    seenBlocks.add(blockKey);

    const bearing = bearingDegrees(position, entry.item);
    const point = radarPoint(
      bearing,
      heading,
      entry.distanceMeters,
      range
    );
    if (!point) continue;

    buildings.push({
      id: entry.item.id,
      x: point.x,
      y: point.y,
      size: buildingSize,
      rotation: Number(roadAngleByStreet.get(entry.item.street) || 0),
      street: entry.item.street,
      targetStreet: entry.item.street === targetStreet,
    });
    if (buildings.length >= MAX_BUILDINGS) break;
  }

  return {
    buildings,
    roads,
    targetStreet,
    sourceAddressCount: addressEntries.length,
  };
}
