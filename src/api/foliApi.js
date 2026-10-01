import axios from "axios";
import createBoundedCache from "../utils/boundedCache";
import { timestampIsFresh } from "../utils/cacheTime";
import {
  mergeRealtimeAndScheduled,
  scheduledClockCandidates,
  scheduledClockWindow,
  serviceRunsOnDate,
} from "../utils/gtfsSchedule";

/**
 * @import {
 *   Arrival,
 *   Calendar,
 *   CalendarDates,
 *   ClockCandidate,
 *   EpochSeconds,
 *   LatLon,
 *   Route,
 *   RouteTrip,
 *   ScheduledArrival,
 *   ScheduledDepartures,
 *   ServiceBoundary,
 *   ShapePoint,
 *   StopMonitorOptions,
 *   StopMonitorResult,
 *   StopSummary,
 *   StopTimetableRow,
 *   TripDetails,
 *   TripHeader,
 *   TripStopTime,
 * } from "../types/foli"
 * @import { BoundedCache } from "../utils/boundedCache"
 */

/**
 * Föli's JSON before normalization. Nothing about it is trusted, so a field
 * is read as `unknown` and coerced by the helpers below.
 * @typedef {Record<string, any>} RawRecord
 */

const API_BASE_URL =
  import.meta.env.VITE_FOLI_API_URL || "https://data.foli.fi/siri/sm";
const ALERTS_URL =
  import.meta.env.VITE_FOLI_ALERTS_URL || "https://data.foli.fi/alerts";
const GTFS_BASE_URL =
  import.meta.env.VITE_FOLI_GTFS_URL || "https://data.foli.fi/gtfs/";
const STOPS_URL_OVERRIDE = import.meta.env.VITE_FOLI_STOPS_URL || "";
const ROUTES_URL_OVERRIDE = import.meta.env.VITE_FOLI_ROUTES_URL || "";
const SERVICE_BOUNDARY_URL =
  import.meta.env.VITE_FOLI_BOUNDARY_URL ||
  "https://data.foli.fi/geojson/bounds/compact";

const client = axios.create({
  timeout: 8000,
  headers: { Accept: "application/json" },
});

// Föli publishes new GTFS dataset versions, so a long-lived session must not
// keep requesting a retired dataset path for the rest of its life.
const GTFS_DATASET_TTL_MS = 6 * 60 * 60 * 1000;

// A sanity bound on one stop's live answer, far above any real board.
const MAX_BOARD_ROWS = 100;
// How many timetable departures of each followed line to show.
const LINE_TIMETABLE_ROWS = 3;
// How many departures an empty-board timetable search looks for.
const STOP_SCHEDULE_ROWS = 24;
// How many different trips one empty-board search may look up, each one a
// trip metadata request the first time it is seen. The search walks the
// stop's next 36 hours of timetable rows until it has found its buses, and a
// quiet stop at night can list hundreds of weekday-only trips before its
// first Sunday one: a cap of 256 rows stopped short of that bus and the
// board said Föli was down. Rows repeat the same trip on each service day,
// so this counts trips, not rows. Far above any real stop's trips in 36
// hours; reaching it leaves the search unfinished, never empty.
const STOP_SCHEDULE_MAX_TRIPS = 1024;

// Dataset-scoped responses. Bounded so a display left running for days cannot
// grow its memory without limit.
// Room for the largest empty-board search, STOP_SCHEDULE_MAX_TRIPS, plus a
// half again for the rides and other stops read beside it. Smaller than the
// search, its own later lookups evicted the first ones, so every 30-second
// refresh of a quiet board asked for all of them again.
/** @type {BoundedCache<string, TripDetails>} */
const tripDetailsCache = createBoundedCache(
  Math.ceil(STOP_SCHEDULE_MAX_TRIPS * 1.5)
);
// One expanded Journey Assistant search is deliberately capped at 96 unique
// trips. Keep one full search plus headroom for the open board/Ride Mode so
// static stop-time data does not churn out of the LRU every 30-second refresh.
/** @type {BoundedCache<string, TripStopTime[]>} */
const tripStopTimesCache = createBoundedCache(128);
/** @type {BoundedCache<string, string[]>} */
const stopBoardingTripsCache = createBoundedCache(20);
/** @type {BoundedCache<string, RouteTrip[]>} */
const routeTripsCache = createBoundedCache(60);
/** @type {BoundedCache<string, ShapePoint[]>} */
const tripShapeCache = createBoundedCache(40);
/** @type {BoundedCache<string, StopTimetableRow[]>} */
const stopTimetableCache = createBoundedCache(30);
/** @type {BoundedCache<string, Calendar>} */
const calendarCache = createBoundedCache(1);
/** @type {BoundedCache<string, CalendarDates>} */
const calendarDatesCache = createBoundedCache(1);
/** @type {BoundedCache<string, Route[]>} */
const routeCatalogCache = createBoundedCache(1);

/** @type {Promise<string> | null} */
let gtfsDatasetBasePromise = null;
let gtfsDatasetBaseUrl = "";
let gtfsDatasetResolvedAtMs = 0;

function clearGtfsResourceCaches() {
  tripDetailsCache.clear();
  tripStopTimesCache.clear();
  stopBoardingTripsCache.clear();
  routeTripsCache.clear();
  tripShapeCache.clear();
  stopTimetableCache.clear();
  calendarCache.clear();
  calendarDatesCache.clear();
  routeCatalogCache.clear();
}

/**
 * Drops an expired dataset pin, and everything cached against it, without
 * waiting on the network. Cached reads stay synchronous, and no response from
 * a retired dataset can outlive the pin.
 */
function invalidateExpiredGtfsDataset() {
  if (
    gtfsDatasetResolvedAtMs <= 0 ||
    timestampIsFresh(gtfsDatasetResolvedAtMs, GTFS_DATASET_TTL_MS)
  ) {
    return;
  }

  gtfsDatasetBasePromise = null;
  gtfsDatasetResolvedAtMs = 0;
  clearGtfsResourceCaches();
}

/** @returns {Promise<string>} */
function gtfsDatasetBase() {
  invalidateExpiredGtfsDataset();

  if (!gtfsDatasetBasePromise) {
    gtfsDatasetBasePromise = client
      .get(GTFS_BASE_URL)
      .then(({ data }) => {
        const host = optionalString(data?.host);
        const path = optionalString(data?.gtfspath);
        const latest = optionalString(data?.latest);

        if (!host || !path || !latest || !/^[\w.-]+$/.test(latest)) {
          throw new Error("Invalid Föli GTFS dataset metadata.");
        }

        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const base = `https://${host}${normalizedPath}/${encodeURIComponent(
          latest
        )}`;

        if (gtfsDatasetBaseUrl && gtfsDatasetBaseUrl !== base) {
          // Everything cached from the previous dataset is now unrelated.
          clearGtfsResourceCaches();
        }

        gtfsDatasetBaseUrl = base;
        gtfsDatasetResolvedAtMs = Date.now();
        return base;
      })
      .catch((error) => {
        gtfsDatasetBasePromise = null;
        gtfsDatasetResolvedAtMs = 0;
        throw error;
      });
  }

  return gtfsDatasetBasePromise;
}

/**
 * @param {string} resource
 * @param {string} [overrideUrl]
 * @returns {Promise<string>}
 */
async function gtfsResourceUrl(resource, overrideUrl) {
  if (overrideUrl) return overrideUrl;
  return `${await gtfsDatasetBase()}/${resource}`;
}

export function resetGtfsDatasetForTests() {
  gtfsDatasetBasePromise = null;
  gtfsDatasetBaseUrl = "";
  gtfsDatasetResolvedAtMs = 0;
  clearGtfsResourceCaches();
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function coordinateNumber(value, min, max) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function gtfsColor(value) {
  const normalized = optionalString(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized.toLowerCase()}`
    : null;
}

/**
 * @param {unknown} value
 * @returns {Arrival | null}
 */
function normalizeArrival(value) {
  /** @type {RawRecord} */
  const arrival = /** @type {RawRecord} */ (value);
  if (!arrival || Array.isArray(arrival) || typeof arrival !== "object") {
    return null;
  }

  return {
    lineref:
      typeof arrival.lineref === "string" || typeof arrival.lineref === "number"
        ? String(arrival.lineref)
        : "",
    destinationdisplay:
      typeof arrival.destinationdisplay === "string"
        ? arrival.destinationdisplay
        : "",
    destinationdisplay_en: optionalString(arrival.destinationdisplay_en),
    destinationdisplay_sv: optionalString(arrival.destinationdisplay_sv),
    monitored: arrival.monitored === true,
    vehicleatstop: arrival.vehicleatstop === true,
    vehicleref:
      arrival.vehicleref === null || arrival.vehicleref === undefined
        ? ""
        : String(arrival.vehicleref),
    incongestion: arrival.incongestion === true,
    directionname: optionalString(arrival.directionname),
    destinationref:
      arrival.destinationref === null || arrival.destinationref === undefined
        ? ""
        : String(arrival.destinationref),
    originref:
      arrival.originref === null || arrival.originref === undefined
        ? ""
        : String(arrival.originref),
    visitnumber: optionalNumber(arrival.visitnumber),
    blockref:
      arrival.blockref === null || arrival.blockref === undefined
        ? ""
        : String(arrival.blockref),
    dataframeref: optionalString(arrival.dataframeref),
    datedvehiclejourneyref: optionalString(arrival.datedvehiclejourneyref),
    tripref:
      arrival.__tripref === null || arrival.__tripref === undefined
        ? ""
        : String(arrival.__tripref),
    routeref:
      arrival.__routeref === null || arrival.__routeref === undefined
        ? ""
        : String(arrival.__routeref),
    delay: optionalNumber(arrival.delay),
    recordedattime: positiveNumber(arrival.recordedattime),
    latitude: coordinateNumber(arrival.latitude, -90, 90),
    longitude: coordinateNumber(arrival.longitude, -180, 180),
    originaimeddeparturetime: positiveNumber(arrival.originaimeddeparturetime),
    destinationaimedarrivaltime: positiveNumber(
      arrival.destinationaimedarrivaltime
    ),
    expecteddeparturetime: positiveNumber(arrival.expecteddeparturetime),
    expectedarrivaltime: positiveNumber(arrival.expectedarrivaltime),
    aimeddeparturetime: positiveNumber(arrival.aimeddeparturetime),
    aimedarrivaltime: positiveNumber(arrival.aimedarrivaltime),
  };
}

// `scheduleFallback: false` returns the realtime feed alone. The timetable rows
// that fill a quiet board carry real trip ids, so anything reading this answer
// as evidence of where a vehicle is (Ride Mode) must not be handed them.
/**
 * @param {string} stopId
 * @param {AbortSignal} [signal]
 * @param {StopMonitorOptions} [options]
 * @returns {Promise<StopMonitorResult>}
 */
export async function fetchStopMonitor(
  stopId,
  signal,
  { scheduleFallback = true } = {}
) {
  const response = await client.get(
    `${API_BASE_URL}/${encodeURIComponent(stopId)}`,
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli response.");
  }

  const status = optionalString(payload.status);
  const serverTime =
    positiveNumber(payload.servertime) ?? Math.floor(Date.now() / 1000);

  if (
    status === "OK" &&
    !Array.isArray(payload.result)
  ) {
    throw new Error("Invalid Föli departures.");
  }

  if (!["OK", "NO_SIRI_DATA", "PENDING"].includes(status)) {
    throw new Error("Föli real-time data is unavailable.");
  }

  /** @type {Arrival[]} */
  const realtimeRows =
    status === "OK"
      ? payload.result.map(normalizeArrival).filter(isPresent)
      : [];
  const hasFutureRealtime = realtimeRows.some((arrival) => {
    const departure =
      positiveNumber(arrival.expecteddeparturetime) ??
      positiveNumber(arrival.expectedarrivaltime) ??
      positiveNumber(arrival.aimeddeparturetime) ??
      positiveNumber(arrival.aimedarrivaltime);
    return departure !== null && departure >= serverTime - 30;
  });

  /** @type {Arrival[]} */
  let scheduledRows = [];
  let scheduleAvailable = false;
  // The timetable was needed and could not be read. Only then can an empty
  // board not be taken at its word.
  let scheduleFailed = false;
  // Read only up to a departure that could not be checked.
  let scheduleIncomplete = false;

  // SIRI is a near-term realtime feed, not the published timetable. If it
  // has no future row, ask GTFS for the next actual service instead of
  // rendering a false empty board. This also covers stale SIRI rows.
  if (scheduleFallback && !hasFutureRealtime) {
    try {
      const schedule = await fetchScheduledStopDepartures(
        stopId,
        serverTime,
        signal
      );
      scheduledRows = schedule.departures;
      scheduleIncomplete = !schedule.complete;
      // Nothing confirmed before the gap is no answer at all.
      scheduleAvailable = scheduledRows.length > 0 || schedule.complete;
      // But the timetable was read, and so was SIRI: NO_SIRI_DATA is its
      // normal answer at night. One trip that could not be checked left the
      // board saying Föli was down, and backing off its refreshes, at a quiet
      // stop whose timetable says "maybe later" instead.
      scheduleFailed = !scheduleAvailable;
    } catch (error) {
      const name = /** @type {{ name?: unknown } | null | undefined} */ (error)
        ?.name;
      if (name === "CanceledError" || name === "AbortError") {
        throw error;
      }

      // A healthy realtime response remains useful even if static GTFS is
      // temporarily unavailable. If realtime is down too, surface failure.
      if (status !== "OK") {
        throw new Error("Föli departure data is unavailable.");
      }
      scheduleFailed = true;
    }
  }

  const arrivals = mergeRealtimeAndScheduled(realtimeRows, scheduledRows)
    .sort((a, b) => {
      const left =
        positiveNumber(a.expecteddeparturetime) ??
        positiveNumber(a.expectedarrivaltime) ??
        positiveNumber(a.aimeddeparturetime) ??
        positiveNumber(a.aimedarrivaltime) ??
        Number.POSITIVE_INFINITY;
      const right =
        positiveNumber(b.expecteddeparturetime) ??
        positiveNumber(b.expectedarrivaltime) ??
        positiveNumber(b.aimeddeparturetime) ??
        positiveNumber(b.aimedarrivaltime) ??
        Number.POSITIVE_INFINITY;
      return left - right;
    })
    // The board shows ten, but a followed line's bus can be the 27th row at
    // a busy stop; cut at 24 here, the filter said the line had none.
    .slice(0, MAX_BOARD_ROWS);

  return {
    // Often missing from the live feed. The screen names the stop by its
    // number instead (utils/stopNames.js).
    stopName:
      typeof payload.stopname === "string" ? payload.stopname.trim() : "",
    arrivals,
    serverTime,
    realtimeAvailable: status === "OK",
    scheduleAvailable,
    scheduleFailed,
    scheduleIncomplete,
  };
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<StopSummary[]>}
 */
export async function fetchStopCatalog(signal) {
  const response = await client.get(API_BASE_URL, { signal });
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli stop list.");
  }

  const stops = Object.entries(/** @type {Record<string, RawRecord>} */ (payload))
    .map(([id, stop]) => ({
      id: String(id),
      name:
        typeof stop?.stop_name === "string" ? stop.stop_name.trim() : "",
    }))
    .filter((stop) => /^\d+$/.test(stop.id))
    .sort((a, b) => Number(a.id) - Number(b.id));

  // Turku has hundreds of stops. An answer with none is a failed answer,
  // and saved as the catalogue it switched name search off for a day.
  if (stops.length === 0) {
    throw new Error("Föli stop list is empty.");
  }

  return stops;
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<Map<string, LatLon>>}
 */
export async function fetchStopCoordinates(signal) {
  const response = await client.get(
    await gtfsResourceUrl("stops", STOPS_URL_OVERRIDE),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS stop list.");
  }

  /** @type {Map<string, LatLon>} */
  const coordinates = new Map();

  Object.entries(/** @type {Record<string, RawRecord>} */ (payload)).forEach(([id, stop]) => {
    const lat = coordinateNumber(stop?.stop_lat, -90, 90);
    const lon = coordinateNumber(stop?.stop_lon, -180, 180);

    if (lat !== null && lon !== null) {
      coordinates.set(String(id), { lat, lon });
    }
  });

  if (coordinates.size === 0) {
    throw new Error("Föli GTFS stop coordinates are unavailable.");
  }

  return coordinates;
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<Route[]>}
 */
export async function fetchRouteCatalog(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = ROUTES_URL_OVERRIDE || "routes";
  const cached = routeCatalogCache.get(cacheKey);
  if (cached) return cached;

  const response = await client.get(
    await gtfsResourceUrl("routes", ROUTES_URL_OVERRIDE),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS route list.");
  }

  /** @type {Route[]} */
  const normalized = payload
    .map((/** @type {RawRecord} */ route) => {
      const id =
        route?.route_id === null || route?.route_id === undefined
          ? ""
          : String(route.route_id);
      const shortName = optionalString(route?.route_short_name);

      return {
        id,
        shortName,
        longName: optionalString(route?.route_long_name),
        type: optionalNumber(route?.route_type),
        color: gtfsColor(route?.route_color),
        textColor: gtfsColor(route?.route_text_color),
      };
    })
    .filter((route) => route.id && route.shortName);

  // An empty list kept as the routes made every followed line "no
  // departures in the next 36 hours".
  if (normalized.length === 0) {
    throw new Error("Föli GTFS route list is empty.");
  }

  routeCatalogCache.set(cacheKey, normalized);
  return normalized;
}

/**
 * Föli's alert document, passed on as it came: utils/alerts.js reads it
 * defensively, field by field.
 * @param {AbortSignal} [signal]
 * @returns {Promise<RawRecord>}
 */
export async function fetchAlerts(signal) {
  const response = await client.get(ALERTS_URL, { signal });
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli alerts response.");
  }

  return payload;
}

/**
 * @template T
 * @param {T | null | undefined} value
 * @returns {value is T}
 */
function isPresent(value) {
  return value !== null && value !== undefined;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requiredId(value, label) {
  const id =
    value === null || value === undefined ? "" : String(value).trim();
  if (!id || id.length > 160) {
    throw new Error(`Invalid Föli ${label}.`);
  }
  return id;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function gtfsTime(value) {
  if (typeof value === "string" && /^\d{1,3}:\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  return "";
}

/**
 * @param {string} stopId
 * @param {AbortSignal} [signal]
 * @returns {Promise<StopTimetableRow[]>}
 */
async function fetchStopTimetable(stopId, signal) {
  const id = requiredId(stopId, "stop ID");
  invalidateExpiredGtfsDataset();
  const cached = stopTimetableCache.get(id);
  if (cached) return cached;

  const response = await client.get(
    await gtfsResourceUrl(`stop_times/stop/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS stop timetable.");
  }

  const normalized = payload
    .map((/** @type {RawRecord} */ item) => ({
      tripId:
        item?.trip_id === null || item?.trip_id === undefined
          ? ""
          : String(item.trip_id),
      arrivalTime: gtfsTime(item?.arrival_time),
      departureTime: gtfsTime(item?.departure_time),
      stopSequence: optionalNumber(item?.stop_sequence),
      pickupType: optionalNumber(item?.pickup_type),
      dropOffType: optionalNumber(item?.drop_off_type),
      shapeDistTraveled: optionalNumber(item?.shape_dist_traveled),
    }))
    .filter((item) => item.tripId && item.pickupType !== 1);

  stopTimetableCache.set(id, normalized);
  return normalized;
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<Calendar>}
 */
async function fetchCalendar(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = "calendar";
  const cached = calendarCache.get(cacheKey);
  if (cached) return cached;

  const response = await client.get(
    await gtfsResourceUrl("calendar"),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS calendar.");
  }

  /** @type {Calendar} */
  const normalized = Object.fromEntries(
    Object.entries(/** @type {Record<string, RawRecord>} */ (payload)).map(([serviceId, entry]) => [
      String(serviceId),
      {
        monday: optionalNumber(entry?.monday),
        tuesday: optionalNumber(entry?.tuesday),
        wednesday: optionalNumber(entry?.wednesday),
        thursday: optionalNumber(entry?.thursday),
        friday: optionalNumber(entry?.friday),
        saturday: optionalNumber(entry?.saturday),
        sunday: optionalNumber(entry?.sunday),
        startDate:
          entry?.start_date === null || entry?.start_date === undefined
            ? ""
            : String(entry.start_date),
        endDate:
          entry?.end_date === null || entry?.end_date === undefined
            ? ""
            : String(entry.end_date),
      },
    ])
  );

  calendarCache.set(cacheKey, normalized);
  return normalized;
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<CalendarDates>}
 */
async function fetchCalendarDates(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = "calendar_dates";
  const cached = calendarDatesCache.get(cacheKey);
  if (cached) return cached;

  const response = await client.get(
    await gtfsResourceUrl("calendar_dates"),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS calendar dates.");
  }

  /** @type {CalendarDates} */
  const normalized = Object.fromEntries(
    Object.entries(/** @type {Record<string, unknown>} */ (payload)).map(([serviceId, entries]) => [
      String(serviceId),
      (Array.isArray(entries) ? entries : [])
        .map((/** @type {RawRecord} */ entry) => ({
          date:
            entry?.date === null || entry?.date === undefined
              ? ""
              : String(entry.date),
          exceptionType: optionalNumber(entry?.exception_type),
        }))
        .filter((entry) => /^\d{8}$/.test(entry.date)),
    ])
  );

  calendarDatesCache.set(cacheKey, normalized);
  return normalized;
}

// allSettled turns a cancelled lookup into one more rejected result, and a
// trip that could not be looked up cuts the timetable short. A cancelled
// request must end the whole answer instead: reported as a failed check, it
// said "Live update failed" on the stop the passenger had just switched to.
/** @param {AbortSignal} [signal] */
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  throw error;
}

/**
 * @param {string[]} tripIds
 * @param {AbortSignal} [signal]
 * @returns {Promise<Map<string, TripDetails>>}
 */
async function fetchTripDetailsInBatches(tripIds, signal) {
  const ids = [...new Set(tripIds.filter(Boolean))];
  /** @type {Map<string, TripDetails>} */
  const byId = new Map();

  for (let index = 0; index < ids.length; index += 8) {
    const batch = ids.slice(index, index + 8);
    const results = await Promise.allSettled(
      batch.map((tripId) => fetchTripDetails(tripId, signal))
    );
    throwIfAborted(signal);

    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") {
        byId.set(batch[resultIndex], result.value);
      }
    });
  }

  return byId;
}

// A timetable departure in the shape of a live row, marked as not tracked.
/**
 * @param {ClockCandidate<StopTimetableRow>} candidate
 * @param {TripHeader} details
 * @param {Route | undefined} route
 * @returns {ScheduledArrival}
 */
function scheduledArrival(candidate, details, route) {
  return {
    lineref: route?.shortName || details.routeId || "",
    destinationdisplay: details.headsign || "",
    destinationdisplay_en: "",
    destinationdisplay_sv: "",
    monitored: false,
    vehicleatstop: false,
    vehicleref: "",
    incongestion: false,
    directionname: "",
    destinationref: "",
    originref: "",
    visitnumber: candidate.row.stopSequence,
    blockref: details.blockId || "",
    dataframeref: "",
    datedvehiclejourneyref: "",
    tripref: candidate.tripId,
    routeref: details.routeId || "",
    delay: null,
    recordedattime: null,
    latitude: null,
    longitude: null,
    originaimeddeparturetime: null,
    destinationaimedarrivaltime: null,
    expecteddeparturetime: null,
    expectedarrivaltime: null,
    aimeddeparturetime: candidate.aimedDepartureTime,
    aimedarrivaltime: candidate.aimedArrivalTime,
  };
}

/**
 * @param {string} stopId
 * @param {EpochSeconds | null | undefined} referenceTimeSec
 * @param {AbortSignal} [signal]
 * @returns {Promise<ScheduledDepartures>}
 */
export async function fetchScheduledStopDepartures(
  stopId,
  referenceTimeSec,
  signal
) {
  const reference =
    positiveNumber(referenceTimeSec) ?? Math.floor(Date.now() / 1000);

  const [rows, calendar, calendarDates, routes] = await Promise.all([
    fetchStopTimetable(stopId, signal),
    fetchCalendar(signal),
    fetchCalendarDates(signal),
    fetchRouteCatalog(signal),
  ]);

  const { candidates: clockCandidates } = scheduledClockWindow(
    rows,
    reference,
    {
      // SIRI can legitimately be empty even though the next published
      // service is later tonight or tomorrow morning. Search far enough to
      // bridge that gap without turning this into a week-long timetable
      // browser.
      lookaheadSeconds: 36 * 60 * 60,
      graceSeconds: 30,
      // The whole window: the search below stops once it has its buses, and
      // STOP_SCHEDULE_MAX_TRIPS bounds what it may ask for.
      maxRows: Number.POSITIVE_INFINITY,
    }
  );

  if (clockCandidates.length === 0) return { departures: [], complete: true };

  const routesById = new Map(routes.map((route) => [route.id, route]));
  /** @type {ScheduledArrival[]} */
  const scheduled = [];
  // A trip whose metadata could not be fetched may or may not run. Skipping
  // it like a trip that does not run dropped a departure without a word, so
  // the list stops at the first one that could not be checked instead.
  /** @type {EpochSeconds | null} */
  let uncheckedFrom = null;
  // Every trip this search has asked about, answered or not. The same trip
  // turns up once for each service day in the window, and is asked for once.
  /** @type {Map<string, TripDetails | null>} */
  const detailsByTrip = new Map();

  // Resolve trip metadata chronologically and stop as soon as we have enough
  // active departures. This keeps the fallback cheap at busy stops while
  // still being able to skip inactive service patterns and reach tomorrow.
  let index = 0;
  while (
    index < clockCandidates.length &&
    scheduled.length < STOP_SCHEDULE_ROWS &&
    uncheckedFrom === null
  ) {
    const batch = clockCandidates.slice(index, index + 12);
    const unseen = [
      ...new Set(
        batch
          .map((candidate) => candidate.tripId)
          .filter((tripId) => !detailsByTrip.has(tripId))
      ),
    ];
    // Out of lookups before the buses were found: whatever comes after this
    // batch was never looked at, so the answer is unfinished, not empty.
    if (detailsByTrip.size + unseen.length > STOP_SCHEDULE_MAX_TRIPS) {
      uncheckedFrom = batch[0].aimedDepartureTime;
      break;
    }
    const fetched = await fetchTripDetailsInBatches(unseen, signal);
    for (const tripId of unseen) {
      detailsByTrip.set(tripId, fetched.get(tripId) ?? null);
    }

    for (const candidate of batch) {
      const details = detailsByTrip.get(candidate.tripId);
      if (!details) {
        uncheckedFrom = candidate.aimedDepartureTime;
        break;
      }

      if (
        !details.serviceId ||
        !serviceRunsOnDate(
          calendar,
          calendarDates,
          details.serviceId,
          candidate.serviceDate
        )
      ) {
        continue;
      }

      scheduled.push(
        scheduledArrival(candidate, details, routesById.get(details.routeId))
      );
    }
    index += batch.length;
  }

  const cutoff = uncheckedFrom;
  return {
    departures: scheduled
      .filter((row) => cutoff === null || row.aimeddeparturetime < cutoff)
      .sort((a, b) => a.aimeddeparturetime - b.aimeddeparturetime)
      .slice(0, STOP_SCHEDULE_ROWS),
    complete: cutoff === null,
  };
}

/**
 * @param {string} tripId
 * @param {AbortSignal} [signal]
 * @returns {Promise<TripDetails>}
 */
export async function fetchTripDetails(tripId, signal) {
  const id = requiredId(tripId, "trip ID");
  invalidateExpiredGtfsDataset();
  const cached = tripDetailsCache.get(id);
  if (cached) return cached;
  const response = await client.get(
    await gtfsResourceUrl(`trips/trip/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("Föli GTFS trip metadata is unavailable.");
  }

  /** @type {RawRecord} */
  const trip = payload[0];

  /** @type {TripDetails} */
  const normalized = {
    tripId: id,
    routeId:
      trip?.route_id === null || trip?.route_id === undefined
        ? ""
        : String(trip.route_id),
    serviceId:
      trip?.service_id === null || trip?.service_id === undefined
        ? ""
        : String(trip.service_id),
    headsign: optionalString(trip?.trip_headsign),
    directionId: optionalNumber(trip?.direction_id),
    blockId:
      trip?.block_id === null || trip?.block_id === undefined
        ? ""
        : String(trip.block_id),
    shapeId:
      trip?.shape_id === null || trip?.shape_id === undefined
        ? ""
        : String(trip.shape_id),
    wheelchairAccessible: optionalNumber(trip?.wheelchair_accessible),
    bikesAllowed: optionalNumber(trip?.bikes_allowed),
  };

  tripDetailsCache.set(id, normalized);
  return normalized;
}

/**
 * @param {string} tripId
 * @param {AbortSignal} [signal]
 * @returns {Promise<TripStopTime[]>}
 */
export async function fetchTripStopTimes(tripId, signal) {
  const id = requiredId(tripId, "trip ID");
  invalidateExpiredGtfsDataset();
  const cached = tripStopTimesCache.get(id);
  if (cached) return cached;
  const response = await client.get(
    await gtfsResourceUrl(`stop_times/trip/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS trip stop sequence.");
  }

  const normalized = payload
    .map((/** @type {RawRecord} */ item) => ({
      stopId:
        item?.stop_id === null || item?.stop_id === undefined
          ? ""
          : String(item.stop_id),
      arrivalTime: gtfsTime(item?.arrival_time),
      departureTime: gtfsTime(item?.departure_time),
      stopSequence: optionalNumber(item?.stop_sequence),
      pickupType: optionalNumber(item?.pickup_type),
      dropOffType: optionalNumber(item?.drop_off_type),
      timepoint: optionalNumber(item?.timepoint),
      shapeDistTraveled: optionalNumber(item?.shape_dist_traveled),
    }))
    .filter(
      /** @returns {item is TripStopTime} */
      (item) => Boolean(item.stopId) && item.stopSequence !== null
    )
    .sort((a, b) => a.stopSequence - b.stopSequence);

  tripStopTimesCache.set(id, normalized);
  return normalized;
}

/**
 * @param {string} shapeId
 * @param {AbortSignal} [signal]
 * @returns {Promise<ShapePoint[]>}
 */
export async function fetchTripShape(shapeId, signal) {
  const id = requiredId(shapeId, "shape ID");
  invalidateExpiredGtfsDataset();
  const cached = tripShapeCache.get(id);
  if (cached) return cached;

  const response = await client.get(
    await gtfsResourceUrl(`shapes/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS trip shape.");
  }

  const normalized = payload
    .map((/** @type {RawRecord} */ point) => ({
      lat: coordinateNumber(point?.lat, -90, 90),
      lon: coordinateNumber(point?.lon, -180, 180),
      traveled: optionalNumber(point?.traveled),
    }))
    .filter(
      /** @returns {point is ShapePoint} */
      (point) => point.lat !== null && point.lon !== null
    );

  if (normalized.length < 2) {
    throw new Error("Föli GTFS trip shape is unavailable.");
  }

  tripShapeCache.set(id, normalized);
  return normalized;
}

/**
 * @param {string} stopId
 * @param {AbortSignal} [signal]
 * @returns {Promise<Set<string>>}
 */
export async function fetchStopBoardingTripIds(stopId, signal) {
  const id = requiredId(stopId, "stop ID");
  invalidateExpiredGtfsDataset();
  const cached = stopBoardingTripsCache.get(id);
  if (cached) return new Set(cached);

  const rows = await fetchStopTimetable(id, signal);
  const tripIds = rows.map((item) => item.tripId).filter(Boolean);

  stopBoardingTripsCache.set(id, tripIds);
  return new Set(tripIds);
}

// One route's trips, with the service each runs on and its sign. One
// request serves both uses: which trips a route alert covers, and when a
// followed line next leaves a stop.
/**
 * @param {string} routeId
 * @param {AbortSignal} [signal]
 * @returns {Promise<RouteTrip[]>}
 */
async function fetchRouteTrips(routeId, signal) {
  const id = requiredId(routeId, "route ID");
  invalidateExpiredGtfsDataset();
  const cached = routeTripsCache.get(id);
  if (cached) return cached;
  const response = await client.get(
    await gtfsResourceUrl(`trips/route/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS route trips.");
  }

  const text = (/** @type {unknown} */ value) =>
    value === null || value === undefined ? "" : String(value);
  const trips = payload
    .map((/** @type {RawRecord} */ trip) => ({
      tripId: text(trip?.trip_id),
      routeId: id,
      serviceId: text(trip?.service_id),
      headsign: optionalString(trip?.trip_headsign),
      blockId: text(trip?.block_id),
    }))
    .filter((trip) => trip.tripId);

  routeTripsCache.set(id, trips);
  return trips;
}

/**
 * @param {string} routeId
 * @param {AbortSignal} [signal]
 * @returns {Promise<Set<string>>}
 */
export async function fetchRouteTripIds(routeId, signal) {
  const trips = await fetchRouteTrips(routeId, signal);
  return new Set(trips.map((trip) => trip.tripId));
}

// The next timetable departures, from one stop, of the lines a passenger
// follows there. The live feed looks only an hour or so ahead, and the
// stop's own timetable fallback stops at its first 24 departures, so an
// hourly line at a busy stop fell outside both and the board said it had
// none. Its route's trips pick its departures out of the stop's timetable.
/**
 * @param {string} stopId
 * @param {readonly (string | number)[]} lineRefs
 * @param {EpochSeconds | null | undefined} referenceTimeSec
 * @param {AbortSignal} [signal]
 * @returns {Promise<ScheduledArrival[]>}
 */
export async function fetchScheduledLineDepartures(
  stopId,
  lineRefs,
  referenceTimeSec,
  signal
) {
  const lines = new Set(
    (Array.isArray(lineRefs) ? lineRefs : []).map((line) => String(line))
  );
  if (lines.size === 0) return [];
  const reference =
    positiveNumber(referenceTimeSec) ?? Math.floor(Date.now() / 1000);

  const [rows, calendar, calendarDates, routes] = await Promise.all([
    fetchStopTimetable(stopId, signal),
    fetchCalendar(signal),
    fetchCalendarDates(signal),
    fetchRouteCatalog(signal),
  ]);

  const lineRoutes = routes.filter((route) => lines.has(String(route.shortName)));
  if (lineRoutes.length === 0) return [];

  const routeTrips = await Promise.all(
    lineRoutes.map((route) => fetchRouteTrips(route.id, signal))
  );
  /** @type {Map<string, { trip: RouteTrip, route: Route }>} */
  const trips = new Map();
  lineRoutes.forEach((route, index) => {
    for (const trip of routeTrips[index]) trips.set(trip.tripId, { trip, route });
  });

  // Each route's trip list already says which service a trip runs on, so
  // checking a row costs no request and every row in the window is read. A
  // cap here let a timetable full of weekday trips hide the line's Sunday
  // buses behind it.
  const candidates = scheduledClockCandidates(
    rows.filter((row) => trips.has(String(row.tripId))),
    reference,
    {
      lookaheadSeconds: 36 * 60 * 60,
      graceSeconds: 30,
      maxRows: Number.POSITIVE_INFINITY,
    }
  );

  /** @type {Map<string, number>} */
  const perLine = new Map();
  /** @type {ScheduledArrival[]} */
  const departures = [];
  for (const candidate of candidates) {
    const match = trips.get(candidate.tripId);
    if (!match) continue;
    const { trip, route } = match;
    if (
      !trip.serviceId ||
      !serviceRunsOnDate(calendar, calendarDates, trip.serviceId, candidate.serviceDate)
    ) {
      continue;
    }
    const shown = perLine.get(route.shortName) || 0;
    if (shown >= LINE_TIMETABLE_ROWS) continue;
    perLine.set(route.shortName, shown + 1);
    departures.push(scheduledArrival(candidate, trip, route));
  }

  return departures.sort((a, b) => a.aimeddeparturetime - b.aimeddeparturetime);
}

/**
 * @param {string} stopId
 * @param {readonly unknown[]} routeIds
 * @param {AbortSignal} [signal]
 * @returns {Promise<Set<string>>}
 */
export async function fetchStopServedRouteIds(stopId, routeIds, signal) {
  const uniqueRouteIds = [
    ...new Set(
      (Array.isArray(routeIds) ? routeIds : [])
        .map((routeId) => String(routeId || "").trim())
        .filter(Boolean)
    ),
  ].slice(0, 32);

  if (uniqueRouteIds.length === 0) return new Set();

  const boardingTripIds = await fetchStopBoardingTripIds(stopId, signal);
  if (boardingTripIds.size === 0) return new Set();

  /** @type {{ routeId: string, tripIds: Set<string> }[]} */
  const routeTripSets = [];

  for (let index = 0; index < uniqueRouteIds.length; index += 6) {
    const batch = uniqueRouteIds.slice(index, index + 6);
    const results = await Promise.all(
      batch.map(async (routeId) => ({
        routeId,
        tripIds: await fetchRouteTripIds(routeId, signal),
      }))
    );
    routeTripSets.push(...results);
  }

  return new Set(
    routeTripSets
      .filter(({ tripIds }) =>
        [...tripIds].some((tripId) => boardingTripIds.has(tripId))
      )
      .map(({ routeId }) => routeId)
  );
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<ServiceBoundary>}
 */
export async function fetchServiceBoundary(signal) {
  const response = await client.get(SERVICE_BOUNDARY_URL, { signal });
  const payload = response.data;

  if (
    !payload ||
    payload.type !== "FeatureCollection" ||
    !Array.isArray(payload.features)
  ) {
    throw new Error("Invalid Föli service boundary.");
  }

  const feature = payload.features.find(
    (/** @type {RawRecord} */ candidate) =>
      candidate?.geometry?.type === "MultiPolygon" &&
      Array.isArray(candidate.geometry.coordinates)
  );

  if (!feature) {
    throw new Error("Föli service boundary is unavailable.");
  }

  return {
    type: "MultiPolygon",
    coordinates: feature.geometry.coordinates,
  };
}
