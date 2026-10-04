import { intlLocale } from "../i18n";

/** @import { MultiPolygonCoordinates, ServiceBoundary } from "../types/foli" */

/**
 * Anything that may carry a position. The fields are coerced and range
 * checked, so a stop without coordinates or a string "60.45" is fine.
 * @typedef {{ lat?: unknown, lon?: unknown }} MaybeLatLon
 */

/** A GeoJSON position, [lon, lat]. @typedef {number[]} Position */

const EARTH_RADIUS_METERS = 6_371_008.8;

/**
 * @param {number} value
 * @returns {number}
 */
function toRadians(value) {
  return (value * Math.PI) / 180;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function coordinate(value, min, max) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

/**
 * @param {MaybeLatLon | null | undefined} value
 * @returns {boolean}
 */
export function hasCoordinates(value) {
  return (
    coordinate(value?.lat, -90, 90) !== null &&
    coordinate(value?.lon, -180, 180) !== null
  );
}

/**
 * @param {MaybeLatLon | null | undefined} from
 * @param {MaybeLatLon | null | undefined} to
 * @returns {number | null}
 */
/**
 * Approximate compass direction from one coordinate to another. This is
 * deliberately not walking navigation: it remains useful offline while
 * never implying that the straight bearing is a walkable route.
 *
 * @param {MaybeLatLon | null | undefined} from
 * @param {MaybeLatLon | null | undefined} to
 * @returns {"north"|"north-east"|"east"|"south-east"|"south"|"south-west"|"west"|"north-west"|null}
 */
export function directionBetween(from, to) {
  const fromLat = coordinate(from?.lat, -90, 90);
  const fromLon = coordinate(from?.lon, -180, 180);
  const toLat = coordinate(to?.lat, -90, 90);
  const toLon = coordinate(to?.lon, -180, 180);
  if (
    fromLat === null ||
    fromLon === null ||
    toLat === null ||
    toLon === null
  ) {
    return null;
  }

  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const deltaLon = toRadians(toLon - fromLon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const normalized = (bearing + 360) % 360;
  /** @type {readonly ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]} */
  const directions = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];
  return directions[Math.round(normalized / 45) % 8];
}

/**
 * @param {MaybeLatLon | null | undefined} from
 * @param {MaybeLatLon | null | undefined} to
 * @returns {number | null}
 */
export function distanceInMeters(from, to) {
  const fromLat = coordinate(from?.lat, -90, 90);
  const fromLon = coordinate(from?.lon, -180, 180);
  const toLat = coordinate(to?.lat, -90, 90);
  const toLon = coordinate(to?.lon, -180, 180);

  if (
    fromLat === null ||
    fromLon === null ||
    toLat === null ||
    toLon === null
  ) {
    return null;
  }

  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, a));
  const centralAngle =
    2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));

  return EARTH_RADIUS_METERS * centralAngle;
}

/**
 * @template {MaybeLatLon & { id?: unknown }} Stop
 * @param {readonly Stop[]} stops
 * @param {MaybeLatLon | null | undefined} position
 * @param {number} [limit]
 * @returns {(Stop & { distanceMeters: number })[]}
 */
export function findNearestStops(stops, position, limit = 3) {
  if (!hasCoordinates(position) || limit <= 0) return [];

  return stops
    .filter(hasCoordinates)
    .map((stop) => ({
      ...stop,
      distanceMeters: distanceInMeters(position, {
        lat: stop.lat,
        lon: stop.lon,
      }),
    }))
    .filter(
      /** @returns {stop is Stop & { distanceMeters: number }} */
      (stop) => Number.isFinite(stop.distanceMeters)
    )
    .sort(
      (a, b) =>
        a.distanceMeters - b.distanceMeters ||
        Number(a.id) - Number(b.id)
    )
    .slice(0, limit);
}

/**
 * @param {number | null | undefined} distanceMeters
 * @returns {string} "" when there is no distance to show.
 */
export function formatDistance(distanceMeters) {
  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    return "";
  }

  if (distanceMeters < 10) return "<10 m";

  // 996 m rounds to 1,000 m, which reads better as "1.0 km".
  const meters = Math.round(distanceMeters / 10) * 10;
  if (meters < 1_000) return `${meters} m`;

  // "2.6 km" in English, "2,6 km" in Finnish. Written out by hand: a phone
  // without Finnish locale data would give "2.6" from toLocaleString.
  const kilometers = distanceMeters / 1_000;
  const tenths = kilometers.toFixed(1);
  const shown =
    Number(tenths) < 10 ? tenths : String(Math.round(kilometers));
  return `${intlLocale() === "fi-FI" ? shown.replace(".", ",") : shown} km`;
}

/**
 * @param {number | null | undefined} accuracyMeters
 * @returns {string} "" when there is no accuracy to show.
 */
export function formatAccuracy(accuracyMeters) {
  if (
    typeof accuracyMeters !== "number" ||
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0
  ) {
    return "";
  }
  return formatDistance(accuracyMeters);
}


/**
 * @param {Position} point
 * @param {Position} start
 * @param {Position} end
 * @param {number} [epsilon]
 * @returns {boolean}
 */
function pointOnSegment(point, start, end, epsilon = 1e-10) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);

  if (Math.abs(cross) > epsilon) return false;

  return (
    x >= Math.min(x1, x2) - epsilon &&
    x <= Math.max(x1, x2) + epsilon &&
    y >= Math.min(y1, y2) - epsilon &&
    y <= Math.max(y1, y2) + epsilon
  );
}

/**
 * @param {Position} point
 * @param {MultiPolygonCoordinates[number][number] | undefined} ring
 * @returns {boolean}
 */
function pointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;

  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = ring[i];
    const previous = ring[j];

    if (
      !Array.isArray(current) ||
      current.length < 2 ||
      !Array.isArray(previous) ||
      previous.length < 2
    ) {
      continue;
    }

    if (pointOnSegment(point, previous, current)) return true;

    const [xi, yi] = current;
    const [xj, yj] = previous;
    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

/**
 * Null when either side is unusable, so a caller can tell "outside" from
 * "unknown".
 * @param {MaybeLatLon | null | undefined} position
 * @param {ServiceBoundary | null | undefined} geometry
 * @returns {boolean | null}
 */
export function isInsideMultiPolygon(position, geometry) {

  const lat = coordinate(position?.lat, -90, 90);
  const lon = coordinate(position?.lon, -180, 180);

  if (
    lat === null ||
    lon === null ||
    geometry?.type !== "MultiPolygon" ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null;
  }

  const point = [lon, lat];

  return geometry.coordinates.some((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;

    const [outer, ...holes] = polygon;
    if (!pointInRing(point, outer)) return false;

    return !holes.some((hole) => pointInRing(point, hole));
  });
}
