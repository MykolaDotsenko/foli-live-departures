/** @import { ActiveDirectJourney, DestinationIntent, FinalWalkIntent } from "../types/journey" */

const ORIGIN_TOLERANCE_SEC = 30;

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
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
  const targetStopId = String(rideConfig?.targetStop?.id || "");
  if (
    !journey ||
    destination?.kind !== "geocoded-place" ||
    journey.destinationId !== destination.id ||
    !targetStopId ||
    targetStopId !== String(journey.destinationStopId || "") ||
    String(rideConfig?.tripRef || "") !== journey.tripRef
  ) {
    return null;
  }

  const selectedOrigin = positive(journey.originAimedDepartureAt);
  const rideOrigin = positive(rideConfig?.originAimedDepartureTime);
  if (
    selectedOrigin !== null &&
    rideOrigin !== null &&
    Math.abs(selectedOrigin - rideOrigin) > ORIGIN_TOLERANCE_SEC
  ) {
    return null;
  }

  const lat = Number(destination.lat);
  const lon = Number(destination.lon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  const selectedDistance = Number(journey.finalWalkDistanceM);
  const mappedDistance = Number(
    destination.destinationStopDistances?.[targetStopId]
  );

  return {
    destinationId: destination.id,
    destinationLabel: destination.label,
    lat,
    lon,
    fromStopId: targetStopId,
    fromStopName: String(rideConfig?.targetStop?.name || targetStopId),
    distanceMeters:
      Number.isFinite(selectedDistance) && selectedDistance >= 0
        ? selectedDistance
        : Number.isFinite(mappedDistance) && mappedDistance >= 0
          ? mappedDistance
          : null,
  };
}

/**
 * @param {FinalWalkIntent | null | undefined} pending
 * @param {any} rideSession
 * @returns {FinalWalkIntent | null}
 */
export function completedFinalWalk(pending, rideSession) {
  return pending &&
    rideSession?.stage === "now" &&
    String(rideSession?.targetStop?.id || "") === pending.fromStopId
    ? pending
    : null;
}
