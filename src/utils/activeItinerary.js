import { normalizeItineraryOption } from "./itinerary";
import { assessTransfer } from "./transferFeasibility";

/** @import { ActiveDirectJourney, DestinationIntent, MultiLegJourneyOption } from "../types/journey" */

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {DestinationIntent | null | undefined} destination */
function destinationLabel(destination) {
  return String(destination?.label || "").trim();
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function currentItineraryIndex(journey) {
  const index = Number(journey?.activeLegIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function currentItineraryLeg(journey) {
  const index = currentItineraryIndex(journey);
  return index === null ? null : journey?.itinerary?.legs?.[index] || null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function nextItineraryTransfer(journey) {
  const index = currentItineraryIndex(journey);
  return index === null ? null : journey?.itinerary?.transfers?.[index] || null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function nextItineraryLeg(journey) {
  const index = currentItineraryIndex(journey);
  return index === null ? null : journey?.itinerary?.legs?.[index + 1] || null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
export function itineraryHasFutureLeg(journey) {
  return Boolean(nextItineraryTransfer(journey) && nextItineraryLeg(journey));
}

/**
 * @param {MultiLegJourneyOption | null | undefined} itinerary
 * @param {number} activeLegIndex
 * @returns {{transferPlan: import("../types/journey").TransferJourneyOption | null, transferLeg: 1 | 2 | null}}
 */
function legacyAliases(itinerary, activeLegIndex) {
  if (!itinerary || itinerary.legs.length !== 2) {
    return { transferPlan: null, transferLeg: null };
  }
  /** @type {import("../types/journey").TransferJourneyOption} */
  const legacy = {
    ...itinerary,
    first: itinerary.legs[0],
    transfer: itinerary.transfers[0],
    second: itinerary.legs[1],
  };
  return {
    transferPlan: legacy,
    transferLeg: activeLegIndex === 0 ? 1 : 2,
  };
}

/**
 * Build active state from a generic itinerary. The final door ETA remains
 * stable while the currently boarded leg changes; current-leg identity lives
 * in the top-level fields consumed by the existing board/Ride Mode surfaces.
 *
 * @param {MultiLegJourneyOption | import("../types/journey").TransferJourneyOption | any} option
 * @param {DestinationIntent} destination
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function activeJourneyFromItinerary(
  option,
  destination,
  nowMs = Date.now()
) {
  const itinerary = normalizeItineraryOption(option);
  const selectedAt = Number(nowMs);
  const destinationId = String(destination?.id || "");
  const label = destinationLabel(destination);
  const first = itinerary?.legs?.[0];

  if (
    !itinerary ||
    !first ||
    !destinationId ||
    !label ||
    !Number.isFinite(selectedAt) ||
    selectedAt <= 0
  ) {
    return null;
  }

  const aliases = legacyAliases(itinerary, 0);
  return {
    id: itinerary.id,
    destinationId,
    destinationKind: destination.kind,
    destinationLabel: label,
    optionLabel: itinerary.legs.length > 1 ? "transfer" : "fastest",
    stopId: String(first.boardStopId),
    stopName: String(itinerary.originStopName || first.boardStopId),
    distanceMeters: Math.max(0, Number(itinerary.originDistanceMeters) || 0),
    tripRef: String(first.tripRef),
    lineRef: String(first.lineRef || ""),
    destinationStopId: String(first.exitStopId),
    destinationStopSequence:
      Number.isFinite(Number(first.exitStopSequence))
        ? Number(first.exitStopSequence)
        : null,
    departureAt: Number(first.departureAt),
    aimedDepartureAt: positive(first.aimedDepartureAt) ?? Number(first.departureAt),
    originAimedDepartureAt: positive(first.originAimedDepartureAt),
    destinationArrivalAt: itinerary.destinationArrivalAt,
    journeyArrivalAt: itinerary.journeyArrivalAt,
    finalWalkDistanceM: itinerary.finalWalkDistanceM,
    finalWalkSecEstimate: itinerary.finalWalkSecEstimate,
    liveState: first.liveState || "unknown",
    phase: "walking-to-stop",
    recoveryReason: null,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: selectedAt,
    itinerary,
    activeLegIndex: 0,
    futureLegRevalidations: {},
    ...aliases,
    transferRevalidation: null,
  };
}

/**
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {any} rideSession
 */
export function rideMatchesCurrentItineraryLeg(journey, rideSession) {
  const leg = currentItineraryLeg(journey);
  if (
    !leg ||
    String(rideSession?.tripRef || "") !== String(leg.tripRef || "") ||
    String(rideSession?.targetStop?.id || "") !== String(leg.exitStopId || "")
  ) {
    return false;
  }

  const selectedSequence = Number(leg.exitStopSequence);
  const rideSequence = Number(rideSession?.targetStop?.stopSequence);
  return !(
    Number.isFinite(selectedSequence) &&
    selectedSequence > 0 &&
    Number.isFinite(rideSequence) &&
    rideSequence > 0 &&
    selectedSequence !== rideSequence
  );
}

/**
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {any} rideSession
 */
export function rideReachedCurrentTransfer(journey, rideSession) {
  return (
    itineraryHasFutureLeg(journey) &&
    rideSession?.stage === "now" &&
    rideMatchesCurrentItineraryLeg(journey, rideSession)
  );
}

/**
 * @param {ActiveDirectJourney} journey
 * @param {number} index
 * @param {number} nowMs
 * @param {import("../types/journey").ActiveJourneyPhase} phase
 * @param {import("../types/journey").ActiveJourneyRecoveryReason} recoveryReason
 * @returns {ActiveDirectJourney | null}
 */
function projectLeg(journey, index, nowMs, phase, recoveryReason) {
  const itinerary = journey?.itinerary;
  const leg = itinerary?.legs?.[index];
  const transfer = itinerary?.transfers?.[index - 1] || null;
  if (!itinerary || !leg || index < 0) return null;

  const selectedAt = Number(nowMs);
  if (!Number.isFinite(selectedAt) || selectedAt <= 0) return null;

  const aliases = legacyAliases(itinerary, index);
  return {
    ...journey,
    stopId: String(leg.boardStopId),
    stopName: String(
      transfer?.boardStopName || leg.boardStopId
    ),
    distanceMeters: Math.max(0, Number(transfer?.walkingDistanceM) || 0),
    tripRef: String(leg.tripRef),
    lineRef: String(leg.lineRef || ""),
    destinationStopId: String(leg.exitStopId),
    destinationStopSequence:
      Number.isFinite(Number(leg.exitStopSequence))
        ? Number(leg.exitStopSequence)
        : null,
    departureAt: Number(leg.departureAt),
    aimedDepartureAt: positive(leg.aimedDepartureAt) ?? Number(leg.departureAt),
    originAimedDepartureAt: positive(leg.originAimedDepartureAt),
    liveState: leg.liveState || "schedule",
    phase,
    recoveryReason,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: Math.max(Number(journey.lastSeenAt) || 0, selectedAt),
    activeLegIndex: index,
    ...aliases,
    transferRevalidation:
      journey.futureLegRevalidations?.[index + 1] || null,
  };
}

/**
 * Ride Mode owns the current transit leg. Only authoritative NOW at the exact
 * selected occurrence can advance to the next committed leg.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {any} rideSession
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function advanceItineraryAfterRide(
  journey,
  rideSession,
  nowMs = Date.now()
) {
  if (
    !journey?.itinerary ||
    journey.phase === "recovery" ||
    !rideReachedCurrentTransfer(journey, rideSession)
  ) {
    return null;
  }

  const currentIndex = currentItineraryIndex(journey);
  const next = nextItineraryLeg(journey);
  const transfer = nextItineraryTransfer(journey);
  if (currentIndex === null || !next || !transfer) return null;

  const selectedAt = Number(nowMs);
  const nowSec = Math.floor(selectedAt / 1000);
  const departureAt = positive(next.departureAt);
  if (departureAt === null) return null;

  const feasibility = assessTransfer({
    incomingArrivalAt: nowSec,
    outgoingDepartureAt: departureAt,
    walkingDistanceM: transfer.walkingDistanceM,
    sameStop:
      String(transfer.alightStopId) === String(transfer.boardStopId),
    incomingLiveState: "live",
  });
  const missed = departureAt <= nowSec;
  const phase = feasibility.recommendable ? "walking-to-stop" : "recovery";
  const recoveryReason =
    phase === "recovery"
      ? missed
        ? "transfer-missed"
        : "transfer-risk"
      : null;

  return projectLeg(
    journey,
    currentIndex + 1,
    selectedAt,
    phase,
    recoveryReason
  );
}

/**
 * Ending Ride Mode before authoritative transfer arrival never advances the
 * itinerary. If NOW was reached while a future-leg failure was already known,
 * move to that next leg only as recovery context.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {any} rideSession
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function recoverItineraryAfterRide(
  journey,
  rideSession,
  nowMs = Date.now()
) {
  if (!journey?.itinerary || !itineraryHasFutureLeg(journey)) return null;

  const currentIndex = currentItineraryIndex(journey);
  const next = nextItineraryLeg(journey);
  if (currentIndex === null || !next) return null;

  const selectedAt = Number(nowMs);
  if (!Number.isFinite(selectedAt) || selectedAt <= 0) return null;

  const existingTransferFailure =
    journey.phase === "recovery" &&
    ["transfer-cancelled", "transfer-risk", "transfer-missed"].includes(
      String(journey.recoveryReason || "")
    );

  if (existingTransferFailure && rideReachedCurrentTransfer(journey, rideSession)) {
    return projectLeg(
      journey,
      currentIndex + 1,
      selectedAt,
      "recovery",
      journey.recoveryReason
    );
  }

  if (existingTransferFailure) {
    return {
      ...journey,
      selectedAt,
      lastSeenAt: Math.max(Number(journey.lastSeenAt) || 0, selectedAt),
    };
  }

  const nowSec = Math.floor(selectedAt / 1000);
  const missed =
    rideSession?.stage === "missed" ||
    (positive(next.departureAt) !== null && nowSec >= Number(next.departureAt));

  return {
    ...journey,
    phase: "recovery",
    recoveryReason: missed ? "transfer-missed" : "transfer-risk",
    selectedAt,
    lastSeenAt: Math.max(Number(journey.lastSeenAt) || 0, selectedAt),
  };
}

/**
 * Apply fresh/degraded state to a concrete committed future leg. Only strong
 * live decisions fail the itinerary; stale/degraded/unknown observations are
 * retained as uncertainty. A live delay updates the concrete leg and shifts
 * that leg's planned arrival by the same amount, without fabricating changes
 * to later independent buses.
 *
 * @param {ActiveDirectJourney | null} journey
 * @param {number} legIndex
 * @param {import("../types/journey").TransferRevalidationState | null | undefined} revalidation
 * @returns {ActiveDirectJourney | null}
 */
export function applyFutureLegRevalidation(
  journey,
  legIndex,
  revalidation
) {
  const itinerary = journey?.itinerary;
  const index = Number(legIndex);
  const currentIndex = currentItineraryIndex(journey);
  if (
    !itinerary ||
    currentIndex === null ||
    !Number.isInteger(index) ||
    index <= currentIndex ||
    index >= itinerary.legs.length ||
    !revalidation
  ) {
    return journey;
  }

  const previous = journey.futureLegRevalidations?.[index];
  if (
    previous === revalidation ||
    (previous && JSON.stringify(previous) === JSON.stringify(revalidation))
  ) {
    return journey;
  }

  const futureLegRevalidations = {
    ...(journey.futureLegRevalidations || {}),
    [index]: revalidation,
  };
  let nextItinerary = itinerary;

  if (
    revalidation.providerState === "live" &&
    positive(revalidation.departureAt) !== null
  ) {
    const oldLeg = itinerary.legs[index];
    const newDepartureAt = Number(revalidation.departureAt);
    const oldDepartureAt = positive(oldLeg.departureAt);
    const shift =
      oldDepartureAt === null ? 0 : newDepartureAt - oldDepartureAt;
    /** @type {import("../types/journey").TransferTransitLeg[]} */
    const legs = itinerary.legs.map((leg, legIndexValue) =>
      legIndexValue === index
        ? {
            ...leg,
            departureAt: newDepartureAt,
            arrivalAt: Number(leg.arrivalAt) + shift,
            liveState:
              Math.abs(shift) >= 30 ? "delayed" : "live",
          }
        : leg
    );
    nextItinerary = { ...itinerary, legs };
  }

  const recoveryReason =
    revalidation.decision === "cancelled"
      ? "transfer-cancelled"
      : revalidation.decision === "missed"
        ? "transfer-missed"
        : revalidation.decision === "unsafe"
          ? "transfer-risk"
          : null;

  const next = {
    ...journey,
    itinerary: nextItinerary,
    futureLegRevalidations,
    transferRevalidation:
      index === currentIndex + 1
        ? revalidation
        : journey.transferRevalidation,
  };

  if (journey.phase === "recovery" || !recoveryReason) return next;

  return {
    ...next,
    phase: "recovery",
    recoveryReason,
  };
}
