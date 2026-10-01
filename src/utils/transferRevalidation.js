import { getDepartureTime, dataAgeSeconds } from "./time";
import { assessTransfer } from "./transferFeasibility";

/** @import { ActiveDirectJourney, TransferRevalidationState } from "../types/journey" */

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

/** @param {unknown} value */
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {ActiveDirectJourney | null | undefined} journey */
function secondLeg(journey) {
  return journey?.transferPlan && journey.transferLeg === 1
    ? journey.transferPlan.second
    : null;
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
 *   journey: ActiveDirectJourney | null | undefined,
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
  const idle = {
    providerState: "idle",
    decision: "unknown",
    departureAt: null,
    delaySec: null,
    feasibility: null,
    receivedAtMs: null,
    missingSinceMs: null,
    matchedAtMs: null,
    providerAgeSec: null,
  };

  if (!second) return idle;

  const plannedDepartureAt = positive(second.departureAt);
  const plannedAimedAt =
    positive(second.aimedDepartureAt) ?? plannedDepartureAt;
  const incomingAt =
    positive(incomingArrivalAt) ??
    positive(journey?.transferPlan?.first?.arrivalAt);
  const reference = positive(referenceTimeSec);
  const received = positive(receivedAtMs);

  const plannedFeasibility = assessTransfer({
    incomingArrivalAt: incomingAt,
    outgoingDepartureAt: plannedDepartureAt,
    walkingDistanceM: journey.transferPlan.transfer.walkingDistanceM,
    sameStop:
      String(journey.transferPlan.transfer.alightStopId) ===
      String(journey.transferPlan.transfer.boardStopId),
    incomingLiveState,
  });

  if (cancelled) {
    return {
      providerState: "cancelled",
      decision: "cancelled",
      departureAt: plannedDepartureAt,
      delaySec: null,
      feasibility: plannedFeasibility,
      receivedAtMs: received,
      missingSinceMs: null,
      matchedAtMs: previous?.matchedAtMs ?? null,
      providerAgeSec: null,
    };
  }

  if (feedError) {
    return {
      providerState: "degraded",
      decision: "unknown",
      departureAt: plannedDepartureAt,
      delaySec: null,
      feasibility: plannedFeasibility,
      receivedAtMs: received,
      missingSinceMs: previous?.missingSinceMs ?? null,
      matchedAtMs: previous?.matchedAtMs ?? null,
      providerAgeSec: null,
    };
  }

  const rows = Array.isArray(arrivals) ? arrivals : [];
  const arrival =
    rows.find((candidate) => transferSecondArrivalMatches(candidate, journey)) ||
    null;

  if (!arrival) {
    const missingSinceMs =
      previous?.providerState === "missing" &&
      positive(previous.missingSinceMs) !== null
        ? previous.missingSinceMs
        : received;
    const missingDurationMs =
      received !== null && positive(missingSinceMs) !== null
        ? Math.max(0, received - Number(missingSinceMs))
        : 0;
    const pastGrace =
      reference !== null &&
      plannedDepartureAt !== null &&
      reference >= plannedDepartureAt + TRANSFER_DEPARTED_GRACE_SEC;
    const confirmed =
      missingDurationMs >= TRANSFER_MISSING_CONFIRMATION_MS;

    return {
      providerState: "missing",
      decision: pastGrace && confirmed ? "missed" : "unknown",
      departureAt: plannedDepartureAt,
      delaySec: null,
      feasibility: plannedFeasibility,
      receivedAtMs: received,
      missingSinceMs,
      matchedAtMs: previous?.matchedAtMs ?? null,
      providerAgeSec: null,
    };
  }

  const providerAgeSec = dataAgeSeconds(arrival.recordedattime, reference);
  const fresh =
    arrival.monitored === true &&
    providerAgeSec !== null &&
    providerAgeSec <= TRANSFER_LIVE_MAX_AGE_SEC;
  const matchedAtMs = received ?? previous?.matchedAtMs ?? null;

  if (!fresh) {
    return {
      providerState: "stale",
      decision: "unknown",
      departureAt: plannedDepartureAt,
      delaySec: null,
      feasibility: plannedFeasibility,
      receivedAtMs: received,
      missingSinceMs: null,
      matchedAtMs,
      providerAgeSec,
    };
  }

  const liveDepartureAt =
    positive(getDepartureTime(arrival, reference)) ?? plannedDepartureAt;
  const delaySec =
    liveDepartureAt !== null && plannedAimedAt !== null
      ? liveDepartureAt - plannedAimedAt
      : null;
  const liveState =
    delaySec !== null && Math.abs(delaySec) >= 30 ? "delayed" : "live";
  const feasibility = assessTransfer({
    incomingArrivalAt: incomingAt,
    outgoingDepartureAt: liveDepartureAt,
    walkingDistanceM: journey.transferPlan.transfer.walkingDistanceM,
    sameStop:
      String(journey.transferPlan.transfer.alightStopId) ===
      String(journey.transferPlan.transfer.boardStopId),
    incomingLiveState,
  });

  const clearlyDeparted =
    reference !== null &&
    liveDepartureAt !== null &&
    arrival.vehicleatstop !== true &&
    reference >= liveDepartureAt + 30;

  let decision = "unknown";
  if (clearlyDeparted) decision = "missed";
  else if (!feasibility.recommendable) decision = "unsafe";
  else if (feasibility.state === "tight") decision = "tight";
  else decision = "good";

  return {
    providerState: "live",
    decision,
    departureAt: liveDepartureAt,
    delaySec,
    feasibility,
    receivedAtMs: received,
    missingSinceMs: null,
    matchedAtMs,
    providerAgeSec,
    liveState,
  };
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
function sameFeasibility(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return [
    "state",
    "recommendable",
    "incomingArrivalAt",
    "outgoingDepartureAt",
    "walkingDistanceM",
    "requiredSec",
    "availableSec",
    "slackSec",
  ].every((key) => left[key] === right[key]);
}

function sameRevalidation(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return [
    "providerState",
    "decision",
    "departureAt",
    "delaySec",
    "receivedAtMs",
    "missingSinceMs",
    "matchedAtMs",
    "providerAgeSec",
    "liveState",
  ].every((key) => left[key] === right[key]) &&
    sameFeasibility(left.feasibility, right.feasibility);
}

export function applyTransferRevalidation(journey, revalidation) {
  if (!journey?.transferPlan || journey.transferLeg !== 1 || !revalidation) {
    return journey;
  }
  if (sameRevalidation(journey.transferRevalidation, revalidation)) {
    return journey;
  }

  const next = {
    ...journey,
    transferRevalidation: revalidation,
  };

  if (
    revalidation.providerState === "live" &&
    positive(revalidation.departureAt) !== null
  ) {
    next.transferPlan = {
      ...journey.transferPlan,
      transfer: {
        ...journey.transferPlan.transfer,
        feasibility:
          revalidation.feasibility ?? journey.transferPlan.transfer.feasibility,
      },
      second: {
        ...journey.transferPlan.second,
        departureAt: Number(revalidation.departureAt),
        liveState: revalidation.liveState || "live",
      },
    };
  }

  if (journey.phase === "recovery") return next;

  if (revalidation.decision === "cancelled") {
    return {
      ...next,
      phase: "recovery",
      recoveryReason: "transfer-cancelled",
    };
  }
  if (revalidation.decision === "missed") {
    return {
      ...next,
      phase: "recovery",
      recoveryReason: "transfer-missed",
    };
  }
  if (revalidation.decision === "unsafe") {
    return {
      ...next,
      phase: "recovery",
      recoveryReason: "transfer-risk",
    };
  }

  return next;
}
