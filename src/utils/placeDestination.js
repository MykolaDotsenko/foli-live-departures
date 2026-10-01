import { findNearestStops, hasCoordinates } from "./geo";
import { estimatedWalkSeconds } from "./journeyWalk";

/** @import { DestinationIntent, PlaceSearchResult } from "../types/journey" */

const MAX_DESTINATION_STOPS = 8;
const PREFERRED_FINAL_WALK_M = 900;
const MAX_FINAL_WALK_M = 1_500;
const MIN_CANDIDATE_STOPS = 3;

/**
 * Keep enough alternatives for direction/branch optimisation without letting
 * a place search turn every stop in the region into a destination candidate.
 *
 * Prefer stops within 900 m. If the local stop pattern is sparse, fill up to
 * three candidates from the nearest stops, but never beyond 1.5 km.
 *
 * @param {readonly ({ id: string, name?: string, lat?: unknown, lon?: unknown } & Record<string, any>)[]} stops
 * @param {{ lat: number, lon: number }} point
 */
export function destinationStopsForPoint(stops, point) {
  if (!hasCoordinates(point)) return [];

  const nearest = findNearestStops(
    stops.filter((stop) => /^\d+$/.test(String(stop?.id || ""))),
    point,
    Math.max(MAX_DESTINATION_STOPS * 3, 24)
  ).filter(
    (stop) =>
      Number.isFinite(stop.distanceMeters) &&
      stop.distanceMeters <= MAX_FINAL_WALK_M
  );

  const preferred = nearest.filter(
    (stop) => stop.distanceMeters <= PREFERRED_FINAL_WALK_M
  );

  const chosen = preferred.slice(0, MAX_DESTINATION_STOPS);
  if (chosen.length >= MIN_CANDIDATE_STOPS) return chosen;

  const chosenIds = new Set(chosen.map((stop) => String(stop.id)));
  for (const stop of nearest) {
    if (chosen.length >= MIN_CANDIDATE_STOPS) break;
    if (chosenIds.has(String(stop.id))) continue;
    chosen.push(stop);
    chosenIds.add(String(stop.id));
  }

  return chosen.slice(0, MAX_DESTINATION_STOPS);
}

/**
 * @param {PlaceSearchResult | null | undefined} place
 * @param {readonly ({ id: string, name?: string, lat?: unknown, lon?: unknown } & Record<string, any>)[]} stops
 * @returns {DestinationIntent | null}
 */
export function destinationFromSearchPlace(place, stops) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  const id = String(place?.id || "").trim();
  const label = String(place?.label || "").trim();

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

  const candidates = destinationStopsForPoint(stops, { lat, lon });
  if (candidates.length === 0) return null;

  const distances = Object.fromEntries(
    candidates.map((stop) => [
      String(stop.id),
      Math.round(Number(stop.distanceMeters)),
    ])
  );
  const walkSeconds = Object.fromEntries(
    candidates.map((stop) => [
      String(stop.id),
      estimatedWalkSeconds(stop.distanceMeters),
    ])
  );
  const names = Object.fromEntries(
    candidates.map((stop) => [
      String(stop.id),
      String(stop.name || stop.id),
    ])
  );

  return {
    id: `place-search:${id}`,
    kind: "place",
    label,
    primaryStopId: String(candidates[0].id),
    acceptableStopIds: candidates.map((stop) => String(stop.id)),
    lat,
    lon,
    destinationStopDistancesM: distances,
    destinationStopWalkSeconds: walkSeconds,
    destinationStopNames: names,
    placeProvider: "nominatim",
  };
}
