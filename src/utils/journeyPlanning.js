import {
  ARRIVE_BY_LOOKBACK_SEC,
  compareJourneyTimeCandidates,
  formatServiceDateTimeLocal,
  journeyTimeAllows,
  normalizeJourneyTimeConstraint,
  parseServiceDateTimeLocal,
} from "./journeyTime";
import { SERVICE_TIME_ZONE } from "./time";

/** @import { JourneyMode, JourneyPlan, RoutingPreference } from "../types/journey" */

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

/** @param {unknown} value @returns {number | null} */
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @returns {JourneyPlan}
 */
export function normalizeJourneyPlan(plan) {
  const requestedMode = String(plan?.mode || "");
  const requestedPreference = String(plan?.preference || "");
  /** @type {JourneyMode} */
  const mode =
    requestedMode === "leave-at" || requestedMode === "arrive-by"
      ? requestedMode
      : "leave-now";
  /** @type {RoutingPreference} */
  const preference =
    requestedPreference === "fewer-transfers" ||
    requestedPreference === "less-walking" ||
    requestedPreference === "more-buffer"
      ? requestedPreference
      : "balanced";
  const targetTimeSec =
    mode === "leave-now" ? null : finitePositive(plan?.targetTimeSec);

  return { mode, targetTimeSec, preference };
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
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @param {number} [nowSec]
 */
export function journeySearchReferenceSec(
  plan,
  nowSec = Date.now() / 1000
) {
  const normalized = normalizeJourneyPlan(plan);
  return normalizeJourneyTimeConstraint(normalized, nowSec).referenceTimeSec;
}

/** @param {any} option */
export function firstDepartureAt(option) {
  return (
    finitePositive(option?.departure?.departureAt) ??
    finitePositive(option?.legs?.[0]?.departureAt)
  );
}

/** @param {any} option */
export function finalArrivalAt(option) {
  return (
    finitePositive(option?.departure?.journeyArrivalAt) ??
    finitePositive(option?.departure?.destinationArrivalAt) ??
    finitePositive(option?.journeyArrivalAt) ??
    finitePositive(option?.destinationArrivalAt)
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
  let minimum = Number.POSITIVE_INFINITY;
  for (const transfer of transfers) {
    const slack = Number(transfer?.feasibility?.slackSec);
    if (!Number.isFinite(slack)) return Number.NEGATIVE_INFINITY;
    minimum = Math.min(minimum, slack);
  }
  return minimum;
}

/**
 * @param {any} option
 * @returns {{departureAt:number|null, journeyArrivalAt:number|null, destinationArrivalAt:number|null}}
 */
function timeCandidate(option) {
  return {
    departureAt: firstDepartureAt(option),
    journeyArrivalAt: finalArrivalAt(option),
    destinationArrivalAt: finalArrivalAt(option),
  };
}

/**
 * A concrete option must satisfy both its time intent and any hard preference.
 * More-transfer-time is a real constraint, not a cosmetic sort.
 *
 * @param {any} option
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @param {number} [nowSec]
 */
export function journeyPlanAllowsOption(
  option,
  plan,
  nowSec = Date.now() / 1000
) {
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
 * Preference-aware deterministic ordering for concrete route options.
 * Time semantics are delegated to journeyTime.js so DST/service-window logic
 * has a single implementation.
 *
 * @param {any} left
 * @param {any} right
 * @param {Partial<JourneyPlan> | null | undefined} plan
 */
export function compareJourneyOptions(left, right, plan) {
  const normalized = normalizeJourneyPlan(plan);
  const transferDelta =
    journeyTransferCount(left) - journeyTransferCount(right);
  const walkingDelta =
    journeyWalkingMeters(left) - journeyWalkingMeters(right);
  const bufferDelta =
    minimumTransferSlackSec(right) - minimumTransferSlackSec(left);

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

  return (
    compareJourneyTimeCandidates(
      timeCandidate(left),
      timeCandidate(right),
      normalized
    ) ||
    transferDelta ||
    walkingDelta
  );
}

/**
 * @param {unknown} value
 * @param {{prefer?: "earliest" | "latest"}} [options]
 */
export function serviceWallTimeToEpochSec(value, options) {
  return parseServiceDateTimeLocal(value, options);
}

/** @param {unknown} epochSec */
export function journeyPlanInputValue(epochSec) {
  return formatServiceDateTimeLocal(epochSec);
}

export function serviceTimeZone() {
  return SERVICE_TIME_ZONE;
}

export { ARRIVE_BY_LOOKBACK_SEC };
