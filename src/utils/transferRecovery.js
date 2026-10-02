import { transferBoardingCandidates } from "./transferTopology";

/** @import { ActiveDirectJourney, NearbyDepartureFit, NearbyFitMap } from "../types/journey" */

const ORIGIN_MATCH_TOLERANCE_SEC = 30;

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {any} state */
function strongFutureFailure(state) {
  return ["cancelled", "missed", "unsafe"].includes(
    String(state?.decision || "")
  );
}

/**
 * Resolve the concrete failed committed leg. A farther committed leg may be
 * the actual failure that caused recovery at the current safe transfer
 * boundary, so do not blindly exclude the current leg.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function failedRecoveryLeg(journey) {
  const itinerary = journey?.itinerary;
  const activeIndex = Number(journey?.activeLegIndex);
  if (
    !itinerary ||
    !Array.isArray(itinerary.legs) ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= itinerary.legs.length
  ) {
    return null;
  }

  const states = journey?.futureLegRevalidations || {};
  for (let index = activeIndex; index < itinerary.legs.length; index += 1) {
    if (strongFutureFailure(states[index])) {
      return itinerary.legs[index] || null;
    }
  }

  // Transfer-risk can also be created by authoritative transfer-feasibility
  // evidence at the boundary before a per-leg provider state exists.
  return itinerary.legs[activeIndex] || null;
}

/**
 * Resolve the transfer area from which a passenger may explicitly recover.
 * Recovery is allowed only after Ride Mode has authoritatively advanced to a
 * later transit leg; a failure observed while still on leg 1 does not unlock
 * this search.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function transferRecoveryContext(journey) {
  const itinerary = journey?.itinerary;
  const activeIndex = Number(journey?.activeLegIndex);
  const transferFailure = [
    "transfer-risk",
    "transfer-missed",
    "transfer-cancelled",
  ].includes(String(journey?.recoveryReason || ""));

  if (
    journey?.phase !== "recovery" ||
    !transferFailure ||
    !itinerary ||
    !Array.isArray(itinerary.legs) ||
    !Array.isArray(itinerary.transfers) ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 1 ||
    activeIndex >= itinerary.legs.length
  ) {
    return null;
  }

  const previousTransfer = itinerary.transfers[activeIndex - 1];
  const failedLeg = failedRecoveryLeg(journey);
  if (!failedLeg || !previousTransfer) return null;

  return { activeIndex, failedLeg, previousTransfer };
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function canSearchTransferRecovery(journey) {
  return Boolean(transferRecoveryContext(journey));
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
  const context = transferRecoveryContext(journey);
  if (!context) return [];

  const alightStopId = String(context.previousTransfer.alightStopId || "");
  const confirmedBoardStopId =
    journey?.atStopConfirmedAt &&
    /^\d+$/.test(String(journey?.stopId || ""))
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
      distanceMeters: Math.max(0, Number(candidate.walkingDistanceM) || 0),
    };
  });
}

/**
 * Identity used to keep the failed concrete run out of every recovery search.
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function failedTransferRunIdentity(journey) {
  const failedLeg = transferRecoveryContext(journey)?.failedLeg;
  const tripRef = String(failedLeg?.tripRef || "");
  if (!tripRef) return null;
  return {
    tripRef,
    originAimedDepartureAt: positive(failedLeg?.originAimedDepartureAt),
  };
}

/**
 * Exclude only the failed concrete run while allowing another departure on
 * the same line. Trip ref identifies the run in normal service; origin
 * planned time disambiguates providers that may reuse an identifier.
 *
 * @param {NearbyDepartureFit | null | undefined} departure
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function departureMatchesFailedTransferRun(departure, journey) {
  const failed = failedTransferRunIdentity(journey);
  const candidateTripRef = String(departure?.tripRef || "");
  if (!failed || !candidateTripRef || candidateTripRef !== failed.tripRef) {
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
