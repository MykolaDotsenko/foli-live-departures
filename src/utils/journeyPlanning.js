import { SERVICE_TIME_ZONE, serviceDateTimeFormat } from "./time";

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

const ARRIVE_BY_SEARCH_WINDOW_SEC = 8 * 60 * 60;
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
  const mode = /** @type {JourneyMode | undefined} */ (
    JOURNEY_MODES.find((value) => value === requestedMode)
  ) || DEFAULT_JOURNEY_PLAN.mode;
  /** @type {RoutingPreference} */
  const preference = /** @type {RoutingPreference | undefined} */ (
    ROUTING_PREFERENCES.find((value) => value === requestedPreference)
  ) || DEFAULT_JOURNEY_PLAN.preference;
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
 * The first timetable instant a bounded search needs to inspect.
 * Arrive-by deliberately looks backwards only eight hours; this is a journey
 * planner, not an unbounded timetable browser.
 *
 * @param {Partial<JourneyPlan> | null | undefined} plan
 * @param {number} [nowSec]
 */
export function journeySearchReferenceSec(
  plan,
  nowSec = Date.now() / 1000
) {
  const normalized = normalizeJourneyPlan(plan);
  const now = finitePositive(nowSec) ?? Math.floor(Date.now() / 1000);
  if (normalized.mode === "leave-now" || normalized.targetTimeSec === null) {
    return now;
  }
  if (normalized.mode === "leave-at") {
    return Math.max(now, normalized.targetTimeSec);
  }
  return Math.max(
    now,
    normalized.targetTimeSec - ARRIVE_BY_SEARCH_WINDOW_SEC
  );
}

/** @param {any} option */
export function firstDepartureAt(option) {
  const direct = finitePositive(option?.departure?.departureAt);
  if (direct !== null) return direct;
  return finitePositive(option?.legs?.[0]?.departureAt);
}

/** @param {any} option */
export function finalArrivalAt(option) {
  const direct =
    finitePositive(option?.departure?.journeyArrivalAt) ??
    finitePositive(option?.departure?.destinationArrivalAt);
  if (direct !== null) return direct;
  return (
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
 * A concrete option must satisfy the requested clock constraint. The
 * more-buffer preference is also a real constraint: every transfer needs at
 * least five minutes of slack, otherwise the option is not shown.
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
  const departureAt = firstDepartureAt(option);
  const arrivalAt = finalArrivalAt(option);
  const now = finitePositive(nowSec) ?? Math.floor(Date.now() / 1000);
  if (departureAt === null || arrivalAt === null || departureAt < now - 30) {
    return false;
  }

  if (
    normalized.preference === "more-buffer" &&
    minimumTransferSlackSec(option) < MORE_BUFFER_MIN_SLACK_SEC
  ) {
    return false;
  }

  if (normalized.mode === "leave-now" || normalized.targetTimeSec === null) {
    return true;
  }
  if (normalized.mode === "leave-at") {
    return departureAt >= normalized.targetTimeSec - 30;
  }
  return arrivalAt <= normalized.targetTimeSec;
}

/**
 * Preference-aware deterministic ordering for concrete route options.
 * Arrive-by prefers the latest usable departure; other modes prefer earliest
 * door arrival. Explicit route preferences are applied before that timing
 * tie-break.
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

  const leftDeparture = firstDepartureAt(left) ?? Number.POSITIVE_INFINITY;
  const rightDeparture = firstDepartureAt(right) ?? Number.POSITIVE_INFINITY;
  const leftArrival = finalArrivalAt(left) ?? Number.POSITIVE_INFINITY;
  const rightArrival = finalArrivalAt(right) ?? Number.POSITIVE_INFINITY;

  if (normalized.mode === "arrive-by") {
    return (
      rightDeparture - leftDeparture ||
      transferDelta ||
      walkingDelta ||
      leftArrival - rightArrival
    );
  }

  return (
    leftArrival - rightArrival ||
    transferDelta ||
    walkingDelta ||
    leftDeparture - rightDeparture
  );
}

/**
 * @param {number} epochMs
 * @returns {Record<string, string>}
 */
function wallParts(epochMs) {
  const parts = serviceDateTimeFormat(
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    "en-CA"
  ).formatToParts(new Date(epochMs));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/**
 * @param {Record<string, string>} parts
 * @param {{year:number, month:number, day:number, hour:number, minute:number}} expected
 */
function sameWall(parts, expected) {
  return (
    Number(parts.year) === expected.year &&
    Number(parts.month) === expected.month &&
    Number(parts.day) === expected.day &&
    Number(parts.hour) === expected.hour &&
    Number(parts.minute) === expected.minute
  );
}

/**
 * Convert a datetime-local wall time into an epoch in the Turku service zone.
 * We search all plausible UTC offsets around the wall-clock guess and accept
 * only exact round trips through Intl. Non-existent DST times fail closed.
 * Ambiguous fall-back times are deterministic: earliest by default.
 *
 * @param {unknown} value
 * @param {{prefer?: "earliest" | "latest"}} [options]
 * @returns {number | null}
 */
export function serviceWallTimeToEpochSec(
  value,
  { prefer = "earliest" } = {}
) {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) return null;
  const expected = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  if (
    expected.month < 1 ||
    expected.month > 12 ||
    expected.day < 1 ||
    expected.day > 31 ||
    expected.hour > 23 ||
    expected.minute > 59
  ) {
    return null;
  }

  const wallGuess = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute
  );
  /** @type {number[]} */
  const matches = [];
  for (let offsetMinutes = -240; offsetMinutes <= 240; offsetMinutes += 15) {
    const candidate = wallGuess + offsetMinutes * 60_000;
    if (sameWall(wallParts(candidate), expected)) matches.push(candidate);
  }
  if (matches.length === 0) return null;
  const selected =
    prefer === "latest" ? Math.max(...matches) : Math.min(...matches);
  return Math.floor(selected / 1000);
}

/** @param {unknown} epochSec */
export function journeyPlanInputValue(epochSec) {
  const seconds = finitePositive(epochSec);
  if (seconds === null) return "";
  const parts = wallParts(seconds * 1000);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function serviceTimeZone() {
  return SERVICE_TIME_ZONE;
}
