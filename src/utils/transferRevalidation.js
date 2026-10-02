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

/**
 * Resolve a concrete committed future leg and the transfer immediately before
 * it. When legIndex is omitted, preserve the legacy "next leg" contract.
 *
 * @param {ActiveDirectJourney | null | undefined} journey
 * @param {number | null | undefined} legIndex
 */
function futureLegContext(journey, legIndex = null) {
  const activeIndex = Number(journey?.activeLegIndex);
  const targetIndex =
    Number.isInteger(Number(legIndex)) && Number(legIndex) >= 1
      ? Number(legIndex)
      : Number.isInteger(activeIndex) && activeIndex >= 0
        ? activeIndex + 1
        : 1;

  const leg = journey?.itinerary?.legs?.[targetIndex] || null;
  const incoming = journey?.itinerary?.legs?.[targetIndex - 1] || null;
  const transfer = journey?.itinerary?.transfers?.[targetIndex - 1] || null;
  return leg && incoming && transfer
    ? { targetIndex, leg, incoming, transfer }
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
 * @param {number | null} [legIndex]
 */
export function transferSecondArrivalMatches(arrival, journey, legIndex = null) {
  const context = futureLegContext(journey, legIndex);
  const second = context?.leg;
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
 *   legIndex?: number | null,
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
  legIndex = null,
} = {}) {
  const context = futureLegContext(journey, legIndex);
  const second = context?.leg;
  const transfer = context?.transfer;
  const incomingLeg = context?.incoming;
  if (!second || !journey || !transfer || !incomingLeg) {
    return state("idle", "unknown", null, null);
  }

  const plannedDepartureAt = positive(second.departureAt);
  const incomingAt =
    positive(incomingArrivalAt) ?? positive(incomingLeg.arrivalAt);
  const reference = positive(referenceTimeSec);
  const received = positive(receivedAtMs);
  const plannedFeasibility = assessTransfer({
    incomingArrivalAt: incomingAt,
    outgoingDepartureAt: plannedDepartureAt,
    walkingDistanceM: transfer.walkingDistanceM,
    sameStop:
      String(transfer.alightStopId) ===
      String(transfer.boardStopId),
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
    transferSecondArrivalMatches(candidate, journey, context.targetIndex)
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
    walkingDistanceM: transfer.walkingDistanceM,
    sameStop:
      String(transfer.alightStopId) ===
      String(transfer.boardStopId),
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
