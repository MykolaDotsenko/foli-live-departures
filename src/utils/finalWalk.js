/** @import { ActiveDirectJourney, DestinationIntent, FinalWalkIntent } from "../types/journey" */

const ORIGIN_MATCH_TOLERANCE_SECONDS = 30;

/** @param {unknown} value */
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

/**
 * Arm a final-walk handoff only when Ride Mode is being started from the
 * exact Journey Assistant trip the passenger selected.
 *
 * Nothing is persisted. The returned object is safe to keep in React memory
 * for this tab only.
 *
 * @param {{
 *   journey: ActiveDirectJourney | null | undefined,
 *   destination: DestinationIntent | null | undefined,
 *   rideConfig: any,
 * }} input
 * @returns {FinalWalkIntent | null}
 */
export function finalWalkFromRideSelection({
  journey,
  destination,
  rideConfig,
}) {
  if (
    !journey ||
    destination?.kind !== "geocoded-place" ||
    journey.destinationId !== destination.id
  ) {
    return null;
  }

  const targetStopId = String(rideConfig?.targetStop?.id || "");
  const targetStopName = String(rideConfig?.targetStop?.name || targetStopId);
  if (
    !targetStopId ||
    targetStopId !== String(journey.destinationStopId || "") ||
    String(rideConfig?.tripRef || "") !== journey.tripRef
  ) {
    return null;
  }

  const selectedOrigin = finitePositive(journey.originAimedDepartureAt);
  const rideOrigin = finitePositive(rideConfig?.originAimedDepartureTime);
  if (
    selectedOrigin !== null &&
    rideOrigin !== null &&
    Math.abs(selectedOrigin - rideOrigin) > ORIGIN_MATCH_TOLERANCE_SECONDS
  ) {
    return null;
  }

  const lat = coordinate(destination.lat, -90, 90);
  const lon = coordinate(destination.lon, -180, 180);
  if (lat === null || lon === null) return null;

  const journeyDistance = Number(journey.finalWalkDistanceM);
  const mappedDistance = Number(
    destination.destinationStopDistances?.[targetStopId]
  );
  const distanceMeters =
    Number.isFinite(journeyDistance) && journeyDistance >= 0
      ? journeyDistance
      : Number.isFinite(mappedDistance) && mappedDistance >= 0
        ? mappedDistance
        : null;

  return {
    destinationId: destination.id,
    destinationLabel: destination.label,
    lat,
    lon,
    fromStopId: targetStopId,
    fromStopName: targetStopName,
    distanceMeters,
  };
}

/**
 * A final walk is shown only after Ride Mode reaches the selected exit and
 * the passenger ends the alert there. Turning Ride Mode off early or missing
 * the stop must not pretend that the passenger is at the destination side.
 *
 * @param {FinalWalkIntent | null | undefined} pending
 * @param {any} rideSession
 * @returns {FinalWalkIntent | null}
 */
export function completedFinalWalk(pending, rideSession) {
  if (
    !pending ||
    rideSession?.stage !== "now" ||
    String(rideSession?.targetStop?.id || "") !== pending.fromStopId
  ) {
    return null;
  }
  return pending;
}
