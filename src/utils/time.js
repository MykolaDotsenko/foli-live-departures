import { intlLocale, t } from "../i18n";

/** @import { Arrival, EpochSeconds } from "../types/foli" */

/**
 * @typedef {"expecteddeparturetime" | "expectedarrivaltime" | "aimeddeparturetime" | "aimedarrivaltime"} DepartureTimeField
 */

/** @typedef {{ day: string, time: string }} DueParts */

/** @type {readonly DepartureTimeField[]} */
const DEPARTURE_TIME_FIELDS = [
  "expecteddeparturetime",
  "expectedarrivaltime",
  "aimeddeparturetime",
  "aimedarrivaltime",
];

// How far ahead of its plan a bus plausibly runs. An estimate further ahead
// than this is more likely stale than early.
const PLAUSIBLY_EARLY_SECONDS = 180;

/**
 * @param {Partial<Pick<Arrival, DepartureTimeField | "monitored" | "vehicleatstop">>} [arrival]
 * @param {EpochSeconds | null} [referenceTimeSec]
 * @returns {EpochSeconds | null}
 */
export function getDepartureTime(arrival = {}, referenceTimeSec = null) {
  const values = Object.fromEntries(
    DEPARTURE_TIME_FIELDS.map((field) => {
      const value = Number(arrival[field]);
      return [field, Number.isFinite(value) && value > 0 ? value : null];
    })
  );

  const reference = Number(referenceTimeSec);
  if (Number.isFinite(reference) && reference > 0) {
    const earliestPlausible = reference - 30;
    const expected =
      values.expecteddeparturetime ?? values.expectedarrivaltime;
    const aimed = values.aimeddeparturetime ?? values.aimedarrivaltime;

    if (expected !== null && expected >= earliestPlausible) return expected;
    // A tracked bus whose estimate has passed a little ahead of its plan
    // ran early and has left: its plan said "2 min" for a bus already gone,
    // and on a board reopened offline it kept saying so until the planned
    // time. An estimate far ahead of the plan is not believed; neither a bus
    // still standing at the stop nor a row the feed is not tracking has
    // left by its estimate. Those fall back to the plan.
    if (
      expected !== null &&
      aimed !== null &&
      arrival.monitored === true &&
      arrival.vehicleatstop !== true &&
      aimed - expected <= PLAUSIBLY_EARLY_SECONDS
    ) {
      return expected;
    }
    if (aimed !== null && aimed >= earliestPlausible) return aimed;

    return expected ?? aimed ?? null;
  }

  for (const field of DEPARTURE_TIME_FIELDS) {
    if (values[field] !== null) return values[field];
  }

  return null;
}

// Departure times belong to the Turku region, not to wherever the device
// thinks it is. A phone still set to another zone must not show a bus leaving
// at the wrong wall-clock time.
export const SERVICE_TIME_ZONE = "Europe/Helsinki";

/**
 * @param {Intl.DateTimeFormatOptions} options
 * @param {string} [locale]
 * @returns {Intl.DateTimeFormat}
 */
export function serviceDateTimeFormat(options, locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: SERVICE_TIME_ZONE,
    });
  } catch {
    // A runtime without the full time zone database still gets a usable
    // clock, just in its own zone.
    return new Intl.DateTimeFormat(locale, options);
  }
}

// Stop timetables and the signs on the buses use the 24-hour clock, so every
// transit time does too, whatever language the phone is set to.
export const TRANSIT_CLOCK_LOCALE = "en-GB";

/**
 * @param {EpochSeconds | null | undefined} unixSeconds
 * @param {string} [locale]
 * @returns {string}
 */
export function formatClock(unixSeconds, locale = TRANSIT_CLOCK_LOCALE) {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";

  return serviceDateTimeFormat(
    {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    locale
  ).format(new Date(seconds * 1000));
}

/**
 * @param {EpochSeconds | null | undefined} unixSeconds
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function minutesUntil(unixSeconds, nowMs = Date.now()) {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return Math.max(0, Math.ceil((seconds * 1000 - nowMs) / 60_000));
}

/**
 * @param {number} valueMs
 * @returns {string} "YYYY-MM-DD" in the service zone, or "" when unknown.
 */
function serviceDayKey(valueMs) {
  try {
    const parts = serviceDateTimeFormat(
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
      "en-CA"
    ).formatToParts(new Date(valueMs));
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    return "";
  }
}

/**
 * @param {string} leftKey
 * @param {string} rightKey
 * @returns {number | null}
 */
function dayDistance(leftKey, rightKey) {
  const left = String(leftKey || "").split("-").map(Number);
  const right = String(rightKey || "").split("-").map(Number);
  if (left.length !== 3 || right.length !== 3 || [...left, ...right].some(Number.isNaN)) {
    return null;
  }

  return Math.round(
    (Date.UTC(right[0], right[1] - 1, right[2]) -
      Date.UTC(left[0], left[1] - 1, left[2])) /
      86_400_000
  );
}

// "4 min", or a day and a clock time ("Tomorrow", "06:30"). The day is kept
// apart so the board can set it smaller than the time, in any language.
/**
 * @param {EpochSeconds | null | undefined} unixSeconds
 * @param {number} [nowMs]
 * @returns {DueParts}
 */
export function formatDueParts(unixSeconds, nowMs = Date.now()) {
  const minutes = minutesUntil(unixSeconds, nowMs);
  if (minutes === null) return { day: "", time: "—" };
  if (minutes <= 1) return { day: "", time: t("Due") };
  if (minutes <= 90) return { day: "", time: t("{minutes} min", { minutes }) };

  const departureMs = Number(unixSeconds) * 1000;
  const days = dayDistance(serviceDayKey(nowMs), serviceDayKey(departureMs));
  const clock = formatClock(unixSeconds);

  if (days === 0) return { day: t("Today"), time: clock };
  if (days === 1) return { day: t("Tomorrow"), time: clock };

  // Finnish writes weekdays in lower case ("ti"); above a time, beside
  // "Tänään" and "Huomenna", it is a label and takes a capital like them.
  const weekday = serviceDateTimeFormat({ weekday: "short" }, intlLocale()).format(
    new Date(departureMs)
  );
  return {
    day: weekday.charAt(0).toLocaleUpperCase(intlLocale()) + weekday.slice(1),
    time: clock,
  };
}

/**
 * @param {EpochSeconds | null | undefined} unixSeconds
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatDue(unixSeconds, nowMs = Date.now()) {
  const { day, time } = formatDueParts(unixSeconds, nowMs);
  return day ? `${day} ${time}` : time;
}

/**
 * @param {number | null | undefined} delaySeconds
 * @returns {string | null}
 */
export function formatDelay(delaySeconds) {
  const seconds = Number(delaySeconds);
  if (!Number.isFinite(seconds)) return null;
  if (Math.abs(seconds) < 30) return t("on time");

  // "+1 min" is transit shorthand; "1 min late" is what it means. Kept on
  // one line: broken as "1 min" at a line's end, it read as "due in 1 min".
  const minutes = Math.max(1, Math.round(Math.abs(seconds) / 60));
  const phrase =
    seconds > 0
      ? t("{minutes} min late", { minutes })
      : t("{minutes} min early", { minutes });
  return phrase.replaceAll(" ", "\u00a0");
}

/**
 * @param {EpochSeconds | null | undefined} recordedAt
 * @param {EpochSeconds | null | undefined} serverTime
 * @returns {number | null}
 */
export function dataAgeSeconds(recordedAt, serverTime) {
  const recorded = Number(recordedAt);
  const server = Number(serverTime);

  if (
    !Number.isFinite(recorded) ||
    recorded <= 0 ||
    !Number.isFinite(server) ||
    server <= 0
  ) {
    return null;
  }

  return Math.max(0, server - recorded);
}

/**
 * @param {boolean} monitored
 * @param {number | null | undefined} delaySeconds
 * @param {EpochSeconds | null | undefined} recordedAt
 * @param {EpochSeconds | null | undefined} serverTime
 * @param {{ offline?: boolean }} [options]
 * @returns {string}
 */
export function formatServiceStatus(
  monitored,
  delaySeconds,
  recordedAt,
  serverTime,
  { offline = false } = {}
) {
  if (!monitored) return t("Scheduled");

  const delay = formatDelay(delaySeconds);
  const ageSeconds = dataAgeSeconds(recordedAt, serverTime);

  // Offline, a saved row is the last word from the bus, not a live one.
  let freshness = offline ? t("Last live estimate") : t("Live");
  if (offline) {
    // Its age is said once, above the board.
  } else if (ageSeconds !== null && ageSeconds > 120) {
    freshness = t("Live data · {minutes} min old", {
      minutes: Math.max(2, Math.round(ageSeconds / 60)),
    });
  } else if (ageSeconds !== null && ageSeconds > 60) {
    freshness = t("Live data · 1 min old");
  }

  return delay ? `${freshness} · ${delay}` : freshness;
}


/**
 * @param {EpochSeconds | null | undefined} serverTime
 * @param {number | null | undefined} receivedAtMs
 * @param {number} [nowMs]
 * @returns {EpochSeconds | null}
 */
export function advanceServerTime(
  serverTime,
  receivedAtMs,
  nowMs = Date.now()
) {
  const server = Number(serverTime);
  const received = Number(receivedAtMs);
  const now = Number(nowMs);

  if (!Number.isFinite(server) || server <= 0) return null;
  if (
    !Number.isFinite(received) ||
    received <= 0 ||
    !Number.isFinite(now) ||
    now < received
  ) {
    return server;
  }

  return server + (now - received) / 1000;
}

/**
 * @param {number | null | undefined} receivedAtMs
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function elapsedSince(receivedAtMs, nowMs = Date.now()) {
  const received = Number(receivedAtMs);
  const now = Number(nowMs);

  if (
    !Number.isFinite(received) ||
    received <= 0 ||
    !Number.isFinite(now) ||
    now < received
  ) {
    return null;
  }

  return Math.max(0, (now - received) / 1000);
}

/**
 * @param {unknown} seconds
 * @returns {string}
 */
export function formatElapsedAge(seconds) {

  if (seconds === null || seconds === undefined || seconds === "") return "";

  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 60) return t("just now");
  if (value < 120) return t("1 min ago");
  return t("{minutes} min ago", { minutes: Math.round(value / 60) });
}
