import { msg } from "../i18n";
import { distanceInMeters, findNearestStops, hasCoordinates } from "./geo";

export const RADAR_STOP_LIMIT = 8;
export const RADAR_MAX_RANGE_METERS = 2_000;
export const RADAR_MOVEMENT_HEADING_MAX_AGE_MS = 15_000;

// The last hundred metres are where a passenger tells two platforms of the
// same stop apart, so the scale goes down to 50 m.
export const RADAR_RANGE_STEPS_METERS = [
  50,
  100,
  200,
  400,
  800,
  1_200,
  RADAR_MAX_RANGE_METERS,
];
// Room around the target so it never sits on the edge of the scale.
const RANGE_HEADROOM = 1.25;
// Zooming in waits until the target is clearly inside the smaller scale, so
// a distance hovering at a step does not flip the scale on every fix.
const ZOOM_IN_SHARE = 2 / 3;
const MIN_RANGE_DISTANCE_METERS = 40;

/** @param {unknown} value */
export function normalizeDegrees(value) {
  if (value === null || value === undefined || value === "") return null;
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

  const fromLat = Number(from?.lat);
  const fromLon = Number(from?.lon);
  const toLat = Number(to?.lat);
  const toLon = Number(to?.lon);

  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const deltaLon = ((toLon - fromLon) * Math.PI) / 180;

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
 *
 * Both give the heading of the phone's top edge as it stands upright. Turned
 * on its side, the top of the screen is a quarter turn away from that edge,
 * so the screen's own angle (screen.orientation.angle, or Safari's
 * window.orientation) is added: without it, a landscape radar pointed 90°
 * off.
 * @param {any} event
 * @param {unknown} [screenAngle]
 */
export function headingFromOrientationEvent(event, screenAngle = 0) {
  let heading = normalizeDegrees(event?.webkitCompassHeading);
  if (heading === null && event?.absolute === true) {
    const alpha = normalizeDegrees(event?.alpha);
    if (alpha !== null) heading = 360 - alpha;
  }
  return heading === null
    ? null
    : normalizeDegrees(heading + (Number(screenAngle) || 0));
}

/**
 * Must be called from a user gesture on browsers that gate the magnetometer.
 * @returns {Promise<"granted" | "denied" | "not-required" | "unavailable" | "error">}
 */
export async function requestCompassPermission() {
  const OrientationEvent = /** @type {any} */ (globalThis).DeviceOrientationEvent;
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
 * fake compass. A walker covers about 1.4 m between fixes a second apart, so
 * `previous` is where the walk was last measured from, not the last fix.
 * @param {{lat?: unknown, lon?: unknown, accuracy?: unknown} | null} previous
 * @param {{lat?: unknown, lon?: unknown, accuracy?: unknown} | null} next
 */
export function movementHeading(previous, next) {
  if (!hasCoordinates(previous) || !hasCoordinates(next)) return null;

  const moved = distanceInMeters(previous, next);
  if (typeof moved !== "number" || !Number.isFinite(moved)) return null;

  const accuracy = Math.max(
    Number(previous?.accuracy) || 0,
    Number(next?.accuracy) || 0
  );

  // Poor fixes can jump tens of metres while stationary. Direction-of-travel
  // is a safety fallback, not an excuse to turn uncertainty into a compass.
  if (accuracy > 30) return null;

  const minimumMovement = Math.max(8, accuracy || 12);
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
 * The radar's scale follows the stop being walked to. Scaled to the eighth
 * nearest stop instead, a target 40 m away sat on top of the passenger's own
 * dot on a 2 km scale, just where the walk needs precision. Stops outside
 * the scale are left off the radar; the target chooser still lists them.
 * @param {number | null | undefined} targetDistance
 * @param {number | null} [currentRange] The scale now on screen, if any.
 * @returns {number}
 */
export function radarRangeMeters(targetDistance, currentRange = null) {
  const distance = Number(targetDistance);
  const current = RADAR_RANGE_STEPS_METERS.includes(Number(currentRange))
    ? Number(currentRange)
    : null;
  if (targetDistance === null || !Number.isFinite(distance) || distance < 0) {
    return current ?? 200;
  }

  const needed = Math.max(distance * RANGE_HEADROOM, MIN_RANGE_DISTANCE_METERS);
  const fit =
    RADAR_RANGE_STEPS_METERS.find((range) => needed <= range) ||
    RADAR_MAX_RANGE_METERS;
  if (current === null || fit >= current) return fit;
  // Zoom in to the closest scale the target sits well inside, which after
  // a jump (a nearer target, a GPS catch-up) may be one between the fit
  // and the scale on screen; a target at a step's edge keeps the scale.
  return (
    RADAR_RANGE_STEPS_METERS.find(
      (range) => range >= fit && range < current && distance <= range * ZOOM_IN_SHARE
    ) ?? current
  );
}

/**
 * One of eight compass points for a bearing, 0 for north clockwise to 7 for
 * north-west, for guidance a passenger can act on without reading degrees.
 * @param {number | null | undefined} bearing
 * @returns {number | null}
 */
export function compassPoint(bearing) {
  const normalized = normalizeDegrees(bearing);
  return normalized === null ? null : Math.round(normalized / 45) % 8;
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
 * device/direction of travel: the English phrase, for t().
 * @param {number | null | undefined} angle
 */
export function relativeDirectionKey(angle) {
  const normalized = normalizeDegrees(angle);
  if (normalized === null) return msg("Direction unavailable");

  const signed = ((normalized + 180) % 360) - 180;
  const absolute = Math.abs(signed);
  if (absolute <= 15) return msg("Straight ahead");
  if (absolute <= 55) {
    return signed > 0 ? msg("Slightly right") : msg("Slightly left");
  }
  if (absolute <= 125) {
    return signed > 0 ? msg("To your right") : msg("To your left");
  }
  if (absolute <= 165) {
    return signed > 0
      ? msg("Behind you to the right")
      : msg("Behind you to the left");
  }
  return msg("Behind you");
}
