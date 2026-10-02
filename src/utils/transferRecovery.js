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
function activeLegIndex(journey) {
  const index = Number(journey?.activeLegIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function failedRevalidation(revalidation) {
  return ["cancelled", "missed", "unsafe"].includes(
    String(revalidation?.decision || "")
  );
}

/**
 * The concrete committed leg whose failure caused recovery. A downstream
 * failure can be known before the passenger reaches that leg; once the next
 * safe transfer boundary is reached, recovery replans the remaining journey
 * while excluding that concrete failed run.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function failedRecoveryLeg(journey) {
  const itinerary = journey?.itinerary;
  const current = activeLegIndex(journey);
  if (!itinerary || current === null) return null;

  for (let index = current; index < itinerary.legs.length; index += 1) {
    if (failedRevalidation(journey?.futureLegRevalidations?.[index])) {
      return itinerary.legs[index] || null;
    }
  }

  return itinerary.legs[current] || null;
}

export function canSearchTransferRecovery(journey) {
  const current = activeLegIndex(journey);
  return Boolean(
    journey?.phase === "recovery" &&
      journey?.itinerary &&
      current !== null &&
      current > 0 &&
      journey.itinerary.legs?.[current]
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
  if (!canSearchTransferRecovery(journey)) return [];

  const current = activeLegIndex(journey);
  const previousTransfer =
    current !== null ? journey?.itinerary?.transfers?.[current - 1] : null;
  const alightStopId = String(previousTransfer?.alightStopId || "");
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
  const failed = failedRecoveryLeg(journey);
  if (
    !failed ||
    String(departure?.tripRef || "") !== String(failed.tripRef || "")
  ) {
    return false;
  }

  const selectedOrigin = positive(failed.originAimedDepartureAt);
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
