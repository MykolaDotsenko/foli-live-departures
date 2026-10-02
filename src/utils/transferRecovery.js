import { transferBoardingCandidates } from "./transferTopology";

/** @import { ActiveDirectJourney, NearbyDepartureFit, NearbyFitMap } from "../types/journey" */

const ORIGIN_MATCH_TOLERANCE_SEC = 30;

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Automatic transfer recovery is only valid once Ride Mode has
 * authoritatively moved the committed journey into leg 2 context. A leg-1
 * recovery can mean the passenger ended Ride Mode early and must not pretend
 * they are already at the transfer hub.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function canSearchTransferRecovery(journey) {
  const index = Number(journey?.activeLegIndex);
  return Boolean(
    journey?.itinerary &&
      Number.isInteger(index) &&
      index > 0 &&
      journey.phase === "recovery"
  );
}

/**
 * Build a tiny deterministic set of boarding platforms around the actual
 * transfer alighting stop. Distances are stop-to-stop geometry, not device
 * location, so no new location permission or persistence is introduced.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {readonly any[]} allStops
 */
export function transferRecoveryOriginStops(journey, allStops) {
  if (!canSearchTransferRecovery(journey) || !journey?.itinerary) return [];

  const index = Number(journey.activeLegIndex);
  const alightStopId = String(
    journey.itinerary.transfers?.[index - 1]?.alightStopId || ""
  );
  const confirmedBoardStopId =
    journey.atStopConfirmedAt &&
    /^\d+$/.test(String(journey.stopId || ""))
      ? String(journey.stopId)
      : "";
  const recoveryAnchorStopId = confirmedBoardStopId || alightStopId;
  if (!recoveryAnchorStopId) return [];

  const stops = Array.isArray(allStops) ? allStops : [];
  const byId = new Map(stops.map((stop) => [String(stop?.id || ""), stop]));

  return transferBoardingCandidates({
    alightStopId: recoveryAnchorStopId,
    stops,
    maxWalkM: 220,
    maxStops: 4,
  }).map((candidate) => {
    const catalogStop = byId.get(String(candidate.stopId)) || {};
    return {
      ...catalogStop,
      id: String(candidate.stopId),
      name: String(candidate.stopName || catalogStop.name || candidate.stopId),
      distanceMeters: Math.max(
        0,
        Number(candidate.walkingDistanceM) || 0
      ),
    };
  });
}

/**
 * Exclude the failed committed second run itself while allowing another bus
 * on the same line. Trip ref identifies the run in normal service; origin
 * planned time disambiguates providers that may reuse an identifier.
 *
 * @param {NearbyDepartureFit | null | undefined} departure
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function departureMatchesFailedTransferRun(departure, journey) {
  const index = Number(journey?.activeLegIndex);
  const failedLeg =
    journey?.itinerary && Number.isInteger(index)
      ? journey.itinerary.legs?.[index]
      : null;
  if (
    !failedLeg ||
    String(departure?.tripRef || "") !== String(failedLeg.tripRef || "")
  ) {
    return false;
  }

  const selectedOrigin = positive(failedLeg.originAimedDepartureAt);
  const candidateOrigin = positive(departure?.originAimedDepartureAt);
  return !(
    selectedOrigin !== null &&
    candidateOrigin !== null &&
    Math.abs(selectedOrigin - candidateOrigin) >
      ORIGIN_MATCH_TOLERANCE_SEC
  );
}

/**
 * @param {NearbyFitMap} fitsByStop
 * @param {ActiveDirectJourney | null | undefined} journey
 * @returns {NearbyFitMap}
 */
export function withoutFailedTransferRun(fitsByStop, journey) {
  /** @type {NearbyFitMap} */
  const filtered = {};

  for (const [stopId, fit] of Object.entries(fitsByStop || {})) {
    const departures = (Array.isArray(fit?.departures)
      ? fit.departures
      : fit?.best
        ? [fit.best]
        : []
    ).filter(
      (departure) => !departureMatchesFailedTransferRun(departure, journey)
    );

    filtered[stopId] = {
      ...fit,
      departures,
      best: departures[0] || null,
    };
  }

  return filtered;
}
