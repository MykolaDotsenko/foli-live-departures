import { distanceInMeters, hasCoordinates } from "./geo";

/** @import { ParsedAddressPack, PackAddress } from "../api/addressPack" */
/** @typedef {Map<string, PackAddress[]>} RadarContextIndex */
/**
 * Street axes ([x1, y1, x2, y2]) and building cues ([x, y]) in metres east
 * (x) and north (y) of the passenger.
 * @typedef {{ roads: number[][], buildings: number[][] }} RadarContext
 */

const CELL_DEGREES = 0.006;
// Within the 500 m the radar draws, a degree is as long as anywhere near.
const METERS_PER_DEGREE = 111_195;

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
 * Choose what the radar draws around the passenger: an approximate axis for
 * each of the six nearest streets, and up to 40 building cues spread over the
 * scale. Orientation cues only: not cadastral footprints or pedestrian
 * routing.
 *
 * It depends on the fix and the scale, not the heading, so a compass turning
 * many times a second only rotates it (radarContextPaths).
 *
 * @param {RadarContextIndex | null | undefined} index
 * @param {{lat:number,lon:number}|null|undefined} position
 * @param {number} range
 * @returns {RadarContext}
 */
export function selectRadarContext(index, position, range) {
  /** @type {RadarContext} */
  const context = { roads: [], buildings: [] };
  if (!(index instanceof Map) || !position || !hasCoordinates(position) || !(range > 0)) {
    return context;
  }

  const origin = position;
  const eastPerDegree =
    METERS_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180);
  // Cues closer than 6% of the radar's width would merge on screen; the
  // nearest 40 addresses all sat in a smudge around the passenger's dot.
  const spacing = range / 7;
  /** @type {Map<string, number[][]>} */
  const streets = new Map();

  for (const { item } of nearby(index, origin, Math.min(500, range))) {
    const x = (item.lon - origin.lon) * eastPerDegree;
    const y = (item.lat - origin.lat) * METERS_PER_DEGREE;
    const street = streets.get(item.street);
    if (street) street.push([x, y]);
    else if (item.street) streets.set(item.street, [[x, y]]);
    if (
      context.buildings.length < 40 &&
      context.buildings.every(
        ([bx, by]) => Math.hypot(bx - x, by - y) >= spacing
      )
    ) {
      context.buildings.push([x, y]);
    }
  }

  // The line a street's addresses lie along. A segment from one house to the
  // next drew a dash a few metres long, which at most scales was noise.
  for (const points of streets.values()) {
    if (context.roads.length === 6) break;
    // Mean and spread of the street's addresses, then the line of most
    // spread through them.
    let mx = 0;
    let my = 0;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (const [x, y] of points) {
      mx += x;
      my += y;
      xx += x * x;
      yy += y * y;
      xy += x * y;
    }
    const count = points.length;
    mx /= count;
    my /= count;
    xx = xx / count - mx * mx;
    yy = yy / count - my * my;
    xy = xy / count - mx * my;
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // The spread across that line: the smaller of the two.
    const across = (xx + yy) / 2 - Math.hypot((xx - yy) / 2, xy);
    let low = Infinity;
    let high = -Infinity;
    for (const [x, y] of points) {
      const along = (x - mx) * ux + (y - my) * uy;
      low = Math.min(low, along);
      high = Math.max(high, along);
    }
    // A street's addresses line up along it. A square's, or a block's
    // around a courtyard, do not, and a line through them crossed the
    // square as if it were a street.
    if (high - low >= 24 && across <= Math.max(15, (high - low) / 5) ** 2) {
      context.roads.push([
        mx + low * ux,
        my + low * uy,
        mx + high * ux,
        my + high * uy,
      ]);
    }
  }

  return context;
}

/**
 * Two compact SVG paths for the radar's 100×100 view box, turned so the
 * heading is at the top: street axes, and building cues as zero-length
 * strokes that their square line caps draw as small squares.
 *
 * @param {RadarContext} context
 * @param {number | null} heading
 * @param {number} range
 */
export function radarContextPaths(context, heading, range) {
  const turn = ((Number(heading) || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const scale = 42 / range;
  /** @param {number} x @param {number} y */
  const at = (x, y) =>
    `${Math.round(50 + scale * (x * cos - y * sin))} ${Math.round(
      50 - scale * (y * cos + x * sin)
    )}`;
  return {
    roadPath: context.roads
      .map(([x1, y1, x2, y2]) => `M${at(x1, y1)}L${at(x2, y2)}`)
      .join(""),
    buildingPath: context.buildings.map(([x, y]) => `M${at(x, y)}h0`).join(""),
  };
}
