import { findNearestStops } from "./geo";

/** @import { DestinationIntent } from "../types/journey" */

const DEFAULT_LIMIT = 8;
const PREFERRED_MAX_WALK_M = 1_600;
const FALLBACK_MAX_WALK_M = 2_500;
const MIN_PREFERRED_CANDIDATES = 3;
const WALK_DETOUR_FACTOR = 1.25;
const WALK_SPEED_MPS = 1.15;

/**
 * Straight-line stop distance is not a walking route. Inflate it
 * conservatively before turning it into time, and keep the UI explicit that
 * this remains an estimate rather than turn-by-turn pedestrian routing.
 *
 * @param {number | null | undefined} distanceMeters
 * @returns {number | null}
 */
export function estimateFinalWalkSeconds(distanceMeters) {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance) || distance < 0) return null;
  return Math.ceil((distance * WALK_DETOUR_FACTOR) / WALK_SPEED_MPS);
}

/**
 * @template {{ id: string, name?: string, lat?: unknown, lon?: unknown }} Stop
 * @param {readonly Stop[]} stops
 * @param {{ lat?: unknown, lon?: unknown } | null | undefined} point
 * @param {number} [limit]
 */
export function destinationStopCandidates(
  stops,
  point,
  limit = DEFAULT_LIMIT
) {
  const nearest = findNearestStops(
    stops,
    point,
    Math.max(DEFAULT_LIMIT * 3, limit)
  );
  if (nearest.length === 0) return [];

  const preferred = nearest.filter(
    (stop) => stop.distanceMeters <= PREFERRED_MAX_WALK_M
  );
  const pool =
    preferred.length >= MIN_PREFERRED_CANDIDATES
      ? preferred
      : nearest.filter(
          (stop) => stop.distanceMeters <= FALLBACK_MAX_WALK_M
        );

  return pool.slice(0, Math.max(1, limit)).map((stop) => {
    const walkDurationSec =
      estimateFinalWalkSeconds(stop.distanceMeters) ?? 0;
    return {
      ...stop,
      finalWalkDistanceM: stop.distanceMeters,
      finalWalkDurationSec: walkDurationSec,
    };
  });
}

/**
 * @param {{
 *   id?: unknown,
 *   label?: unknown,
 *   lat?: unknown,
 *   lon?: unknown,
 *   source?: unknown,
 * } | null | undefined} place
 * @param {readonly { id: string, name?: string, lat?: unknown, lon?: unknown }[]} stops
 * @returns {DestinationIntent | null}
 */
export function destinationFromExternalPlace(place, stops) {
  const id = String(place?.id || "").trim();
  const label = String(place?.label || "").trim();
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);

  if (
    !id ||
    !label ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  const candidates = destinationStopCandidates(stops, { lat, lon });
  if (candidates.length === 0) return null;

  const stopAccess = Object.fromEntries(
    candidates.map((stop) => [
      String(stop.id),
      {
        distanceMeters: stop.finalWalkDistanceM,
        walkDurationSec: stop.finalWalkDurationSec,
      },
    ])
  );

  return {
    id: `external:${id}`,
    kind: "external-place",
    label,
    primaryStopId: String(candidates[0].id),
    acceptableStopIds: candidates.map((stop) => String(stop.id)),
    point: { lat, lon },
    stopAccess,
    source: place?.source === "nominatim" ? "nominatim" : null,
  };
}
