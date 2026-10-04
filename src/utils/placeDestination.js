import {
  findNearestStops,
  hasCoordinates,
  isInsideMultiPolygon,
} from "./geo";

/** @import { DestinationIntent, PlaceSearchResult } from "../types/journey" */

// Dense destinations can have many platforms around the same place. Trip
// matching against these IDs is local/cheap, so keep a broad candidate set
// and bound realtime enrichment separately.
const MAX_DESTINATION_STOPS = 24;
const ABSOLUTE_MAX_WALK_METERS = 1_600;
const EXTRA_RADIUS_METERS = 500;
const MIN_SEARCH_RADIUS_METERS = 700;
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
  if (!place || !hasCoordinates(place)) return [];

  const nearest = findNearestStops(
    Array.isArray(stops) ? stops : [],
    { lat: place.lat, lon: place.lon },
    MAX_DESTINATION_STOPS
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

  return nearest.filter(
    (stop) =>
      Number.isFinite(Number(stop.distanceMeters)) &&
      Number(stop.distanceMeters) <= radius
  );
}

/**
 * @param {{
 *   place: PlaceSearchResult | null | undefined,
 *   stops: readonly any[],
 *   serviceBoundary?: any,
 * }} input
 */
export function prepareExternalPlaceDestination({
  place,
  stops,
  serviceBoundary = null,
}) {
  if (!place || !hasCoordinates(place)) {
    return { ok: false, reason: "invalid-place", destination: null };
  }

  if (isInsideMultiPolygon(place, serviceBoundary) === false) {
    return {
      ok: false,
      reason: "outside-service-area",
      destination: null,
    };
  }

  const candidates = destinationStopsForPlace(stops, place);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no-nearby-stops",
      destination: null,
    };
  }

  /** @type {Record<string, number>} */
  const finalWalkDistanceByStop = {};
  for (const stop of candidates) {
    finalWalkDistanceByStop[String(stop.id)] = Math.round(
      Number(stop.distanceMeters)
    );
  }

  /** @type {DestinationIntent} */
  const destination = {
    id: `external:${place.provider}:${place.id}`,
    kind: "external-place",
    label: place.title,
    primaryStopId: String(candidates[0].id),
    acceptableStopIds: candidates.map((stop) => String(stop.id)),
    lat: place.lat,
    lon: place.lon,
    finalWalkDistanceByStop,
    source: place.provider === "osm-places" ? "osm-places" : "osm-nominatim",
  };

  return { ok: true, reason: "ready", destination };
}

/**
 * Backward-compatible pure converter for callers that only need a nullable
 * destination. New UI flows should prefer prepareExternalPlaceDestination so
 * they can explain why a place was rejected.
 *
 * @param {PlaceSearchResult | null | undefined} place
 * @param {readonly any[]} stops
 * @param {any} [serviceBoundary]
 * @returns {DestinationIntent | null}
 */
export function destinationFromExternalPlace(
  place,
  stops,
  serviceBoundary = null
) {
  return prepareExternalPlaceDestination({
    place,
    stops,
    serviceBoundary,
  }).destination;
}
