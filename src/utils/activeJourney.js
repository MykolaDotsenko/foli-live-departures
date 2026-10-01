import { getDepartureTime } from "./time";
import { assessTransfer } from "./transferFeasibility";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption, TransferJourneyOption } from "../types/journey" */

const DEPARTED_GRACE_SECONDS = 120;
const MISSING_CONFIRMATION_MS = 30_000;
const PLANNED_MATCH_TOLERANCE_SECONDS = 90;
const ORIGIN_MATCH_TOLERANCE_SECONDS = 30;

/** @param {unknown} value */
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {DestinationIntent | null | undefined} destination */
function destinationLabel(destination) {
  return String(destination?.label || "").trim();
}

/**
 * @param {DirectJourneyOption} option
 * @param {DestinationIntent} destination
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function activeJourneyFromOption(
  option,
  destination,
  nowMs = Date.now()
) {
  const stopId = String(option?.stopId || "");
  const tripRef = String(option?.departure?.tripRef || "");
  const lineRef = String(option?.departure?.lineRef || "");
  const destinationId = String(destination?.id || "");
  const label = destinationLabel(destination);
  const departureAt = finitePositive(option?.departure?.departureAt);
  const selectedAt = Number(nowMs);

  if (
    !/^\d+$/.test(stopId) ||
    !tripRef ||
    !destinationId ||
    !label ||
    departureAt === null ||
    !Number.isFinite(selectedAt) ||
    selectedAt <= 0
  ) {
    return null;
  }

  const aimedDepartureAt =
    finitePositive(option?.departure?.aimedDepartureAt) ?? null;
  const originAimedDepartureAt =
    finitePositive(option?.departure?.originAimedDepartureAt) ?? null;
  const destinationArrivalAt =
    finitePositive(option?.departure?.destinationArrivalAt) ?? null;
  const journeyArrivalAt =
    finitePositive(option?.departure?.journeyArrivalAt) ??
    destinationArrivalAt;
  const finalWalkDistanceM = Number(option?.departure?.finalWalkDistanceM);
  const finalWalkSecEstimate = Number(
    option?.departure?.finalWalkSecEstimate
  );

  return {
    id: String(option.id || [stopId, tripRef, departureAt].join(":")),
    destinationId,
    destinationKind: destination.kind,
    destinationLabel: label,
    optionLabel: option.label,
    stopId,
    stopName: String(option.stopName || stopId),
    distanceMeters: Math.max(0, Number(option.distanceMeters) || 0),
    tripRef,
    lineRef,
    destinationStopId: String(option.departure.destinationStopId || ""),
    destinationStopSequence: null,
    departureAt,
    aimedDepartureAt,
    originAimedDepartureAt,
    destinationArrivalAt,
    journeyArrivalAt,
    finalWalkDistanceM:
      Number.isFinite(finalWalkDistanceM) && finalWalkDistanceM >= 0
        ? finalWalkDistanceM
        : null,
    finalWalkSecEstimate:
      Number.isFinite(finalWalkSecEstimate) &&
      finalWalkSecEstimate >= 0
        ? finalWalkSecEstimate
        : null,
    liveState: option.departure.liveState || "unknown",
    phase: "walking-to-stop",
    recoveryReason: null,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: selectedAt,
    transferPlan: null,
    transferLeg: null,
  };
}

/**
 * @param {TransferJourneyOption} option
 * @param {DestinationIntent} destination
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function activeJourneyFromTransferOption(
  option,
  destination,
  nowMs = Date.now()
) {
  const first = option?.first;
  const second = option?.second;
  const stopId = String(option?.originStopId || "");
  const destinationId = String(destination?.id || "");
  const label = destinationLabel(destination);
  const selectedAt = Number(nowMs);
  const departureAt = finitePositive(first?.departureAt);
  const destinationArrivalAt = finitePositive(option?.destinationArrivalAt);
  const journeyArrivalAt =
    finitePositive(option?.journeyArrivalAt) ?? destinationArrivalAt;

  if (
    !/^\d+$/.test(stopId) ||
    !String(first?.tripRef || "") ||
    !String(second?.tripRef || "") ||
    !String(first?.exitStopId || "") ||
    !String(second?.exitStopId || "") ||
    !destinationId ||
    !label ||
    departureAt === null ||
    destinationArrivalAt === null ||
    journeyArrivalAt === null ||
    !Number.isFinite(selectedAt) ||
    selectedAt <= 0
  ) {
    return null;
  }

  return {
    id: String(option.id || [stopId, first.tripRef, departureAt].join(":")),
    destinationId,
    destinationKind: destination.kind,
    destinationLabel: label,
    optionLabel: "transfer",
    stopId,
    stopName: String(option.originStopName || stopId),
    distanceMeters: Math.max(0, Number(option.originDistanceMeters) || 0),
    tripRef: String(first.tripRef),
    lineRef: String(first.lineRef || ""),
    destinationStopId: String(first.exitStopId),
    destinationStopSequence:
      Number.isFinite(Number(first.exitStopSequence))
        ? Number(first.exitStopSequence)
        : null,
    departureAt,
    aimedDepartureAt:
      finitePositive(first.aimedDepartureAt) ?? departureAt,
    originAimedDepartureAt:
      finitePositive(first.originAimedDepartureAt) ?? null,
    destinationArrivalAt,
    journeyArrivalAt,
    finalWalkDistanceM:
      Number.isFinite(Number(option.finalWalkDistanceM)) &&
      Number(option.finalWalkDistanceM) >= 0
        ? Number(option.finalWalkDistanceM)
        : null,
    finalWalkSecEstimate:
      Number.isFinite(Number(option.finalWalkSecEstimate)) &&
      Number(option.finalWalkSecEstimate) >= 0
        ? Number(option.finalWalkSecEstimate)
        : null,
    liveState: first.liveState || "unknown",
    phase: "walking-to-stop",
    recoveryReason: null,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: selectedAt,
    transferPlan: option,
    transferLeg: 1,
  };
}

/**
 * Only the exact selected first leg may preserve a transfer plan into Ride
 * Mode. This prevents a manually opened different trip from inheriting the
 * selected connection.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {any} rideConfig
 * @returns {ActiveDirectJourney | null}
 */
export function transferJourneyForRideSelection(journey, rideConfig) {
  if (
    !journey?.transferPlan ||
    journey.transferLeg !== 1 ||
    journey.phase === "recovery"
  ) {
    return null;
  }
  if (String(rideConfig?.tripRef || "") !== journey.tripRef) return null;
  if (
    String(rideConfig?.targetStop?.id || "") !== journey.destinationStopId
  ) {
    return null;
  }

  const selectedSequence = Number(journey.destinationStopSequence);
  const rideSequence = Number(rideConfig?.targetStop?.stopSequence);
  if (
    Number.isFinite(selectedSequence) &&
    selectedSequence > 0 &&
    Number.isFinite(rideSequence) &&
    rideSequence > 0 &&
    selectedSequence !== rideSequence
  ) {
    return null;
  }

  return journey;
}

/**
 * Ride Mode is authoritative for leg 1. Only its NOW stage at the exact
 * selected transfer occurrence can advance Journey Mode to leg 2.
 *
 * @param {ActiveDirectJourney | null | undefined} pending
 * @param {any} rideSession
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function completedTransferJourney(
  pending,
  rideSession,
  nowMs = Date.now()
) {
  if (
    !pending?.transferPlan ||
    pending.transferLeg !== 1 ||
    pending.phase === "recovery" ||
    rideSession?.stage !== "now" ||
    String(rideSession?.tripRef || "") !== pending.tripRef ||
    String(rideSession?.targetStop?.id || "") !== pending.destinationStopId
  ) {
    return null;
  }

  const selectedSequence = Number(pending.destinationStopSequence);
  const rideSequence = Number(rideSession?.targetStop?.stopSequence);
  if (
    Number.isFinite(selectedSequence) &&
    selectedSequence > 0 &&
    Number.isFinite(rideSequence) &&
    rideSequence > 0 &&
    selectedSequence !== rideSequence
  ) {
    return null;
  }

  const plan = pending.transferPlan;
  const second = plan.second;
  const selectedAt = Number(nowMs);
  const departureAt = finitePositive(second?.departureAt);
  if (
    departureAt === null ||
    !Number.isFinite(selectedAt) ||
    selectedAt <= 0
  ) {
    return null;
  }

  const nowSec = Math.floor(selectedAt / 1000);
  const remainingTransfer = assessTransfer({
    incomingArrivalAt: nowSec,
    outgoingDepartureAt: departureAt,
    walkingDistanceM: plan.transfer.walkingDistanceM,
    sameStop:
      String(plan.transfer.alightStopId) ===
      String(plan.transfer.boardStopId),
    incomingLiveState: "live",
  });

  const missed = departureAt <= nowSec;
  const phase = remainingTransfer.recommendable
    ? "walking-to-stop"
    : "recovery";

  return {
    ...pending,
    stopId: String(second.boardStopId),
    stopName: String(plan.transfer.boardStopName || second.boardStopId),
    distanceMeters: Math.max(
      0,
      Number(plan.transfer.walkingDistanceM) || 0
    ),
    tripRef: String(second.tripRef),
    lineRef: String(second.lineRef || ""),
    destinationStopId: String(second.exitStopId),
    destinationStopSequence:
      Number.isFinite(Number(second.exitStopSequence))
        ? Number(second.exitStopSequence)
        : null,
    departureAt,
    aimedDepartureAt:
      finitePositive(second.aimedDepartureAt) ?? departureAt,
    originAimedDepartureAt:
      finitePositive(second.originAimedDepartureAt) ?? null,
    liveState: second.liveState || "schedule",
    phase,
    recoveryReason: phase === "recovery"
      ? missed
        ? "transfer-missed"
        : "transfer-risk"
      : null,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: selectedAt,
    transferLeg: 2,
  };
}

/**
 * Ending Ride Mode before it authoritatively reaches the selected transfer
 * occurrence must never silently advance to leg 2. Preserve the committed
 * plan only as recovery context so the passenger can deliberately choose
 * another option.
 *
 * @param {ActiveDirectJourney | null | undefined} pending
 * @param {any} rideSession
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function recoverTransferJourneyAfterRide(
  pending,
  rideSession,
  nowMs = Date.now()
) {
  if (!pending?.transferPlan || pending.transferLeg !== 1) return null;

  const selectedAt = Number(nowMs);
  if (!Number.isFinite(selectedAt) || selectedAt <= 0) return null;

  if (
    pending.phase === "recovery" &&
    ["transfer-cancelled", "transfer-risk", "transfer-missed"].includes(
      String(pending.recoveryReason || "")
    )
  ) {
    return {
      ...pending,
      selectedAt,
      lastSeenAt: Math.max(Number(pending.lastSeenAt) || 0, selectedAt),
    };
  }

  const secondDepartureAt = finitePositive(
    pending.transferPlan?.second?.departureAt
  );
  const nowSec = Math.floor(selectedAt / 1000);
  const missed =
    rideSession?.stage === "missed" ||
    (secondDepartureAt !== null && nowSec >= secondDepartureAt);

  return {
    ...pending,
    phase: "recovery",
    recoveryReason: missed ? "transfer-missed" : "transfer-risk",
    selectedAt,
    lastSeenAt: Math.max(Number(pending.lastSeenAt) || 0, selectedAt),
  };
}

/**
 * Compare a Journey Assistant option with an already selected concrete trip.
 * Used to keep a failed selected trip out of recovery alternatives without
 * hiding other departures that happen to share a line.
 *
 * @param {DirectJourneyOption | null | undefined} option
 * @param {ActiveDirectJourney | null | undefined} journey
 * @returns {boolean}
 */
export function directOptionMatchesActiveJourney(option, journey) {
  if (
    !journey ||
    String(option?.stopId || "") !== journey.stopId ||
    String(option?.departure?.tripRef || "") !== journey.tripRef
  ) {
    return false;
  }

  const selectedOrigin = finitePositive(
    journey.originAimedDepartureAt
  );
  const optionOrigin = finitePositive(
    option?.departure?.originAimedDepartureAt
  );

  if (
    selectedOrigin !== null &&
    optionOrigin !== null &&
    Math.abs(selectedOrigin - optionOrigin) >
      ORIGIN_MATCH_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const selectedPlanned = finitePositive(journey.aimedDepartureAt);
  const optionPlanned =
    finitePositive(option?.departure?.aimedDepartureAt) ??
    finitePositive(option?.departure?.departureAt);

  if (selectedPlanned === null || optionPlanned === null) return true;

  return (
    Math.abs(selectedPlanned - optionPlanned) <=
    PLANNED_MATCH_TOLERANCE_SECONDS
  );
}

/**
 * A trip ref identifies the run in normal service. Planned boarding time is
 * an additional occurrence anchor for loops/repeated visits when both sides
 * expose it.
 *
 * @param {any} arrival
 * @param {ActiveDirectJourney | null | undefined} journey
 * @returns {boolean}
 */
export function arrivalMatchesActiveJourney(arrival, journey) {
  if (!journey || String(arrival?.tripref || "") !== journey.tripRef) {
    return false;
  }

  const selectedOrigin = finitePositive(
    journey.originAimedDepartureAt
  );
  const observedOrigin = finitePositive(
    arrival?.originaimeddeparturetime
  );

  if (
    selectedOrigin !== null &&
    observedOrigin !== null &&
    Math.abs(selectedOrigin - observedOrigin) >
      ORIGIN_MATCH_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const selectedPlanned = finitePositive(journey.aimedDepartureAt);
  const observedPlanned =
    finitePositive(arrival?.aimeddeparturetime) ??
    finitePositive(arrival?.aimedarrivaltime);

  if (selectedPlanned === null || observedPlanned === null) return true;

  return (
    Math.abs(selectedPlanned - observedPlanned) <=
    PLANNED_MATCH_TOLERANCE_SECONDS
  );
}

/**
 * @param {ActiveDirectJourney | null} journey
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function confirmActiveJourneyAtStop(journey, nowMs = Date.now()) {
  if (!journey || journey.phase === "recovery") return journey;

  const confirmedAt = Number(nowMs);
  if (!Number.isFinite(confirmedAt) || confirmedAt <= 0) return journey;

  return {
    ...journey,
    phase: "waiting",
    atStopConfirmedAt: confirmedAt,
  };
}

/**
 * Reconcile the selected journey with the already-open stop board feed.
 * Missing data fails closed: provider/network failure never becomes
 * "your bus departed".
 *
 * @param {ActiveDirectJourney | null} journey
 * @param {{
 *   stopId: string,
 *   arrival: any | null,
 *   referenceTimeSec: number | null,
 *   receivedAtMs: number | null,
 *   feedError?: boolean,
 *   cancelled?: boolean,
 * }} observation
 * @returns {ActiveDirectJourney | null}
 */
export function observeActiveJourney(journey, observation) {
  if (!journey || String(observation?.stopId || "") !== journey.stopId) {
    return journey;
  }

  const arrival =
    observation?.arrival &&
    arrivalMatchesActiveJourney(observation.arrival, journey)
      ? observation.arrival
      : null;

  const receivedAtMs = finitePositive(observation?.receivedAtMs);
  const referenceTimeSec = finitePositive(observation?.referenceTimeSec);

  // A cancellation alert is stronger than disappearance from the board and
  // remains actionable even when the cancelled SIRI row has already gone.
  if (observation?.cancelled === true) {
    const updatedDeparture =
      arrival && referenceTimeSec !== null
        ? finitePositive(getDepartureTime(arrival, referenceTimeSec)) ??
          journey.departureAt
        : journey.departureAt;
    const observedPlanned = arrival
      ? finitePositive(arrival.aimeddeparturetime) ??
        finitePositive(arrival.aimedarrivaltime) ??
        journey.aimedDepartureAt
      : journey.aimedDepartureAt;
    const nextLastSeenAt =
      receivedAtMs === null
        ? journey.lastSeenAt
        : Math.max(journey.lastSeenAt, receivedAtMs);

    if (
      journey.departureAt === updatedDeparture &&
      journey.aimedDepartureAt === observedPlanned &&
      journey.phase === "recovery" &&
      journey.recoveryReason === "cancelled" &&
      journey.lastSeenAt === nextLastSeenAt
    ) {
      return journey;
    }

    return {
      ...journey,
      departureAt: updatedDeparture,
      aimedDepartureAt: observedPlanned,
      phase: "recovery",
      recoveryReason: "cancelled",
      lastSeenAt: nextLastSeenAt,
    };
  }

  if (arrival) {
    // The board can initially be a cached snapshot from before the passenger
    // selected this route. It may be useful to display, but it must not
    // overwrite the selected journey or undo recovery. Wait for a board
    // response received after selection.
    if (receivedAtMs === null || receivedAtMs <= journey.selectedAt) {
      return journey;
    }

    const updatedDeparture =
      finitePositive(getDepartureTime(arrival, referenceTimeSec)) ??
      journey.departureAt;
    const observedPlanned =
      finitePositive(arrival.aimeddeparturetime) ??
      finitePositive(arrival.aimedarrivaltime) ??
      journey.aimedDepartureAt;

    const departureShift = updatedDeparture - journey.departureAt;
    const firstTransferLeg =
      journey.transferPlan && journey.transferLeg === 1
        ? journey.transferPlan.first
        : null;
    // On a direct journey, a boarding delay shifts the downstream arrival.
    // On transfer leg 1 it only shifts the first bus's transfer arrival:
    // the committed second bus keeps its own timetable/live prediction.
    const shiftedDestinationArrival =
      firstTransferLeg
        ? journey.destinationArrivalAt
        : journey.destinationArrivalAt === null
          ? null
          : journey.destinationArrivalAt + departureShift;
    const shiftedJourneyArrival =
      firstTransferLeg
        ? journey.journeyArrivalAt
        : journey.journeyArrivalAt === null
          ? shiftedDestinationArrival
          : journey.journeyArrivalAt + departureShift;
    const shiftedFirstArrival =
      firstTransferLeg && finitePositive(firstTransferLeg.arrivalAt) !== null
        ? Number(firstTransferLeg.arrivalAt) + departureShift
        : null;
    /** @type {import("../types/journey").LiveState} */
    const firstLegLiveState =
      arrival.monitored === true ? "live" : "schedule";
    const nextTransferPlan =
      firstTransferLeg && journey.transferPlan
        ? {
            ...journey.transferPlan,
            first: {
              ...firstTransferLeg,
              departureAt: updatedDeparture,
              aimedDepartureAt: observedPlanned,
              arrivalAt:
                shiftedFirstArrival ?? firstTransferLeg.arrivalAt,
              liveState: firstLegLiveState,
            },
          }
        : journey.transferPlan;

    const nextLastSeenAt = Math.max(journey.lastSeenAt, receivedAtMs);
    const recoveredPhase = journey.atStopConfirmedAt
      ? "waiting"
      : "walking-to-stop";
    const canRecoverFromDeparture =
      journey.phase === "recovery" &&
      journey.recoveryReason === "departed";
    const nextPhase = canRecoverFromDeparture
      ? recoveredPhase
      : journey.phase;
    const nextRecoveryReason = canRecoverFromDeparture
      ? null
      : journey.recoveryReason;
    const nextLineRef = String(arrival.lineref || journey.lineRef);

    if (
      journey.departureAt === updatedDeparture &&
      journey.aimedDepartureAt === observedPlanned &&
      journey.destinationArrivalAt === shiftedDestinationArrival &&
      journey.journeyArrivalAt === shiftedJourneyArrival &&
      journey.transferPlan === nextTransferPlan &&
      journey.lineRef === nextLineRef &&
      journey.phase === nextPhase &&
      journey.recoveryReason === nextRecoveryReason &&
      journey.lastSeenAt === nextLastSeenAt
    ) {
      return journey;
    }

    return {
      ...journey,
      departureAt: updatedDeparture,
      aimedDepartureAt: observedPlanned,
      destinationArrivalAt: shiftedDestinationArrival,
      journeyArrivalAt: shiftedJourneyArrival,
      transferPlan: nextTransferPlan,
      lineRef: nextLineRef,
      phase: nextPhase,
      recoveryReason: nextRecoveryReason,
      lastSeenAt: nextLastSeenAt,
    };
  }

  if (
    observation?.feedError === true ||
    receivedAtMs === null ||
    referenceTimeSec === null ||
    receivedAtMs <= journey.selectedAt ||
    referenceTimeSec <= journey.departureAt + DEPARTED_GRACE_SECONDS ||
    receivedAtMs - journey.lastSeenAt < MISSING_CONFIRMATION_MS
  ) {
    return journey;
  }

  if (
    journey.phase === "recovery" &&
    journey.recoveryReason === "departed"
  ) {
    return journey;
  }

  return {
    ...journey,
    phase: "recovery",
    recoveryReason: "departed",
  };
}
