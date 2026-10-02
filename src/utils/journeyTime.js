import { SERVICE_TIME_ZONE } from "./time";

/** @import { JourneyTimeConstraint, JourneyTimeMode } from "../types/journey" */

/**
 * @typedef {{
 *   mode: JourneyTimeMode,
 *   valid: boolean,
 *   targetTimeSec: number | null,
 *   referenceTimeSec: number,
 *   earliestDepartureAt: number | null,
 *   arriveByTimeSec: number | null,
 * }} NormalizedJourneyTime
 */

/** @typedef {{year:number, month:number, day:number, hour:number, minute:number, second:number}} ServiceWallParts */

// Eight hours covers a normal same-day trip while keeping client-side
// timetable enumeration strictly bounded.
export const ARRIVE_BY_LOOKBACK_SEC = 8 * 60 * 60;
export const JOURNEY_TIME_MODES = Object.freeze([
  "leave-now",
  "leave-at",
  "arrive-by",
]);

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {unknown} value @returns {JourneyTimeMode} */
function validMode(value) {
  const requested = String(value || "");
  if (requested === "leave-at" || requested === "arrive-by") return requested;
  return "leave-now";
}

/** @param {number} epochMs @returns {ServiceWallParts} */
function serviceParts(epochMs) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** @param {ServiceWallParts} parts @param {Omit<ServiceWallParts, "second">} target */
function sameWallTime(parts, target) {
  return (
    parts.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour === target.hour &&
    parts.minute === target.minute
  );
}

/** @param {unknown} value @returns {Omit<ServiceWallParts, "second"> | null} */
function parseLocalValue(value) {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) return null;

  const target = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };

  const probe = new Date(
    Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute
    )
  );
  if (
    probe.getUTCFullYear() !== target.year ||
    probe.getUTCMonth() + 1 !== target.month ||
    probe.getUTCDate() !== target.day ||
    probe.getUTCHours() !== target.hour ||
    probe.getUTCMinutes() !== target.minute
  ) {
    return null;
  }
  return target;
}

/**
 * Parse one Helsinki wall-clock datetime-local value to epoch seconds.
 * Non-existent spring-forward times fail closed. Ambiguous fall-back times
 * are deterministic and may select the earlier or later physical instant.
 *
 * @param {unknown} value
 * @param {{prefer?: "earliest" | "latest"}} [options]
 * @returns {number | null}
 */
export function parseServiceDateTimeLocal(
  value,
  { prefer = "earliest" } = {}
) {
  const target = parseLocalValue(value);
  if (!target) return null;

  const desiredWallMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute
  );

  // Iterate from the naive UTC wall time to one Helsinki-zone solution.
  let guess = desiredWallMs;
  for (let index = 0; index < 4; index += 1) {
    const actual = serviceParts(guess);
    const actualWallMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute
    );
    guess += desiredWallMs - actualWallMs;
  }

  // Search the DST ambiguity window and retain only exact round trips.
  /** @type {number[]} */
  const candidates = [];
  for (const delta of [-7_200_000, -3_600_000, 0, 3_600_000, 7_200_000]) {
    const candidate = guess + delta;
    if (sameWallTime(serviceParts(candidate), target)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return null;
  const selected =
    prefer === "latest" ? Math.max(...candidates) : Math.min(...candidates);
  return Math.floor(selected / 1000);
}

/**
 * Format epoch seconds for a datetime-local input in Helsinki wall time.
 *
 * @param {unknown} epochSeconds
 */
export function formatServiceDateTimeLocal(epochSeconds) {
  const seconds = positive(epochSeconds);
  if (seconds === null) return "";
  const parts = serviceParts(seconds * 1000);
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, "0");
  return [
    String(parts.year).padStart(4, "0"),
    "-",
    pad(parts.month),
    "-",
    pad(parts.day),
    "T",
    pad(parts.hour),
    ":",
    pad(parts.minute),
  ].join("");
}

/**
 * @param {Partial<JourneyTimeConstraint> | null | undefined} constraint
 * @param {number} [nowSec]
 * @returns {NormalizedJourneyTime}
 */
export function normalizeJourneyTimeConstraint(
  constraint,
  nowSec = Math.floor(Date.now() / 1000)
) {
  const now = positive(nowSec) ?? Math.floor(Date.now() / 1000);
  const mode = validMode(constraint?.mode);

  if (mode === "leave-now") {
    return {
      mode,
      valid: true,
      targetTimeSec: null,
      referenceTimeSec: now,
      earliestDepartureAt: now,
      arriveByTimeSec: null,
    };
  }

  const target = positive(constraint?.targetTimeSec);
  if (target === null || target <= now - 30) {
    return {
      mode,
      valid: false,
      targetTimeSec: target,
      referenceTimeSec: now,
      earliestDepartureAt: null,
      arriveByTimeSec: mode === "arrive-by" ? target : null,
    };
  }

  if (mode === "leave-at") {
    return {
      mode,
      valid: true,
      targetTimeSec: target,
      referenceTimeSec: target,
      earliestDepartureAt: target,
      arriveByTimeSec: null,
    };
  }

  return {
    mode,
    valid: true,
    targetTimeSec: target,
    referenceTimeSec: Math.max(now, target - ARRIVE_BY_LOOKBACK_SEC),
    earliestDepartureAt: Math.max(now, target - ARRIVE_BY_LOOKBACK_SEC),
    arriveByTimeSec: target,
  };
}

/**
 * @param {{
 *   departureAt?: number | null,
 *   journeyArrivalAt?: number | null,
 *   destinationArrivalAt?: number | null,
 * }} candidate
 * @param {Partial<JourneyTimeConstraint> | null | undefined} constraint
 * @param {number} [nowSec]
 */
export function journeyTimeAllows(
  candidate,
  constraint,
  nowSec = Math.floor(Date.now() / 1000)
) {
  const normalized = normalizeJourneyTimeConstraint(constraint, nowSec);
  if (!normalized.valid) return false;

  const departure = positive(candidate?.departureAt);
  const arrival =
    positive(candidate?.journeyArrivalAt) ??
    positive(candidate?.destinationArrivalAt);
  if (departure === null || arrival === null) return false;

  if (
    normalized.earliestDepartureAt !== null &&
    departure < normalized.earliestDepartureAt - 30
  ) {
    return false;
  }

  if (
    normalized.arriveByTimeSec !== null &&
    arrival > normalized.arriveByTimeSec
  ) {
    return false;
  }

  return true;
}

/**
 * Compare candidates according to the passenger's time intent.
 * Arrive-by prefers the latest viable departure; other modes prefer the
 * earliest destination arrival.
 *
 * @param {{departureAt?:number|null, journeyArrivalAt?:number|null, destinationArrivalAt?:number|null}} left
 * @param {{departureAt?:number|null, journeyArrivalAt?:number|null, destinationArrivalAt?:number|null}} right
 * @param {Partial<JourneyTimeConstraint> | null | undefined} constraint
 */
export function compareJourneyTimeCandidates(left, right, constraint) {
  const mode = validMode(constraint?.mode);
  const leftDeparture = positive(left?.departureAt) ?? 0;
  const rightDeparture = positive(right?.departureAt) ?? 0;
  const leftArrival =
    positive(left?.journeyArrivalAt) ??
    positive(left?.destinationArrivalAt) ??
    Number.POSITIVE_INFINITY;
  const rightArrival =
    positive(right?.journeyArrivalAt) ??
    positive(right?.destinationArrivalAt) ??
    Number.POSITIVE_INFINITY;

  if (mode === "arrive-by") {
    return (
      rightDeparture - leftDeparture ||
      leftArrival - rightArrival
    );
  }

  return (
    leftArrival - rightArrival ||
    leftDeparture - rightDeparture
  );
}
