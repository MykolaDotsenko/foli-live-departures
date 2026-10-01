import { findNearestStops } from "./geo";

/** @import { DestinationIntent, PlaceSearchResult } from "../types/journey" */

const MAX_DESTINATION_STOPS = 6;
const ABSOLUTE_MAX_WALK_METERS = 1_600;
const EXTRA_RADIUS_METERS = 650;
const MIN_SEARCH_RADIUS_METERS = 450;
const FINAL_WALK_DETOUR_FACTOR = 1.25;
const FINAL_WALK_SPEED_MPS = 1.2;

/**
 * Ranking-only estimate. It deliberately inflates straight-line distance and
 * is never presented as turn-by-turn walking time.
 *
 * @param {unknown} distanceM
 * @returns {number | null}
 */
export function estimateFinalWalkSeconds(distanceM) {
  if (distanceM === null || distanceM === undefined || distanceM === "") {
    return null;
  }
  const distance = Number(distanceM);
  if (!Number.isFinite(distance) || distance < 0) return null;
  return Math.ceil(
    (distance * FINAL_WALK_DETOUR_FACTOR) / FINAL_WALK_SPEED_MPS
  );
}

/**
 * @param {readonly any[]} stops
 * @param {PlaceSearchResult | null | undefined} place
 */
export function destinationStopsForPlace(stops, place) {
  if (!place) return [];

  const nearest = findNearestStops(
    stops,
    { lat: place.lat, lon: place.lon },
    16
  );
  if (nearest.length === 0) return [];

  const nearestDistance = Number(nearest[0].distanceMeters);
  if (
    !Number.isFinite(nearestDistance) ||
    nearestDistance > ABSOLUTE_MAX_WALK_METERS
  ) {
    return [];
  }

  const radius = Math.min(
    ABSOLUTE_MAX_WALK_METERS,
    Math.max(
      MIN_SEARCH_RADIUS_METERS,
      nearestDistance + EXTRA_RADIUS_METERS
    )
  );

  return nearest
    .filter((stop) => stop.distanceMeters <= radius)
    .slice(0, MAX_DESTINATION_STOPS);
}

/**
 * @param {PlaceSearchResult | null | undefined} place
 * @param {readonly any[]} stops
 * @returns {DestinationIntent | null}
 */
export function destinationFromExternalPlace(place, stops) {
  if (!place) return null;
  const candidates = destinationStopsForPlace(stops, place);
  if (candidates.length === 0) return null;

  /** @type {Record<string, number>} */
  const finalWalkDistanceByStop = {};
  for (const stop of candidates) {
    finalWalkDistanceByStop[String(stop.id)] = Math.round(
      Number(stop.distanceMeters)
    );
  }

  return {
    id: `external:${place.provider}:${place.id}`,
    kind: "external-place",
    label: place.title,
    primaryStopId: String(candidates[0].id),
    acceptableStopIds: candidates.map((stop) => String(stop.id)),
    lat: place.lat,
    lon: place.lon,
    finalWalkDistanceByStop,
    source: "osm-nominatim",
  };
}
