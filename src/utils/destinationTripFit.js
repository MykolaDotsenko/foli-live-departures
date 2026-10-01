import { parseGtfsClock } from "./gtfsSchedule";
import { resolveRideBoardingIndex } from "./rideProgress";

/** @import { TripStopTime } from "../types/foli" */

/** @param {unknown} value */
function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {string | null | undefined} value */
function gtfsClockSeconds(value) {
  const clock = parseGtfsClock(value);
  if (!clock) return null;
  return (clock.hour * 60 + clock.minute) * 60 + clock.second;
}

/**
 * @param {TripStopTime} boarding
 * @param {TripStopTime} destination
 * @returns {number | null}
 */
function stopRideDurationSec(boarding, destination) {
  const boardClock =
    gtfsClockSeconds(boarding.departureTime) ??
    gtfsClockSeconds(boarding.arrivalTime);
  const destinationClock =
    gtfsClockSeconds(destination.arrivalTime) ??
    gtfsClockSeconds(destination.departureTime);

  return boardClock !== null &&
    destinationClock !== null &&
    destinationClock >= boardClock
    ? destinationClock - boardClock
    : null;
}

/**
 * Repeated stop IDs are deliberately rejected unless the caller can anchor
 * the occurrence by stop_sequence.
 *
 * @param {TripStopTime[]} stopTimes
 * @param {string} boardingStopId
 * @param {number | null | undefined} boardingSequence
 * @param {number | null | undefined} aimedDepartureEpochSec
 * @returns {TripStopTime | null}
 */
export function resolveBoardingOccurrence(
  stopTimes,
  boardingStopId,
  boardingSequence,
  aimedDepartureEpochSec = null
) {
  const stopId = String(boardingStopId || "");
  const occurrences = stopTimes.filter(
    (item) => String(item.stopId) === stopId && item.pickupType !== 1
  );
  if (occurrences.length === 0) return null;

  const sequence = finiteNumber(boardingSequence);
  if (sequence !== null) {
    const exact = occurrences.find(
      (item) => Number(item.stopSequence) === sequence
    );
    if (exact) return exact;
  }

  if (occurrences.length === 1) return occurrences[0];

  const index = resolveRideBoardingIndex(
    stopTimes,
    stopId,
    aimedDepartureEpochSec
  );
  return index >= 0 ? stopTimes[index] : null;
}

/**
 * @param {{
 *   stopTimes: TripStopTime[],
 *   boardingStopId: string,
 *   boardingSequence?: number | null,
 *   boardingAimedDepartureEpochSec?: number | null,
 *   destinationStopIds: readonly string[],
 *   destinationStopAccess?: Record<string, { distanceMeters?: number, walkDurationSec?: number }>,
 * }} input
 */
export function analyzeTripFit({
  stopTimes,
  boardingStopId,
  boardingSequence = null,
  boardingAimedDepartureEpochSec = null,
  destinationStopIds,
  destinationStopAccess = {},
}) {
  const boarding = resolveBoardingOccurrence(
    stopTimes,
    boardingStopId,
    boardingSequence,
    boardingAimedDepartureEpochSec
  );
  if (!boarding) {
    return {
      compatible: false,
      reason: "boarding-ambiguous",
      boarding: null,
      destination: null,
      rideDurationSec: null,
    };
  }

  const targets = new Set(
    (Array.isArray(destinationStopIds) ? destinationStopIds : [])
      .map((id) => String(id || ""))
      .filter(Boolean)
  );

  if (targets.size === 0) {
    return {
      compatible: false,
      reason: "destination-missing",
      boarding,
      destination: null,
      rideDurationSec: null,
    };
  }

  const anyTarget = stopTimes.some((item) => targets.has(String(item.stopId)));
  const downstream = stopTimes.filter(
    (item) =>
      targets.has(String(item.stopId)) &&
      Number(item.stopSequence) > Number(boarding.stopSequence) &&
      item.dropOffType !== 1
  );

  if (downstream.length === 0) {
    return {
      compatible: false,
      reason: anyTarget
        ? "destination-not-downstream"
        : "destination-not-on-trip",
      boarding,
      destination: null,
      rideDurationSec: null,
      finalWalkDistanceM: 0,
      finalWalkDurationSec: 0,
      totalDurationSec: null,
    };
  }

  const ranked = downstream.map((destination, index) => {
    const rideDurationSec = stopRideDurationSec(boarding, destination);
    const access =
      destinationStopAccess?.[String(destination.stopId)] || {};
    const walkDistance = finiteNumber(access.distanceMeters);
    const walkDuration = finiteNumber(access.walkDurationSec);
    const finalWalkDistanceM =
      walkDistance !== null && walkDistance >= 0 ? walkDistance : 0;
    const finalWalkDurationSec =
      walkDuration !== null && walkDuration >= 0 ? walkDuration : 0;
    const totalDurationSec =
      rideDurationSec === null
        ? null
        : rideDurationSec + finalWalkDurationSec;

    return {
      destination,
      rideDurationSec,
      finalWalkDistanceM,
      finalWalkDurationSec,
      totalDurationSec,
      index,
    };
  });

  ranked.sort((left, right) => {
    const leftTotal =
      left.totalDurationSec === null
        ? Number.POSITIVE_INFINITY
        : left.totalDurationSec;
    const rightTotal =
      right.totalDurationSec === null
        ? Number.POSITIVE_INFINITY
        : right.totalDurationSec;

    return (
      leftTotal - rightTotal ||
      left.finalWalkDurationSec - right.finalWalkDurationSec ||
      Number(left.destination.stopSequence) -
        Number(right.destination.stopSequence) ||
      left.index - right.index
    );
  });

  const best = ranked[0];

  return {
    compatible: true,
    reason: "compatible",
    boarding,
    destination: best.destination,
    rideDurationSec: best.rideDurationSec,
    finalWalkDistanceM: best.finalWalkDistanceM,
    finalWalkDurationSec: best.finalWalkDurationSec,
    totalDurationSec: best.totalDurationSec,
  };
}
