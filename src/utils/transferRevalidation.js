import { getDepartureTime, dataAgeSeconds } from "./time";
import { assessTransfer } from "./transferFeasibility";

/** @import { ActiveDirectJourney, TransferFeasibility, TransferRevalidationDecision, TransferRevalidationState } from "../types/journey" */

export const TRANSFER_LIVE_MAX_AGE_SEC = 120;
export const TRANSFER_MISSING_CONFIRMATION_MS = 30_000;
export const TRANSFER_DEPARTED_GRACE_SEC = 120;
const PLANNED_MATCH_TOLERANCE_SEC = 90;
const ORIGIN_MATCH_TOLERANCE_SEC = 30;

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
function secondLeg(journey) {
  return journey?.transferPlan && journey.transferLeg === 1
    ? journey.transferPlan.second
    : null;
}

/**
 * @param {import("../types/journey").TransferProviderState} providerState
 * @param {TransferRevalidationDecision} decision
 * @param {number | null} departureAt
 * @param {TransferFeasibility | null} feasibility
 * @param {number | null} [missingSinceMs]
 * @returns {TransferRevalidationState}
 */
function state(
  providerState,
  decision,
  departureAt,
  feasibility,
  missingSinceMs = null
) {
  return {
    providerState,
    decision,
    departureAt,
    feasibility,
    missingSinceMs,
  };
}

/**
 * Exact selected-trip matching for the second leg. Trip ref is required;
 * planned/origin times add occurrence identity when the provider exposes them.
 *
 * @param {any} arrival
 * @param {ActiveDirectJourney | null | undefined} journey
 */
export function transferSecondArrivalMatches(arrival, journey) {
  const second = secondLeg(journey);
  if (!second || String(arrival?.tripref || "") !== String(second.tripRef || "")) {
    return false;
  }

  const selectedOrigin = positive(second.originAimedDepartureAt);
  const observedOrigin = positive(arrival?.originaimeddeparturetime);
  if (
    selectedOrigin !== null &&
    observedOrigin !== null &&
    Math.abs(selectedOrigin - observedOrigin) > ORIGIN_MATCH_TOLERANCE_SEC
  ) {
    return false;
  }

  const selectedPlanned =
    positive(second.aimedDepartureAt) ?? positive(second.departureAt);
  const observedPlanned =
    positive(arrival?.aimeddeparturetime) ??
    positive(arrival?.aimedarrivaltime);

  return (
    selectedPlanned === null ||
    observedPlanned === null ||
    Math.abs(selectedPlanned - observedPlanned) <= PLANNED_MATCH_TOLERANCE_SEC
  );
}

/**
 * @param {{
 *   journey?: ActiveDirectJourney | null,
 *   arrivals?: any[] | null,
 *   referenceTimeSec?: number | null,
 *   receivedAtMs?: number | null,
 *   feedError?: boolean,
 *   cancelled?: boolean,
 *   incomingArrivalAt?: number | null,
 *   incomingLiveState?: import("../types/journey").LiveState,
 *   previous?: TransferRevalidationState | null,
 * }} input
 * @returns {TransferRevalidationState}
 */
export function evaluateTransferRevalidation({
  journey,
  arrivals = [],
  referenceTimeSec = null,
  receivedAtMs = null,
  feedError = false,
  cancelled = false,
  incomingArrivalAt = null,
  incomingLiveState = "unknown",
  previous = null,
} = {}) {
  const second = secondLeg(journey);
  const plan = journey?.transferPlan;
  if (!second || !journey || !plan) {
    return state("idle", "unknown", null, null);
  }

  const plannedDepartureAt = positive(second.departureAt);
  const incomingAt =
    positive(incomingArrivalAt) ?? positive(plan.first?.arrivalAt);
  const reference = positive(referenceTimeSec);
  const received = positive(receivedAtMs);
  const plannedFeasibility = assessTransfer({
    incomingArrivalAt: incomingAt,
    outgoingDepartureAt: plannedDepartureAt,
    walkingDistanceM: plan.transfer.walkingDistanceM,
    sameStop:
      String(plan.transfer.alightStopId) ===
      String(plan.transfer.boardStopId),
    incomingLiveState,
  });

  if (cancelled) {
    return state(
      "cancelled",
      "cancelled",
      plannedDepartureAt,
      plannedFeasibility
    );
  }
  if (feedError) {
    return state(
      "degraded",
      "unknown",
      plannedDepartureAt,
      plannedFeasibility,
      previous?.missingSinceMs ?? null
    );
  }

  const arrival = (Array.isArray(arrivals) ? arrivals : []).find((candidate) =>
    transferSecondArrivalMatches(candidate, journey)
  );

  if (!arrival) {
    const missingSinceMs =
      previous?.providerState === "missing" &&
      positive(previous.missingSinceMs) !== null
        ? previous.missingSinceMs
        : received;
    const confirmed =
      received !== null &&
      positive(missingSinceMs) !== null &&
      received - Number(missingSinceMs) >= TRANSFER_MISSING_CONFIRMATION_MS;
    const pastGrace =
      reference !== null &&
      plannedDepartureAt !== null &&
      reference >= plannedDepartureAt + TRANSFER_DEPARTED_GRACE_SEC;

    return state(
      "missing",
      pastGrace && confirmed ? "missed" : "unknown",
      plannedDepartureAt,
      plannedFeasibility,
      missingSinceMs
    );
  }

  const providerAgeSec = dataAgeSeconds(arrival.recordedattime, reference);
  if (
    arrival.monitored !== true ||
    providerAgeSec === null ||
    providerAgeSec > TRANSFER_LIVE_MAX_AGE_SEC
  ) {
    return state("stale", "unknown", plannedDepartureAt, plannedFeasibility);
  }

  const liveDepartureAt =
    positive(getDepartureTime(arrival, reference)) ?? plannedDepartureAt;
  const feasibility = assessTransfer({
    incomingArrivalAt: incomingAt,
    outgoingDepartureAt: liveDepartureAt,
    walkingDistanceM: plan.transfer.walkingDistanceM,
    sameStop:
      String(plan.transfer.alightStopId) ===
      String(plan.transfer.boardStopId),
    incomingLiveState,
  });
  const providerObservedAt = positive(arrival.recordedattime);
  const clearlyDeparted =
    providerObservedAt !== null &&
    liveDepartureAt !== null &&
    arrival.vehicleatstop !== true &&
    providerObservedAt >= liveDepartureAt + 30;

  /** @type {TransferRevalidationDecision} */
  const decision = clearlyDeparted
    ? "missed"
    : !feasibility.recommendable
      ? "unsafe"
      : feasibility.state === "tight"
        ? "tight"
        : "good";

  return state("live", decision, liveDepartureAt, feasibility);
}

/**
 * Apply only evidence strong enough to change a committed transfer.
 * Degraded/stale/missing-unknown observations are recorded but cannot undo
 * or falsely fail a selected journey.
 *
 * @param {ActiveDirectJourney | null} journey
 * @param {TransferRevalidationState | null | undefined} revalidation
 * @returns {ActiveDirectJourney | null}
 */
export function applyTransferRevalidation(journey, revalidation) {
  if (!journey?.transferPlan || journey.transferLeg !== 1 || !revalidation) {
    return journey;
  }
  if (
    journey.transferRevalidation === revalidation ||
    (journey.transferRevalidation &&
      JSON.stringify(journey.transferRevalidation) ===
        JSON.stringify(revalidation))
  ) {
    return journey;
  }

  const next = { ...journey, transferRevalidation: revalidation };

  if (
    revalidation.providerState === "live" &&
    positive(revalidation.departureAt) !== null
  ) {
    const second = journey.transferPlan.second;
    const departureAt = Number(revalidation.departureAt);
    const aimedAt =
      positive(second.aimedDepartureAt) ?? positive(second.departureAt);
    const delaySec =
      aimedAt === null ? null : departureAt - aimedAt;

    next.transferPlan = {
      ...journey.transferPlan,
      transfer: {
        ...journey.transferPlan.transfer,
        feasibility:
          revalidation.feasibility ?? journey.transferPlan.transfer.feasibility,
      },
      second: {
        ...second,
        departureAt,
        liveState:
          delaySec !== null && Math.abs(delaySec) >= 30 ? "delayed" : "live",
      },
    };

    if (delaySec !== null) {
      const plannedDestinationArrival =
        positive(journey.transferPlan.destinationArrivalAt) ??
        positive(second?.arrivalAt) ??
        positive(journey.destinationArrivalAt);
      const plannedJourneyArrival =
        positive(journey.transferPlan.journeyArrivalAt) ??
        positive(journey.journeyArrivalAt) ??
        plannedDestinationArrival;

      next.destinationArrivalAt =
        plannedDestinationArrival === null
          ? journey.destinationArrivalAt
          : plannedDestinationArrival + delaySec;
      next.journeyArrivalAt =
        plannedJourneyArrival === null
          ? next.destinationArrivalAt
          : plannedJourneyArrival + delaySec;
    }
  }

  if (journey.phase === "recovery") return next;

  const recoveryReason =
    revalidation.decision === "cancelled"
      ? "transfer-cancelled"
      : revalidation.decision === "missed"
        ? "transfer-missed"
        : revalidation.decision === "unsafe"
          ? "transfer-risk"
          : null;

  return recoveryReason
    ? { ...next, phase: "recovery", recoveryReason }
    : next;
}
