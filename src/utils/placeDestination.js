import { findNearestStops, hasCoordinates, isInsideMultiPolygon } from "./geo";

/** @import { DestinationIntent, PlaceSearchResult } from "../types/journey" */

// Dense hubs can have many platforms around the same destination. Keeping
// only eight can discard the only platform served by the useful concrete
// trip, even though matching these stop IDs against GTFS is local and cheap.
const MAX_DESTINATION_STOPS = 24;
const MIN_SEARCH_RADIUS_M = 700;
const EXTRA_RADIUS_M = 500;
const MAX_SEARCH_RADIUS_M = 1_600;

/**
 * @param {readonly any[]} stops
 * @param {{ lat?: unknown, lon?: unknown }} place
 */
export function destinationStopCandidates(stops, place) {
  if (!hasCoordinates(place)) return [];

  const nearest = findNearestStops(
    Array.isArray(stops) ? stops : [],
    place,
    MAX_DESTINATION_STOPS
  );
  if (nearest.length === 0) return [];

  const closest = Number(nearest[0].distanceMeters);
  if (!Number.isFinite(closest) || closest > MAX_SEARCH_RADIUS_M) return [];

  const radius = Math.min(
    MAX_SEARCH_RADIUS_M,
    Math.max(MIN_SEARCH_RADIUS_M, closest + EXTRA_RADIUS_M)
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
 *   serviceBoundary?: import("../types/foli").ServiceBoundary | null,
 * }} input
 */
export function prepareGeocodedDestination({
  place,
  stops,
  serviceBoundary = null,
}) {
  if (!place || !hasCoordinates(place)) {
    return { ok: false, reason: "invalid-place", destination: null };
  }

  const inside = isInsideMultiPolygon(place, serviceBoundary);
  if (inside === false) {
    return { ok: false, reason: "outside-service-area", destination: null };
  }

  const candidates = destinationStopCandidates(stops, place);
  if (candidates.length === 0) {
    return { ok: false, reason: "no-nearby-stops", destination: null };
  }

  const distances = Object.fromEntries(
    candidates.map((stop) => [
      String(stop.id),
      Number(stop.distanceMeters),
    ])
  );

  /** @type {DestinationIntent} */
  const destination = {
    id: `geo:${place.id}`,
    kind: "geocoded-place",
    label: String(place.label || "").trim() || String(place.secondaryLabel || "").trim(),
    primaryStopId: String(candidates[0].id),
    acceptableStopIds: candidates.map((stop) => String(stop.id)),
    lat: Number(place.lat),
    lon: Number(place.lon),
    destinationStopDistances: distances,
  };

  return { ok: true, reason: "ready", destination };
}
