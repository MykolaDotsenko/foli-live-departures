import {
  compareJourneyTimeCandidates,
  formatServiceDateTimeLocal,
  journeyTimeAllows,
  normalizeJourneyTimeConstraint,
  parseServiceDateTimeLocal,
} from "./journeyTime";

/** @import { JourneyTimeMode, JourneyPlan, RoutingPreference } from "../types/journey" */

export const JOURNEY_MODES = Object.freeze([
  "leave-now",
  "leave-at",
  "arrive-by",
]);

export const ROUTING_PREFERENCES = Object.freeze([
  "balanced",
  "fewer-transfers",
  "less-walking",
  "more-buffer",
]);

/** @type {Readonly<JourneyPlan>} */
export const DEFAULT_JOURNEY_PLAN = Object.freeze({
  mode: "leave-now",
  targetTimeSec: null,
  preference: "balanced",
});

export const MORE_BUFFER_MIN_SLACK_SEC = 5 * 60;
const PREFERENCE_ARRIVAL_TRADEOFF_SEC = 10 * 60;

/** @param {unknown} value @returns {number | null} */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {Partial<JourneyPlan> | null | undefined} plan @returns {JourneyPlan} */
export function normalizeJourneyPlan(plan) {
  /** @type {JourneyTimeMode} */
  const mode =
    plan?.mode === "leave-at" || plan?.mode === "arrive-by"
      ? plan.mode
      : "leave-now";
  /** @type {RoutingPreference} */
  const preference = ROUTING_PREFERENCES.includes(
    /** @type {any} */ (plan?.preference)
  )
    ? /** @type {RoutingPreference} */ (plan.preference)
    : "balanced";
  return {
    mode,
    targetTimeSec: mode === "leave-now" ? null : positive(plan?.targetTimeSec),
    preference,
  };
}

/** @param {Partial<JourneyPlan> | null | undefined} plan */
export function journeyPlanKey(plan) {
  const normalized = normalizeJourneyPlan(plan);
  return [
    normalized.mode,
    normalized.targetTimeSec || "",
    normalized.preference,
  ].join(":");
}

/**
 * Delegate every time-window decision to journeyTime.js, the single timezone
 * and DST source of truth.
 *
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @param {number} [nowSec]
 */
export function journeySearchReferenceSec(plan, nowSec) {
  return normalizeJourneyTimeConstraint(normalizeJourneyPlan(plan), nowSec)
    .referenceTimeSec;
}

/** @param {any} option */
export function firstDepartureAt(option) {
  return (
    positive(option?.departure?.departureAt) ??
    positive(option?.legs?.[0]?.departureAt)
  );
}

/** @param {any} option */
export function finalArrivalAt(option) {
  return (
    positive(option?.departure?.journeyArrivalAt) ??
    positive(option?.departure?.destinationArrivalAt) ??
    positive(option?.journeyArrivalAt) ??
    positive(option?.destinationArrivalAt)
  );
}

/** @param {any} option */
export function journeyTransferCount(option) {
  if (Array.isArray(option?.transfers)) return option.transfers.length;
  if (Array.isArray(option?.legs)) return Math.max(0, option.legs.length - 1);
  return 0;
}

/** @param {any} option */
export function journeyWalkingMeters(option) {
  const directBoard = Number(option?.distanceMeters);
  const directFinal = Number(option?.departure?.finalWalkDistanceM);
  if (Number.isFinite(directBoard) || Number.isFinite(directFinal)) {
    return (
      (Number.isFinite(directBoard) && directBoard >= 0 ? directBoard : 0) +
      (Number.isFinite(directFinal) && directFinal >= 0 ? directFinal : 0)
    );
  }
  const total = Number(option?.totalWalkingDistanceM);
  return Number.isFinite(total) && total >= 0
    ? total
    : Number.POSITIVE_INFINITY;
}

/** @param {any} option */
export function minimumTransferSlackSec(option) {
  const transfers = Array.isArray(option?.transfers) ? option.transfers : [];
  if (transfers.length === 0) return Number.POSITIVE_INFINITY;
  const values = transfers.map((item) => Number(item?.feasibility?.slackSec));
  if (values.some((value) => !Number.isFinite(value))) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.min(...values);
}

/** @param {any} option */
function timeCandidate(option) {
  return {
    departureAt: firstDepartureAt(option),
    journeyArrivalAt: finalArrivalAt(option),
    destinationArrivalAt: finalArrivalAt(option),
  };
}

/**
 * Time is a hard constraint. "More transfer time" additionally means every
 * known transfer must have at least five minutes of slack; it is not a badge.
 *
 * @param {any} option
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @param {number} [nowSec]
 */
export function journeyPlanAllowsOption(option, plan, nowSec) {
  const normalized = normalizeJourneyPlan(plan);
  if (!journeyTimeAllows(timeCandidate(option), normalized, nowSec)) {
    return false;
  }
  return !(
    normalized.preference === "more-buffer" &&
    minimumTransferSlackSec(option) < MORE_BUFFER_MIN_SLACK_SEC
  );
}

/**
 * Explicit preferences may trade at most ten minutes of door-arrival time.
 * Outside that bound the clock intent wins, preventing a preference from
 * silently producing a dramatically slower route.
 *
 * @param {any} left
 * @param {any} right
 * @param {Partial<JourneyPlan> | null | undefined} plan
 */
export function compareJourneyOptions(left, right, plan) {
  const normalized = normalizeJourneyPlan(plan);
  const timeOrder = compareJourneyTimeCandidates(
    timeCandidate(left),
    timeCandidate(right),
    normalized
  );
  const transferDelta =
    journeyTransferCount(left) - journeyTransferCount(right);
  const walkingDelta =
    journeyWalkingMeters(left) - journeyWalkingMeters(right);
  const bufferDelta =
    minimumTransferSlackSec(right) - minimumTransferSlackSec(left);
  const leftArrival = finalArrivalAt(left);
  const rightArrival = finalArrivalAt(right);
  const arrivalGap =
    leftArrival !== null && rightArrival !== null
      ? Math.abs(leftArrival - rightArrival)
      : Number.POSITIVE_INFINITY;

  if (
    normalized.preference !== "balanced" &&
    arrivalGap <= PREFERENCE_ARRIVAL_TRADEOFF_SEC
  ) {
    if (normalized.preference === "fewer-transfers" && transferDelta !== 0) {
      return transferDelta;
    }
    if (
      normalized.preference === "less-walking" &&
      Number.isFinite(walkingDelta) &&
      walkingDelta !== 0
    ) {
      return walkingDelta;
    }
    if (
      normalized.preference === "more-buffer" &&
      Number.isFinite(bufferDelta) &&
      bufferDelta !== 0
    ) {
      return bufferDelta;
    }
  }

  return (
    timeOrder ||
    transferDelta ||
    walkingDelta ||
    (firstDepartureAt(left) ?? Number.POSITIVE_INFINITY) -
      (firstDepartureAt(right) ?? Number.POSITIVE_INFINITY)
  );
}

// Compatibility names kept for tests/callers while delegating to journeyTime.
export const serviceWallTimeToEpochSec = parseServiceDateTimeLocal;
export const journeyPlanInputValue = formatServiceDateTimeLocal;
