import { parseGtfsClock } from "./gtfsSchedule";
import { resolveRideBoardingIndex } from "./rideProgress";
import { approximateWalkSeconds } from "./walkingEstimate";

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
 *   destinationStopDistances?: Record<string, number> | null,
 * }} input
 */
export function analyzeTripFit({
  stopTimes,
  boardingStopId,
  boardingSequence = null,
  boardingAimedDepartureEpochSec = null,
  destinationStopIds,
  destinationStopDistances = null,
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
      finalWalkDistanceM: null,
      finalWalkDurationSec: null,
    };
  }

  const boardClock =
    gtfsClockSeconds(boarding.departureTime) ??
    gtfsClockSeconds(boarding.arrivalTime);

  const candidates = downstream.map((destination) => {
    const destinationClock =
      gtfsClockSeconds(destination.arrivalTime) ??
      gtfsClockSeconds(destination.departureTime);
    const rideDurationSec =
      boardClock !== null &&
      destinationClock !== null &&
      destinationClock >= boardClock
        ? destinationClock - boardClock
        : null;

    const rawDistance = destinationStopDistances
      ? finiteNumber(destinationStopDistances[String(destination.stopId)])
      : null;
    const finalWalkDistanceM =
      rawDistance !== null && rawDistance >= 0 ? rawDistance : null;
    const finalWalkDurationSec =
      approximateWalkSeconds(finalWalkDistanceM);

    return {
      destination,
      rideDurationSec,
      finalWalkDistanceM,
      finalWalkDurationSec,
    };
  });

  let selected = candidates[0];

  if (destinationStopDistances) {
    const scored = candidates
      .filter(
        (candidate) =>
          candidate.rideDurationSec !== null &&
          candidate.finalWalkDurationSec !== null
      )
      .sort(
        (left, right) =>
          left.rideDurationSec +
            left.finalWalkDurationSec -
            (right.rideDurationSec + right.finalWalkDurationSec) ||
          left.rideDurationSec - right.rideDurationSec ||
          Number(left.destination.stopSequence) -
            Number(right.destination.stopSequence)
      );

    if (scored.length > 0) selected = scored[0];
  }

  return {
    compatible: true,
    reason: "compatible",
    boarding,
    destination: selected.destination,
    rideDurationSec: selected.rideDurationSec,
    finalWalkDistanceM: selected.finalWalkDistanceM,
    finalWalkDurationSec: selected.finalWalkDurationSec,
  };
}
