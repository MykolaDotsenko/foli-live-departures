import { distanceInMeters, findNearestStops, hasCoordinates } from "./geo";

export const RADAR_STOP_LIMIT = 8;
export const RADAR_MAX_RANGE_METERS = 2_000;
export const RADAR_MOVEMENT_HEADING_MAX_AGE_MS = 15_000;

const RANGE_STEPS_METERS = [200, 400, 800, 1_200, RADAR_MAX_RANGE_METERS];

/** @param {unknown} value */
export function normalizeDegrees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return ((number % 360) + 360) % 360;
}

/**
 * Initial bearing from one WGS84 point to another.
 * @param {{lat?: unknown, lon?: unknown} | null | undefined} from
 * @param {{lat?: unknown, lon?: unknown} | null | undefined} to
 */
export function bearingDegrees(from, to) {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;

  const lat1 = (Number(from.lat) * Math.PI) / 180;
  const lat2 = (Number(to.lat) * Math.PI) / 180;
  const deltaLon = ((Number(to.lon) - Number(from.lon)) * Math.PI) / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * Clockwise angle from the top of the user's screen to a world bearing.
 * When heading is unavailable, the radar is north-up.
 * @param {number | null | undefined} bearing
 * @param {number | null | undefined} heading
 */
export function relativeBearingDegrees(bearing, heading) {
  const worldBearing = normalizeDegrees(bearing);
  if (worldBearing === null) return null;
  const deviceHeading = normalizeDegrees(heading);
  return normalizeDegrees(
    worldBearing - (deviceHeading === null ? 0 : deviceHeading)
  );
}

/**
 * Smooth across 359 -> 0 without spinning the long way around.
 * @param {number | null | undefined} previous
 * @param {number | null | undefined} next
 * @param {number} [factor]
 */
export function smoothHeading(previous, next, factor = 0.24) {
  const target = normalizeDegrees(next);
  if (target === null) return normalizeDegrees(previous);

  const current = normalizeDegrees(previous);
  if (current === null) return target;

  const boundedFactor = Math.min(1, Math.max(0, Number(factor) || 0));
  const delta = ((target - current + 540) % 360) - 180;
  return normalizeDegrees(current + delta * boundedFactor);
}

/**
 * Safari exposes webkitCompassHeading directly. Standards-based absolute
 * orientation reports alpha in the opposite sense to compass heading.
 * Relative alpha must never be presented as north-referenced guidance.
 * @param {any} event
 */
export function headingFromOrientationEvent(event) {
  const webkit = normalizeDegrees(event?.webkitCompassHeading);
  if (webkit !== null) return webkit;

  if (event?.absolute !== true) return null;
  const alpha = normalizeDegrees(event?.alpha);
  return alpha === null ? null : normalizeDegrees(360 - alpha);
}

/**
 * Must be called from a user gesture on browsers that gate the magnetometer.
 * @returns {Promise<"granted" | "denied" | "not-required" | "unavailable" | "error">}
 */
export async function requestCompassPermission() {
  const OrientationEvent = globalThis.DeviceOrientationEvent;
  if (!OrientationEvent) return "unavailable";

  const requestPermission = OrientationEvent.requestPermission;
  if (typeof requestPermission !== "function") return "not-required";

  try {
    const result = await requestPermission.call(OrientationEvent, true);
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "error";
  }
}

/**
 * GPS direction-of-travel fallback. It deliberately needs movement larger
 * than the reported uncertainty floor, otherwise normal GPS jitter becomes a
 * fake compass.
 * @param {{lat?: unknown, lon?: unknown, accuracy?: unknown} | null} previous
 * @param {{lat?: unknown, lon?: unknown, accuracy?: unknown} | null} next
 */
export function movementHeading(previous, next) {
  if (!hasCoordinates(previous) || !hasCoordinates(next)) return null;

  const moved = distanceInMeters(previous, next);
  if (!Number.isFinite(moved)) return null;

  const accuracy = Math.max(
    Number(previous?.accuracy) || 0,
    Number(next?.accuracy) || 0
  );
  const minimumMovement = Math.max(8, Math.min(30, accuracy || 12));
  if (moved < minimumMovement) return null;

  return bearingDegrees(previous, next);
}

/**
 * @template {{id?: unknown,lat?: unknown,lon?: unknown}} Stop
 * @param {readonly Stop[]} stops
 * @param {{lat?: unknown,lon?: unknown} | null} position
 * @param {string} targetStopId
 */
export function radarStops(stops, position, targetStopId) {
  if (!hasCoordinates(position)) return [];

  const nearest = findNearestStops(stops, position, RADAR_STOP_LIMIT);
  const target = stops.find(
    (stop) => String(stop?.id || "") === targetStopId && hasCoordinates(stop)
  );
  if (!target || nearest.some((stop) => String(stop.id) === targetStopId)) {
    return nearest;
  }

  const targetDistance = distanceInMeters(position, target);
  return Number.isFinite(targetDistance)
    ? [...nearest, { ...target, distanceMeters: targetDistance }]
    : nearest;
}

/**
 * @param {readonly {distanceMeters?: unknown}[]} stops
 * @param {number | null | undefined} targetDistance
 */
export function radarRangeMeters(stops, targetDistance) {
  const distances = [
    ...stops.map((stop) => Number(stop?.distanceMeters)),
    Number(targetDistance),
  ].filter((value) => Number.isFinite(value) && value >= 0);

  const furthest = distances.length ? Math.max(...distances) : 200;
  return (
    RANGE_STEPS_METERS.find((range) => furthest <= range) ||
    RADAR_MAX_RANGE_METERS
  );
}

/**
 * Percentage position within a square radar. Distances beyond range are
 * pinned to the edge; the UI labels that explicitly for the target.
 * @param {number} bearing
 * @param {number | null} heading
 * @param {number} distance
 * @param {number} range
 */
export function radarPoint(bearing, heading, distance, range) {
  const angle = relativeBearingDegrees(bearing, heading);
  if (angle === null || !Number.isFinite(distance) || !Number.isFinite(range) || range <= 0) {
    return null;
  }

  const radius = Math.min(1, Math.max(0, distance / range)) * 42;
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius,
    angle,
    clipped: distance > range,
  };
}

/**
 * Short accessible description of where the target lies relative to the
 * device/direction of travel.
 * @param {number | null | undefined} angle
 */
export function relativeDirectionKey(angle) {
  const normalized = normalizeDegrees(angle);
  if (normalized === null) return "Direction unavailable";

  const signed = ((normalized + 180) % 360) - 180;
  const absolute = Math.abs(signed);
  if (absolute <= 15) return "Straight ahead";
  if (absolute <= 55) return signed > 0 ? "Slightly right" : "Slightly left";
  if (absolute <= 125) return signed > 0 ? "To your right" : "To your left";
  if (absolute <= 165) {
    return signed > 0 ? "Behind you to the right" : "Behind you to the left";
  }
  return "Behind you";
}
