/** @import { ActiveDirectJourney, DestinationIntent, FinalWalkIntent } from "../types/journey" */

const ORIGIN_TOLERANCE_SEC = 30;

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Capture the final walking leg before pre-boarding state is cleared by
 * Ride Mode. The handoff belongs only to the same concrete trip and alighting
 * stop the passenger selected.
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
  const targetStopId = String(rideConfig?.targetStop?.id || "");
  const activeLegIndex = Number(journey?.activeLegIndex);
  const hasFutureItineraryLeg =
    journey?.itinerary &&
    Number.isInteger(activeLegIndex) &&
    activeLegIndex >= 0 &&
    Boolean(journey.itinerary.legs?.[activeLegIndex + 1]);
  if (
    hasFutureItineraryLeg ||
    (journey?.transferPlan && journey.transferLeg === 1)
  ) {
    return null;
  }

  if (
    !journey ||
    destination?.kind !== "external-place" ||
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

  const selectedDistance =
    journey.finalWalkDistanceM === null ||
    journey.finalWalkDistanceM === undefined
      ? null
      : Number(journey.finalWalkDistanceM);
  const mappedRaw =
    destination.finalWalkDistanceByStop?.[targetStopId];
  const mappedDistance =
    mappedRaw === null || mappedRaw === undefined
      ? null
      : Number(mappedRaw);

  const fromLat = Number(rideConfig?.targetStop?.lat);
  const fromLon = Number(rideConfig?.targetStop?.lon);
  const hasOriginCoordinates =
    Number.isFinite(fromLat) &&
    fromLat >= -90 &&
    fromLat <= 90 &&
    Number.isFinite(fromLon) &&
    fromLon >= -180 &&
    fromLon <= 180;

  return {
    destinationId: destination.id,
    destinationLabel: destination.label,
    lat,
    lon,
    fromStopId: targetStopId,
    fromStopName: String(rideConfig?.targetStop?.name || targetStopId),
    ...(hasOriginCoordinates ? { fromLat, fromLon } : {}),
    distanceMeters:
      selectedDistance !== null &&
      Number.isFinite(selectedDistance) &&
      selectedDistance >= 0
        ? selectedDistance
        : mappedDistance !== null &&
            Number.isFinite(mappedDistance) &&
            mappedDistance >= 0
          ? mappedDistance
          : null,
  };
}

/**
 * Final walking guidance is released only when Ride Mode reached its
 * authoritative NOW stage for the same target stop. Turning Ride Mode off
 * earlier must never pretend the passenger arrived.
 *
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
