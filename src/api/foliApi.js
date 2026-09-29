import axios from "axios";
import createBoundedCache from "../utils/boundedCache";
import { timestampIsFresh } from "../utils/cacheTime";
import {
  mergeRealtimeAndScheduled,
  scheduledClockCandidates,
  serviceRunsOnDate,
} from "../utils/gtfsSchedule";

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

// Dataset-scoped responses. Bounded so a display left running for days cannot
// grow its memory without limit.
const tripDetailsCache = createBoundedCache(200);
const tripStopTimesCache = createBoundedCache(60);
const stopBoardingTripsCache = createBoundedCache(20);
const routeTripsCache = createBoundedCache(60);
const tripShapeCache = createBoundedCache(40);
const stopTimetableCache = createBoundedCache(30);
const calendarCache = createBoundedCache(1);
const calendarDatesCache = createBoundedCache(1);
const routeCatalogCache = createBoundedCache(1);

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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinateNumber(value, min, max) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function gtfsColor(value) {
  const normalized = optionalString(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized.toLowerCase()}`
    : null;
}

function normalizeArrival(arrival) {
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

  const realtimeRows =
    status === "OK"
      ? payload.result.map(normalizeArrival).filter(Boolean)
      : [];
  const hasFutureRealtime = realtimeRows.some((arrival) => {
    const departure =
      positiveNumber(arrival.expecteddeparturetime) ??
      positiveNumber(arrival.expectedarrivaltime) ??
      positiveNumber(arrival.aimeddeparturetime) ??
      positiveNumber(arrival.aimedarrivaltime);
    return departure !== null && departure >= serverTime - 30;
  });

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
      scheduleFailed = !scheduleAvailable;
      if (scheduleFailed && status !== "OK") {
        throw new Error("Föli departure data is unavailable.");
      }
    } catch (error) {
      if (
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
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

export async function fetchStopCatalog(signal) {
  const response = await client.get(API_BASE_URL, { signal });
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli stop list.");
  }

  const stops = Object.entries(payload)
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

export async function fetchStopCoordinates(signal) {
  const response = await client.get(
    await gtfsResourceUrl("stops", STOPS_URL_OVERRIDE),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS stop list.");
  }

  const coordinates = new Map();

  Object.entries(payload).forEach(([id, stop]) => {
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

export async function fetchRouteCatalog(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = ROUTES_URL_OVERRIDE || "routes";
  if (routeCatalogCache.has(cacheKey)) {
    return routeCatalogCache.get(cacheKey);
  }

  const response = await client.get(
    await gtfsResourceUrl("routes", ROUTES_URL_OVERRIDE),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS route list.");
  }

  const normalized = payload
    .map((route) => {
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

export async function fetchAlerts(signal) {
  const response = await client.get(ALERTS_URL, { signal });
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli alerts response.");
  }

  return payload;
}



function requiredId(value, label) {
  const id =
    value === null || value === undefined ? "" : String(value).trim();
  if (!id || id.length > 160) {
    throw new Error(`Invalid Föli ${label}.`);
  }
  return id;
}

function gtfsTime(value) {
  if (typeof value === "string" && /^\d{1,3}:\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  return "";
}

async function fetchStopTimetable(stopId, signal) {
  const id = requiredId(stopId, "stop ID");
  invalidateExpiredGtfsDataset();
  if (stopTimetableCache.has(id)) return stopTimetableCache.get(id);

  const response = await client.get(
    await gtfsResourceUrl(`stop_times/stop/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS stop timetable.");
  }

  const normalized = payload
    .map((item) => ({
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

async function fetchCalendar(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = "calendar";
  if (calendarCache.has(cacheKey)) {
    return calendarCache.get(cacheKey);
  }

  const response = await client.get(
    await gtfsResourceUrl("calendar"),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS calendar.");
  }

  const normalized = Object.fromEntries(
    Object.entries(payload).map(([serviceId, entry]) => [
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

async function fetchCalendarDates(signal) {
  invalidateExpiredGtfsDataset();
  const cacheKey = "calendar_dates";
  if (calendarDatesCache.has(cacheKey)) {
    return calendarDatesCache.get(cacheKey);
  }

  const response = await client.get(
    await gtfsResourceUrl("calendar_dates"),
    { signal }
  );
  const payload = response.data;

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Invalid Föli GTFS calendar dates.");
  }

  const normalized = Object.fromEntries(
    Object.entries(payload).map(([serviceId, entries]) => [
      String(serviceId),
      (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
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
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  throw error;
}

async function fetchTripDetailsInBatches(tripIds, signal) {
  const ids = [...new Set(tripIds.filter(Boolean))];
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

  const clockCandidates = scheduledClockCandidates(rows, reference, {
    // SIRI can legitimately be empty even though the next published service
    // is later tonight or tomorrow morning. Search far enough to bridge that
    // gap without turning this into a week-long timetable browser.
    lookaheadSeconds: 36 * 60 * 60,
    graceSeconds: 30,
    maxRows: 256,
  });

  if (clockCandidates.length === 0) return { departures: [], complete: true };

  const routesById = new Map(routes.map((route) => [route.id, route]));
  const scheduled = [];
  // A trip whose metadata could not be fetched may or may not run. Skipping
  // it like a trip that does not run dropped a departure without a word, so
  // the list stops at the first one that could not be checked instead.
  let uncheckedFrom = null;

  // Resolve trip metadata chronologically and stop as soon as we have enough
  // active departures. This keeps the fallback cheap at busy stops while
  // still being able to skip inactive service patterns and reach tomorrow.
  for (
    let index = 0;
    index < clockCandidates.length &&
    scheduled.length < 24 &&
    uncheckedFrom === null;
    index += 12
  ) {
    const batch = clockCandidates.slice(index, index + 12);
    const tripDetailsById = await fetchTripDetailsInBatches(
      batch.map((candidate) => candidate.tripId),
      signal
    );

    batch.forEach((candidate) => {
      if (uncheckedFrom !== null) return;
      if (!tripDetailsById.has(candidate.tripId)) {
        uncheckedFrom = candidate.aimedDepartureTime;
        return;
      }

      const details = tripDetailsById.get(candidate.tripId);
      if (
        !details?.serviceId ||
        !serviceRunsOnDate(
          calendar,
          calendarDates,
          details.serviceId,
          candidate.serviceDate
        )
      ) {
        return;
      }

      scheduled.push(
        scheduledArrival(candidate, details, routesById.get(details.routeId))
      );
    });
  }

  return {
    departures: scheduled
      .filter(
        (row) =>
          uncheckedFrom === null || row.aimeddeparturetime < uncheckedFrom
      )
      .sort((a, b) => a.aimeddeparturetime - b.aimeddeparturetime)
      .slice(0, 24),
    complete: uncheckedFrom === null,
  };
}

export async function fetchTripDetails(tripId, signal) {
  const id = requiredId(tripId, "trip ID");
  invalidateExpiredGtfsDataset();
  if (tripDetailsCache.has(id)) return tripDetailsCache.get(id);
  const response = await client.get(
    await gtfsResourceUrl(`trips/trip/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("Föli GTFS trip metadata is unavailable.");
  }

  const trip = payload[0];

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

export async function fetchTripStopTimes(tripId, signal) {
  const id = requiredId(tripId, "trip ID");
  invalidateExpiredGtfsDataset();
  if (tripStopTimesCache.has(id)) return tripStopTimesCache.get(id);
  const response = await client.get(
    await gtfsResourceUrl(`stop_times/trip/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS trip stop sequence.");
  }

  const normalized = payload
    .map((item) => ({
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
    .filter((item) => item.stopId && item.stopSequence !== null)
    .sort((a, b) => a.stopSequence - b.stopSequence);

  tripStopTimesCache.set(id, normalized);
  return normalized;
}

export async function fetchTripShape(shapeId, signal) {
  const id = requiredId(shapeId, "shape ID");
  invalidateExpiredGtfsDataset();
  if (tripShapeCache.has(id)) return tripShapeCache.get(id);

  const response = await client.get(
    await gtfsResourceUrl(`shapes/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS trip shape.");
  }

  const normalized = payload
    .map((point) => ({
      lat: coordinateNumber(point?.lat, -90, 90),
      lon: coordinateNumber(point?.lon, -180, 180),
      traveled: optionalNumber(point?.traveled),
    }))
    .filter((point) => point.lat !== null && point.lon !== null);

  if (normalized.length < 2) {
    throw new Error("Föli GTFS trip shape is unavailable.");
  }

  tripShapeCache.set(id, normalized);
  return normalized;
}

export async function fetchStopBoardingTripIds(stopId, signal) {
  const id = requiredId(stopId, "stop ID");
  invalidateExpiredGtfsDataset();
  if (stopBoardingTripsCache.has(id)) {
    return new Set(stopBoardingTripsCache.get(id));
  }

  const rows = await fetchStopTimetable(id, signal);
  const tripIds = rows.map((item) => item.tripId).filter(Boolean);

  stopBoardingTripsCache.set(id, tripIds);
  return new Set(tripIds);
}

// One route's trips, with the service each runs on and its sign. One
// request serves both uses: which trips a route alert covers, and when a
// followed line next leaves a stop.
async function fetchRouteTrips(routeId, signal) {
  const id = requiredId(routeId, "route ID");
  invalidateExpiredGtfsDataset();
  if (routeTripsCache.has(id)) return routeTripsCache.get(id);
  const response = await client.get(
    await gtfsResourceUrl(`trips/route/${encodeURIComponent(id)}`),
    { signal }
  );
  const payload = response.data;

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Föli GTFS route trips.");
  }

  const text = (value) =>
    value === null || value === undefined ? "" : String(value);
  const trips = payload
    .map((trip) => ({
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

export async function fetchRouteTripIds(routeId, signal) {
  const trips = await fetchRouteTrips(routeId, signal);
  return new Set(trips.map((trip) => trip.tripId));
}

// The next timetable departures, from one stop, of the lines a passenger
// follows there. The live feed looks only an hour or so ahead, and the
// stop's own timetable fallback stops at its first 24 departures, so an
// hourly line at a busy stop fell outside both and the board said it had
// none. Its route's trips pick its departures out of the stop's timetable.
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
  const trips = new Map();
  lineRoutes.forEach((route, index) => {
    for (const trip of routeTrips[index]) trips.set(trip.tripId, { trip, route });
  });

  const candidates = scheduledClockCandidates(
    rows.filter((row) => trips.has(String(row.tripId))),
    reference,
    { lookaheadSeconds: 36 * 60 * 60, graceSeconds: 30, maxRows: 256 }
  );

  const perLine = new Map();
  const departures = [];
  for (const candidate of candidates) {
    const { trip, route } = trips.get(candidate.tripId);
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
    (candidate) =>
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
