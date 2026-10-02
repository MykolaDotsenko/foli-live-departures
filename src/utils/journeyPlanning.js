import { SERVICE_TIME_ZONE, serviceDateTimeFormat } from "./time";

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

export const DEFAULT_JOURNEY_PLAN = Object.freeze({
  mode: "leave-now",
  targetTimeSec: null,
  preference: "balanced",
});

const ARRIVE_BY_SEARCH_WINDOW_SEC = 8 * 60 * 60;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeJourneyPlan(plan) {
  const mode = JOURNEY_MODES.includes(plan?.mode)
    ? plan.mode
    : DEFAULT_JOURNEY_PLAN.mode;
  const preference = ROUTING_PREFERENCES.includes(plan?.preference)
    ? plan.preference
    : DEFAULT_JOURNEY_PLAN.preference;
  const targetTimeSec =
    mode === "leave-now" ? null : finitePositive(plan?.targetTimeSec);

  return { mode, targetTimeSec, preference };
}

export function journeyPlanKey(plan) {
  const normalized = normalizeJourneyPlan(plan);
  return [
    normalized.mode,
    normalized.targetTimeSec || "",
    normalized.preference,
  ].join(":");
}

export function journeySearchReferenceSec(plan, nowSec = Date.now() / 1000) {
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

function firstDepartureAt(option) {
  const direct = finitePositive(option?.departure?.departureAt);
  if (direct !== null) return direct;
  return finitePositive(option?.legs?.[0]?.departureAt);
}

function finalArrivalAt(option) {
  const direct =
    finitePositive(option?.departure?.journeyArrivalAt) ??
    finitePositive(option?.departure?.destinationArrivalAt);
  if (direct !== null) return direct;
  return (
    finitePositive(option?.journeyArrivalAt) ??
    finitePositive(option?.destinationArrivalAt)
  );
}

export function journeyPlanAllowsOption(option, plan, nowSec = Date.now() / 1000) {
  const normalized = normalizeJourneyPlan(plan);
  const departureAt = firstDepartureAt(option);
  const arrivalAt = finalArrivalAt(option);
  const now = finitePositive(nowSec) ?? Math.floor(Date.now() / 1000);
  if (departureAt === null || arrivalAt === null || departureAt < now - 30) {
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
 */
export function serviceWallTimeToEpochSec(value, { prefer = "earliest" } = {}) {
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

export function journeyPlanInputValue(epochSec) {
  const seconds = finitePositive(epochSec);
  if (seconds === null) return "";
  const parts = wallParts(seconds * 1000);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function serviceTimeZone() {
  return SERVICE_TIME_ZONE;
}
