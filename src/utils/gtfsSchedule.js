import { SERVICE_TIME_ZONE } from "./time";

const DEFAULT_LOOKAHEAD_SECONDS = 36 * 60 * 60;
const DEFAULT_GRACE_SECONDS = 30;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseGtfsClock(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  return { hour, minute, second };
}

function serviceDateParts(epochSec) {
  const epoch = finiteNumber(epochSec);
  if (epoch === null || epoch <= 0) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SERVICE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(epoch * 1000));
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
      year: Number(byType.year),
      month: Number(byType.month),
      day: Number(byType.day),
    };
  } catch {
    return null;
  }
}

function dateKeyFromParts({ year, month, day }) {
  return `${String(year).padStart(4, "0")}${String(month).padStart(
    2,
    "0"
  )}${String(day).padStart(2, "0")}`;
}

export function serviceDateKey(epochSec, offsetDays = 0) {
  const parts = serviceDateParts(epochSec);
  if (!parts) return "";

  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + Number(offsetDays || 0))
  );

  return dateKeyFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function zoneOffsetMs(epochMs) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const asUtc = Date.UTC(
    Number(byType.year),
    Number(byType.month) - 1,
    Number(byType.day),
    Number(byType.hour) % 24,
    Number(byType.minute),
    Number(byType.second)
  );

  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

export function gtfsServiceEpoch(serviceDate, gtfsTime) {
  const dateMatch = String(serviceDate || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  const clock = parseGtfsClock(gtfsTime);
  if (!dateMatch || !clock) return null;

  const [, yearText, monthText, dayText] = dateMatch;

  // GTFS Time is elapsed time from "noon minus 12h" of the service day,
  // not a naive local wall-clock. On ordinary days that is local midnight;
  // on DST transition days it deliberately differs by an hour so stop times
  // remain monotonic through a skipped or repeated wall-clock hour.
  //
  // Noon itself is never ambiguous in Europe/Helsinki. Resolve that local
  // wall-clock instant with the same two-pass timezone-offset technique, then
  // subtract twelve real hours and add the full GTFS elapsed time. Hours over
  // 24 therefore stay attached to their originating service day as required.
  const localNoonAsUtc = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    12,
    0,
    0
  );
  const noonFirst = localNoonAsUtc - zoneOffsetMs(localNoonAsUtc);
  const localNoonEpochMs = localNoonAsUtc - zoneOffsetMs(noonFirst);
  const serviceDayStartMs = localNoonEpochMs - 12 * 60 * 60 * 1000;
  const elapsedMs =
    ((clock.hour * 60 + clock.minute) * 60 + clock.second) * 1000;

  return Math.round((serviceDayStartMs + elapsedMs) / 1000);
}

const WEEKDAY_FIELDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function baseCalendarRunsOnDate(calendar, serviceId, dateKey) {
  const service = calendar?.[String(serviceId)];
  const key = String(dateKey || "");

  if (!service || !/^\d{8}$/.test(key)) return false;

  const startDate = String(service.startDate || "");
  const endDate = String(service.endDate || "");

  if (/^\d{8}$/.test(startDate) && key < startDate) return false;
  if (/^\d{8}$/.test(endDate) && key > endDate) return false;

  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(4, 6));
  const day = Number(key.slice(6, 8));
  const weekday = WEEKDAY_FIELDS[
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];

  return Number(service[weekday]) === 1;
}

export function serviceRunsOnDate(
  calendar,
  calendarDates,
  serviceId,
  dateKey
) {
  const entries = calendarDates?.[String(serviceId)];
  const matches = Array.isArray(entries)
    ? entries.filter(
        (entry) => String(entry?.date || "") === String(dateKey || "")
      )
    : [];

  // GTFS exception type 2 removes service even when the weekly calendar says
  // it runs. Föli has also historically exposed type 0 as an active override,
  // so accept both 0 and standard type 1 as explicit additions.
  if (matches.some((entry) => Number(entry?.exceptionType) === 2)) {
    return false;
  }

  if (
    matches.some((entry) => {
      const type = Number(entry?.exceptionType);
      return type === 0 || type === 1;
    })
  ) {
    return true;
  }

  return baseCalendarRunsOnDate(calendar, serviceId, dateKey);
}

export function scheduledClockCandidates(
  rows,
  referenceTimeSec,
  {
    lookaheadSeconds = DEFAULT_LOOKAHEAD_SECONDS,
    graceSeconds = DEFAULT_GRACE_SECONDS,
    maxRows = 64,
  } = {}
) {
  const reference = finiteNumber(referenceTimeSec);
  if (reference === null || reference <= 0) return [];

  const lookahead = Math.max(0, Number(lookaheadSeconds) || 0);
  const daysAhead = Math.max(1, Math.ceil(lookahead / (24 * 60 * 60)) + 1);
  const serviceDates = Array.from(
    { length: daysAhead + 2 },
    (_, index) => index - 1
  )
    .map((offset) => serviceDateKey(reference, offset))
    .filter(Boolean);
  const earliest = reference - Math.max(0, Number(graceSeconds) || 0);
  const latest = reference + lookahead;

  const candidates = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const tripId = String(row?.tripId || "").trim();
    const departureTime = row?.departureTime || row?.arrivalTime || "";
    if (!tripId || !parseGtfsClock(departureTime)) continue;
    if (Number(row?.pickupType) === 1) continue;

    for (const dateKey of serviceDates) {
      const aimedDepartureTime = gtfsServiceEpoch(dateKey, departureTime);
      if (
        aimedDepartureTime === null ||
        aimedDepartureTime < earliest ||
        aimedDepartureTime > latest
      ) {
        continue;
      }

      const aimedArrivalTime = gtfsServiceEpoch(
        dateKey,
        row?.arrivalTime || departureTime
      );

      candidates.push({
        row,
        tripId,
        serviceDate: dateKey,
        aimedDepartureTime,
        aimedArrivalTime:
          aimedArrivalTime === null ? aimedDepartureTime : aimedArrivalTime,
      });
    }
  }

  return candidates
    .sort((a, b) => a.aimedDepartureTime - b.aimedDepartureTime)
    .slice(0, Math.max(1, Number(maxRows) || 64));
}

export function mergeRealtimeAndScheduled(
  realtimeRows,
  scheduledRows,
  { timeToleranceSeconds = 120 } = {}
) {
  const realtime = Array.isArray(realtimeRows) ? realtimeRows : [];
  const scheduled = Array.isArray(scheduledRows) ? scheduledRows : [];
  const tolerance = Math.max(0, Number(timeToleranceSeconds) || 0);

  // A realtime row represents one physical departure. When SIRI omits the
  // trip reference, line+time is only a fuzzy fallback identity: it must not
  // suppress every static departure inside the tolerance window. Match rows
  // one-to-one, with exact trip identity taking precedence over proximity.
  const matchedRealtime = new Set();
  const matchedScheduled = new Set();

  scheduled.forEach((scheduledRow, scheduledIndex) => {
    const tripref = String(scheduledRow?.tripref || "").trim();
    if (!tripref) return;

    const realtimeIndex = realtime.findIndex(
      (liveRow, index) =>
        !matchedRealtime.has(index) &&
        String(liveRow?.tripref || "").trim() === tripref
    );

    if (realtimeIndex >= 0) {
      matchedRealtime.add(realtimeIndex);
      matchedScheduled.add(scheduledIndex);
    }
  });

  const fuzzyCandidates = [];

  scheduled.forEach((scheduledRow, scheduledIndex) => {
    if (matchedScheduled.has(scheduledIndex)) return;

    const scheduledLine = String(scheduledRow?.lineref || "").trim();
    const scheduledTime = finiteNumber(scheduledRow?.aimeddeparturetime);
    const scheduledTripref = String(scheduledRow?.tripref || "").trim();
    if (!scheduledLine || scheduledTime === null) return;

    realtime.forEach((liveRow, realtimeIndex) => {
      if (matchedRealtime.has(realtimeIndex)) return;

      const liveLine = String(liveRow?.lineref || "").trim();
      if (!liveLine || liveLine !== scheduledLine) return;

      const liveTripref = String(liveRow?.tripref || "").trim();

      // Exact trip identity was already resolved above. If both sides still
      // have known identities, they are different departures and proximity
      // must never merge them. Fuzzy matching exists only for the side where
      // the provider omitted trip identity.
      if (scheduledTripref && liveTripref) return;

      const liveAimed =
        finiteNumber(liveRow?.aimeddeparturetime) ??
        finiteNumber(liveRow?.aimedarrivaltime);
      if (liveAimed === null) return;

      const delta = Math.abs(scheduledTime - liveAimed);
      if (delta <= tolerance) {
        fuzzyCandidates.push({ scheduledIndex, realtimeIndex, delta });
      }
    });
  });

  fuzzyCandidates
    .sort(
      (left, right) =>
        left.delta - right.delta ||
        left.scheduledIndex - right.scheduledIndex ||
        left.realtimeIndex - right.realtimeIndex
    )
    .forEach(({ scheduledIndex, realtimeIndex }) => {
      if (
        matchedScheduled.has(scheduledIndex) ||
        matchedRealtime.has(realtimeIndex)
      ) {
        return;
      }

      matchedScheduled.add(scheduledIndex);
      matchedRealtime.add(realtimeIndex);
    });

  return [
    ...realtime,
    ...scheduled.filter((_, index) => !matchedScheduled.has(index)),
  ];
}
