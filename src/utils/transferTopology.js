import { distanceInMeters } from "./geo";
import { parseGtfsClock } from "./gtfsSchedule";
import { resolveBoardingOccurrence } from "./destinationTripFit";

/** @import { TripStopTime } from "../types/foli" */

/** @param {string | null | undefined} value */
function clockSeconds(value) {
  const clock = parseGtfsClock(value);
  return clock
    ? (clock.hour * 60 + clock.minute) * 60 + clock.second
    : null;
}

/**
 * Enumerate concrete downstream alighting occurrences that could become a
 * transfer point. Repeated stop IDs are preserved because occurrence identity
 * matters on loops; callers must carry stopSequence forward.
 *
 * @param {{
 *   stopTimes: TripStopTime[],
 *   boardingStopId: string,
 *   boardingSequence?: number | null,
 *   boardingAimedDepartureEpochSec?: number | null,
 *   maxOccurrences?: number,
 * }} input
 */
export function downstreamTransferOccurrences({
  stopTimes,
  boardingStopId,
  boardingSequence = null,
  boardingAimedDepartureEpochSec = null,
  maxOccurrences = 16,
}) {
  const boarding = resolveBoardingOccurrence(
    stopTimes,
    boardingStopId,
    boardingSequence,
    boardingAimedDepartureEpochSec
  );
  if (!boarding) return [];

  const boardClock =
    clockSeconds(boarding.departureTime) ??
    clockSeconds(boarding.arrivalTime);
  if (boardClock === null) return [];

  const limit = Math.max(
    0,
    Math.min(32, Math.floor(Number(maxOccurrences) || 0))
  );
  if (limit === 0) return [];

  return stopTimes
    .filter(
      (item) =>
        Number(item.stopSequence) > Number(boarding.stopSequence) &&
        item.dropOffType !== 1
    )
    .map((item) => {
      const at =
        clockSeconds(item.arrivalTime) ??
        clockSeconds(item.departureTime);
      const rideDurationSec =
        at !== null && at >= boardClock ? at - boardClock : null;

      return {
        stopId: String(item.stopId || ""),
        stopSequence: Number(item.stopSequence),
        rideDurationSec,
      };
    })
    .filter(
      (item) =>
        item.stopId &&
        Number.isFinite(item.stopSequence) &&
        item.rideDurationSec !== null
    )
    .slice(0, limit);
}


/**
 * Candidate boarding platforms for a transfer. Same-stop is always first.
 * Nearby-platform walking is approximate and bounded; without trustworthy
 * coordinates, no cross-stop guess is made.
 *
 * @param {{
 *   alightStopId: string,
 *   stops: readonly any[],
 *   maxWalkM?: number,
 *   maxStops?: number,
 * }} input
 */
export function transferBoardingCandidates({
  alightStopId,
  stops,
  maxWalkM = 220,
  maxStops = 3,
}) {
  const id = String(alightStopId || "");
  if (!id) return [];

  const stopList = Array.isArray(stops) ? stops : [];
  const exact = stopList.find((stop) => String(stop?.id || "") === id) || {
    id,
    name: "",
  };
  const result = [
    {
      stopId: id,
      stopName: String(exact.name || id),
      walkingDistanceM: 0,
      sameStop: true,
    },
  ];

  const lat = Number(exact.lat);
  const lon = Number(exact.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return result;

  const walkLimit = Math.max(0, Number(maxWalkM) || 0);
  const countLimit = Math.max(1, Math.min(6, Math.floor(Number(maxStops) || 1)));

  /** @type {{ stopId: string, stopName: string, walkingDistanceM: number, sameStop: false }[]} */
  const nearby = [];
  for (const stop of stopList) {
    if (String(stop?.id || "") === id) continue;

    const stopLat = Number(stop?.lat);
    const stopLon = Number(stop?.lon);
    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLon)) continue;

    const distance = distanceInMeters(
      { lat, lon },
      { lat: stopLat, lon: stopLon }
    );
    if (distance === null || !Number.isFinite(distance) || distance > walkLimit) {
      continue;
    }

    nearby.push({
      stopId: String(stop.id),
      stopName: String(stop.name || stop.id),
      walkingDistanceM: distance,
      sameStop: false,
    });
  }

  nearby.sort(
    (left, right) => left.walkingDistanceM - right.walkingDistanceM
  );

  return [
    ...result,
    ...nearby.slice(0, Math.max(0, countLimit - 1)),
  ];
}
