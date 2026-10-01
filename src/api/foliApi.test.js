import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./httpClient", () => ({
  default: {
    create: () => ({
      get: mocks.get,
    }),
  },
}));

import {
  fetchRouteCatalog,
  fetchScheduledLineDepartures,
  fetchServiceBoundary,
  fetchStopCatalog,
  fetchStopCoordinates,
  fetchStopMonitor,
  fetchStopServedRouteIds,
  fetchTripDetails,
  fetchTripShape,
  fetchTripStopTimes,
  resetGtfsDatasetForTests,
} from "./foliApi";

const datasetMeta = {
  host: "data.foli.fi",
  gtfspath: "/gtfs/v0",
  latest: "20260920-120000",
};

const datasetBase = "https://data.foli.fi/gtfs/v0/20260920-120000";

beforeEach(() => {
  mocks.get.mockReset();
  resetGtfsDatasetForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

test("keeps the active SIRI stop catalogue independent from GTFS coordinates", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm") {
      return Promise.resolve({
        data: {
          "164": { stop_name: "Kauppatori" },
          "4": { stop_name: "Turun linna" },
        },
      });
    }

    return Promise.reject(new Error("Unexpected URL"));
  });

  const stops = await fetchStopCatalog();

  expect(stops).toEqual([
    { id: "4", name: "Turun linna" },
    { id: "164", name: "Kauppatori" },
  ]);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

// Saved as the catalogue, an empty answer switched name search off for a day.
test("treats a stop list with no stops in it as a failed answer", async () => {
  mocks.get.mockResolvedValue({ data: { status: "OK" } });

  await expect(fetchStopCatalog()).rejects.toThrow("Föli stop list is empty.");
});

test("treats an empty route list as a failed answer and asks again next time", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({ data: [] });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  await expect(fetchRouteCatalog()).rejects.toThrow("Föli GTFS route list is empty.");
  await expect(fetchRouteCatalog()).rejects.toThrow("Föli GTFS route list is empty.");
  expect(
    mocks.get.mock.calls.filter(([url]) => url === `${datasetBase}/routes`)
  ).toHaveLength(2);
});

test("normalizes valid GTFS WGS84 stop coordinates", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stops`) {
      return Promise.resolve({
        data: {
          "164": {
            stop_name: "Kauppatori",
            stop_lat: 60.4518,
            stop_lon: 22.2666,
          },
          "4": {
            stop_name: "Turun linna",
            stop_lat: 60.4355,
            stop_lon: 22.2345,
          },
          "99": {
            stop_name: "Invalid",
            stop_lat: null,
            stop_lon: "",
          },
        },
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const coordinates = await fetchStopCoordinates();

  expect(coordinates.get("164")).toEqual({
    lat: 60.4518,
    lon: 22.2666,
  });
  expect(coordinates.get("4")).toEqual({
    lat: 60.4355,
    lon: 22.2345,
  });
  expect(coordinates.has("99")).toBe(false);
});

test("a GTFS failure cannot prevent normal stop search data from loading", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm") {
      return Promise.resolve({
        data: {
          "164": { stop_name: "Kauppatori" },
        },
      });
    }

    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.reject(new Error("GTFS temporarily unavailable"));
    }

    return Promise.reject(new Error("Unexpected URL"));
  });

  const [catalogResult, coordinateResult] = await Promise.allSettled([
    fetchStopCatalog(),
    fetchStopCoordinates(),
  ]);

  expect(catalogResult).toEqual({
    status: "fulfilled",
    value: [{ id: "164", name: "Kauppatori" }],
  });
  expect(coordinateResult.status).toBe("rejected");
});

test("normalizes route identity and official Föli colors", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          {
            route_id: "1",
            route_short_name: "1",
            route_long_name: "Satama-Kauppatori-Lentoasema",
            route_type: 3,
            route_color: "0bbbef",
            route_text_color: "ffffff",
          },
          {
            route_id: "180",
            route_short_name: "180",
            route_long_name: "Waterbus",
            route_type: 4,
            route_color: "invalid",
            route_text_color: "",
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const routes = await fetchRouteCatalog();

  expect(routes).toEqual([
    {
      id: "1",
      shortName: "1",
      longName: "Satama-Kauppatori-Lentoasema",
      type: 3,
      color: "#0bbbef",
      textColor: "#ffffff",
    },
    {
      id: "180",
      shortName: "180",
      longName: "Waterbus",
      type: 4,
      color: null,
      textColor: null,
    },
  ]);
});

test("normalizes trip shape geometry and keeps GTFS traveled distance", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/shapes/shape-1`) {
      return Promise.resolve({
        data: [
          { lat: 60.4518, lon: 22.2666, traveled: 0 },
          { lat: 60.45, lon: 22.26, traveled: 420.5 },
          { lat: null, lon: 22.2, traveled: 500 },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  await expect(fetchTripShape("shape-1")).resolves.toEqual([
    { lat: 60.4518, lon: 22.2666, traveled: 0 },
    { lat: 60.45, lon: 22.26, traveled: 420.5 },
  ]);

  // Dataset-scoped shape data is cached like trip metadata.
  await fetchTripShape("shape-1");
  expect(
    mocks.get.mock.calls.filter(([url]) => url === `${datasetBase}/shapes/shape-1`)
  ).toHaveLength(1);
});

test("normalizes stop_times shape_dist_traveled for route-distance tracking", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stop_times/trip/trip-shape`) {
      return Promise.resolve({
        data: [
          {
            stop_id: "164",
            arrival_time: "17:40:00",
            departure_time: "17:41:00",
            stop_sequence: 1,
            shape_dist_traveled: 125.25,
          },
          {
            stop_id: "32",
            arrival_time: "17:46:00",
            departure_time: "17:46:00",
            stop_sequence: 2,
            shape_dist_traveled: 987.75,
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const stopTimes = await fetchTripStopTimes("trip-shape");
  expect(stopTimes.map((item) => item.shapeDistTraveled)).toEqual([
    125.25,
    987.75,
  ]);
});

test("fills an empty SIRI board from the active GTFS timetable", async () => {
  const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: {
          status: "OK",
          servertime: reference,
          stopname: "Takakirves",
          result: [],
        },
      });
    }

    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: [
          {
            trip_id: "trip-32",
            arrival_time: "15:20:00",
            departure_time: "15:20:00",
            stop_sequence: 12,
            pickup_type: 0,
            drop_off_type: 0,
          },
          {
            trip_id: "trip-inactive",
            arrival_time: "15:25:00",
            departure_time: "15:25:00",
            stop_sequence: 13,
            pickup_type: 0,
            drop_off_type: 0,
          },
        ],
      });
    }

    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({
        data: {
          weekday: {
            monday: 1,
            tuesday: 1,
            wednesday: 1,
            thursday: 1,
            friday: 1,
            saturday: 0,
            sunday: 0,
            start_date: "20260901",
            end_date: "20260930",
          },
          sunday: {
            monday: 0,
            tuesday: 0,
            wednesday: 0,
            thursday: 0,
            friday: 0,
            saturday: 0,
            sunday: 1,
            start_date: "20260901",
            end_date: "20260930",
          },
        },
      });
    }

    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }

    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            route_short_name: "32",
            route_long_name: "Pansio–Varissuo",
            route_type: 3,
          },
        ],
      });
    }

    if (url === `${datasetBase}/trips/trip/trip-32`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: "weekday",
            trip_headsign: "Varissuo",
            block_id: "block-32",
          },
        ],
      });
    }

    if (url === `${datasetBase}/trips/trip/trip-inactive`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: "sunday",
            trip_headsign: "Varissuo",
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const result = await fetchStopMonitor("621");

  expect(result.stopName).toBe("Takakirves");
  expect(result.realtimeAvailable).toBe(true);
  expect(result.scheduleAvailable).toBe(true);
  expect(result.arrivals.length).toBeGreaterThanOrEqual(1);
  expect(result.arrivals[0]).toEqual(
    expect.objectContaining({
      lineref: "32",
      destinationdisplay: "Varissuo",
      monitored: false,
      tripref: "trip-32",
      routeref: "route-32",
      aimeddeparturetime: Date.parse("2026-09-21T12:20:00Z") / 1000,
    })
  );
});

test("shows the next scheduled bus even when it is tomorrow morning", async () => {
  const reference = Date.parse("2026-09-21T12:45:00Z") / 1000; // 15:45 Helsinki

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: {
          status: "OK",
          servertime: reference,
          stopname: "Takakirves",
          result: [],
        },
      });
    }

    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: [
          {
            trip_id: "trip-tomorrow",
            arrival_time: "06:30:00",
            departure_time: "06:30:00",
            stop_sequence: 7,
            pickup_type: 0,
            drop_off_type: 0,
          },
        ],
      });
    }

    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({
        data: {
          weekday: {
            monday: 1,
            tuesday: 1,
            wednesday: 1,
            thursday: 1,
            friday: 1,
            saturday: 0,
            sunday: 0,
            start_date: "20260901",
            end_date: "20260930",
          },
        },
      });
    }

    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }

    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            route_short_name: "32",
            route_long_name: "Pansio–Varissuo",
            route_type: 3,
          },
        ],
      });
    }

    if (url === `${datasetBase}/trips/trip/trip-tomorrow`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: "weekday",
            trip_headsign: "Varissuo",
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toHaveLength(1);
  expect(result.arrivals[0]).toEqual(
    expect.objectContaining({
      lineref: "32",
      destinationdisplay: "Varissuo",
      monitored: false,
      aimeddeparturetime: Date.parse("2026-09-22T03:30:00Z") / 1000,
    })
  );
});

test("falls back to GTFS when SIRI itself is temporarily unavailable", async () => {
  const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: {
          status: "NO_SIRI_DATA",
          servertime: reference,
          stopname: "Takakirves",
          result: [],
        },
      });
    }

    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: [
          {
            trip_id: "trip-32",
            arrival_time: "15:20:00",
            departure_time: "15:20:00",
            stop_sequence: 12,
            pickup_type: 0,
          },
        ],
      });
    }

    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({
        data: {
          weekday: {
            monday: 1,
            tuesday: 1,
            wednesday: 1,
            thursday: 1,
            friday: 1,
            saturday: 0,
            sunday: 0,
            start_date: "20260901",
            end_date: "20260930",
          },
          sunday: {
            monday: 0,
            tuesday: 0,
            wednesday: 0,
            thursday: 0,
            friday: 0,
            saturday: 0,
            sunday: 1,
            start_date: "20260901",
            end_date: "20260930",
          },
        },
      });
    }

    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }

    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            route_short_name: "32",
            route_type: 3,
          },
        ],
      });
    }

    if (url === `${datasetBase}/trips/trip/trip-32`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: "weekday",
            trip_headsign: "Varissuo",
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const result = await fetchStopMonitor("621");

  expect(result.realtimeAvailable).toBe(false);
  expect(result.arrivals.length).toBeGreaterThanOrEqual(1);
  expect(result.arrivals[0].monitored).toBe(false);
});

test("reuses pinned GTFS timetable data across realtime refreshes", async () => {
  const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: {
          status: "OK",
          servertime: reference,
          stopname: "Takakirves",
          result: [],
        },
      });
    }
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: [
          {
            trip_id: "trip-32",
            departure_time: "15:20:00",
            arrival_time: "15:20:00",
            pickup_type: 0,
          },
        ],
      });
    }
    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({
        data: {
          weekday: {
            monday: 1,
            tuesday: 1,
            wednesday: 1,
            thursday: 1,
            friday: 1,
            saturday: 0,
            sunday: 0,
            start_date: "20260901",
            end_date: "20260930",
          },
          sunday: {
            monday: 0,
            tuesday: 0,
            wednesday: 0,
            thursday: 0,
            friday: 0,
            saturday: 0,
            sunday: 1,
            start_date: "20260901",
            end_date: "20260930",
          },
        },
      });
    }

    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }
    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [{ route_id: "route-32", route_short_name: "32", route_type: 3 }],
      });
    }
    if (url === `${datasetBase}/trips/trip/trip-32`) {
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: "weekday",
            trip_headsign: "Varissuo",
          },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  await fetchStopMonitor("621");
  await fetchStopMonitor("621");

  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === "https://data.foli.fi/siri/sm/621"
    )
  ).toHaveLength(2);
  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === `${datasetBase}/stop_times/stop/621`
    )
  ).toHaveLength(1);
  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === `${datasetBase}/calendar`
    )
  ).toHaveLength(1);
  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === `${datasetBase}/calendar_dates`
    )
  ).toHaveLength(1);
  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === `${datasetBase}/routes`
    )
  ).toHaveLength(1);
  expect(
    mocks.get.mock.calls.filter(
      ([url]) => url === `${datasetBase}/trips/trip/trip-32`
    )
  ).toHaveLength(1);
});

test("keeps monitored vehicle coordinates from SIRI stop monitoring", async () => {
  mocks.get.mockResolvedValue({
    data: {
      status: "OK",
      servertime: 1900000000,
      stopname: "Kauppatori",
      result: [
        {
          lineref: "1",
          destinationdisplay: "Satama",
          destinationdisplay_en: "Harbour",
          destinationdisplay_sv: "Hamnen",
          monitored: true,
          vehicleatstop: true,
          vehicleref: "bus-1",
          incongestion: true,
          __tripref: "trip-1",
          latitude: 60.453,
          longitude: 22.2666,
          recordedattime: 1899999990,
          expecteddeparturetime: 1900000300,
          aimeddeparturetime: 1900000270,
          originaimeddeparturetime: 1899999000,
          destinationaimedarrivaltime: 1900002000,
        },
      ],
    },
  });

  const result = await fetchStopMonitor("164");

  expect(result.arrivals[0]).toEqual(
    expect.objectContaining({
      lineref: "1",
      latitude: 60.453,
      longitude: 22.2666,
      originaimeddeparturetime: 1899999000,
      destinationaimedarrivaltime: 1900002000,
      destinationdisplay_en: "Harbour",
      destinationdisplay_sv: "Hamnen",
      vehicleatstop: true,
      vehicleref: "bus-1",
      incongestion: true,
      tripref: "trip-1",
    })
  );
});

// Ride Mode reads this answer as evidence of where its bus is, so the
// realtime-only form must never be padded with timetable rows.
test("a realtime-only answer never reaches for the GTFS timetable", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: { status: "OK", servertime: 1900000000, result: [] },
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const result = await fetchStopMonitor("621", undefined, {
    scheduleFallback: false,
  });

  expect(result.arrivals).toEqual([]);
  expect(result.realtimeAvailable).toBe(true);
  expect(result.scheduleAvailable).toBe(false);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

test("a realtime-only answer reports an unavailable feed instead of failing", async () => {
  mocks.get.mockResolvedValue({
    data: { status: "NO_SIRI_DATA", servertime: 1900000000, result: [] },
  });

  const result = await fetchStopMonitor("621", undefined, {
    scheduleFallback: false,
  });

  expect(result.realtimeAvailable).toBe(false);
  expect(result.arrivals).toEqual([]);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});


test("pins GTFS stops and routes to the same dataset metadata lookup", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url === `${datasetBase}/stops`) {
      return Promise.resolve({
        data: {
          "164": {
            stop_name: "Kauppatori",
            stop_lat: 60.4518,
            stop_lon: 22.2666,
          },
        },
      });
    }

    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          {
            route_id: "1",
            route_short_name: "1",
            route_long_name: "Test",
            route_type: 3,
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const [coordinates, routes] = await Promise.all([
    fetchStopCoordinates(),
    fetchRouteCatalog(),
  ]);

  expect(coordinates.has("164")).toBe(true);
  expect(routes[0].shortName).toBe("1");
  expect(
    mocks.get.mock.calls.filter(([url]) => url === "https://data.foli.fi/gtfs/")
  ).toHaveLength(1);
  expect(mocks.get).toHaveBeenCalledWith(
    `${datasetBase}/stops`,
    expect.any(Object)
  );
  expect(mocks.get).toHaveBeenCalledWith(
    `${datasetBase}/routes`,
    expect.any(Object)
  );
});

test("loads trip metadata and planned stop sequence from the pinned dataset", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/trips/trip/trip-1`) {
      return Promise.resolve({
        data: [
          {
            route_id: "1",
            service_id: "weekday",
            trip_headsign: "Runosmäki",
            direction_id: 1,
            block_id: "block-1",
            shape_id: "shape-1",
            wheelchair_accessible: 1,
            bikes_allowed: 0,
          },
        ],
      });
    }
    if (url === `${datasetBase}/stop_times/trip/trip-1`) {
      return Promise.resolve({
        data: [
          {
            stop_id: "164",
            arrival_time: "17:40:00",
            departure_time: "17:41:00",
            stop_sequence: 1,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
          },
          {
            stop_id: "32",
            arrival_time: "17:46:00",
            departure_time: "17:46:00",
            stop_sequence: 2,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 0,
          },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const details = await fetchTripDetails("trip-1");
  const stops = await fetchTripStopTimes("trip-1");

  expect(details).toEqual(
    expect.objectContaining({
      tripId: "trip-1",
      headsign: "Runosmäki",
      wheelchairAccessible: 1,
    })
  );
  expect(stops).toEqual([
    expect.objectContaining({ stopId: "164", timepoint: 1 }),
    expect.objectContaining({ stopId: "32", timepoint: 0 }),
  ]);
});

test("derives route membership from boardable stop-times only", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/stop_times/stop/164`) {
      return Promise.resolve({
        data: [
          { trip_id: "trip-board", pickup_type: 0 },
          { trip_id: "trip-dropoff-only", pickup_type: 1 },
        ],
      });
    }
    if (url === `${datasetBase}/trips/route/route-a`) {
      return Promise.resolve({ data: [{ trip_id: "trip-board" }] });
    }
    if (url === `${datasetBase}/trips/route/route-b`) {
      return Promise.resolve({ data: [{ trip_id: "trip-dropoff-only" }] });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const served = await fetchStopServedRouteIds(
    "164",
    ["route-a", "route-b"]
  );

  expect([...served]).toEqual(["route-a"]);
});

test("normalizes the compact Föli service boundary", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/geojson/bounds/compact") {
      return Promise.resolve({
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "MultiPolygon",
                coordinates: [[[[22, 60], [23, 60], [23, 61], [22, 60]]]],
              },
            },
          ],
        },
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  await expect(fetchServiceBoundary()).resolves.toEqual({
    type: "MultiPolygon",
    coordinates: [[[[22, 60], [23, 60], [23, 61], [22, 60]]]],
  });
});

test("rejects malformed realtime payloads instead of presenting partial data", async () => {
  mocks.get.mockResolvedValueOnce({ data: { status: "OK", result: "not-an-array" } });
  await expect(fetchStopMonitor("164")).rejects.toThrow(
    "Invalid Föli departures."
  );

  mocks.get.mockResolvedValueOnce({ data: { status: "ERROR", result: [] } });
  await expect(fetchStopMonitor("164")).rejects.toThrow(
    "Föli real-time data is unavailable."
  );
});

test("filters malformed arrival rows while keeping a valid realtime response usable", async () => {
  mocks.get.mockResolvedValue({
    data: {
      status: "OK",
      servertime: 1900000000,
      stopname: "Kauppatori",
      result: [
        null,
        [],
        "broken",
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: false,
          aimeddeparturetime: 1900000300,
        },
      ],
    },
  });

  const result = await fetchStopMonitor("164");
  expect(result.arrivals).toHaveLength(1);
  expect(result.arrivals[0].lineref).toBe("1");
});

test("re-resolves the pinned GTFS dataset after its TTL and drops rows cached from the retired dataset", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));

  let latest = "20260920-120000";
  const tripUrls = [];

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: { ...datasetMeta, latest } });
    }

    if (url.includes("/trips/trip/")) {
      tripUrls.push(url);
      return Promise.resolve({ data: [{ route_id: "1", trip_headsign: "Satama" }] });
    }

    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });

  await fetchTripDetails("trip-1");
  await fetchTripDetails("trip-1");

  expect(tripUrls).toHaveLength(1);
  expect(tripUrls[0]).toContain("/20260920-120000/");

  // Föli publishes a new dataset while this session is still open.
  latest = "20260921-120000";
  vi.setSystemTime(new Date("2026-09-21T07:00:00Z"));

  await fetchTripDetails("trip-1");

  expect(tripUrls).toHaveLength(2);
  expect(tripUrls[1]).toContain("/20260921-120000/");
});

test("re-resolves GTFS after the device clock moves backwards", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));

  let latest = "20260920-120000";
  const metadataUrls = [];
  const tripUrls = [];

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      metadataUrls.push(url);
      return Promise.resolve({ data: { ...datasetMeta, latest } });
    }
    if (url.includes("/trips/trip/")) {
      tripUrls.push(url);
      return Promise.resolve({ data: [{ route_id: "1" }] });
    }
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });

  await fetchTripDetails("trip-1");
  expect(metadataUrls).toHaveLength(1);
  expect(tripUrls[0]).toContain("/20260920-120000/");

  latest = "20260921-120000";
  // The device corrects a clock that had been one day fast. A negative cache
  // age must invalidate the pin rather than keep the retired dataset forever.
  vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));

  await fetchTripDetails("trip-1");

  expect(metadataUrls).toHaveLength(2);
  expect(tripUrls).toHaveLength(2);
  expect(tripUrls[1]).toContain("/20260921-120000/");
});

test("re-reads rows once after the pin expires, against the confirmed dataset", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));

  const tripUrls = [];

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }

    if (url.includes("/trips/trip/")) {
      tripUrls.push(url);
      return Promise.resolve({ data: [{ route_id: "1" }] });
    }

    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });

  await fetchTripDetails("trip-1");
  await fetchTripDetails("trip-1");
  expect(tripUrls).toHaveLength(1);

  vi.setSystemTime(new Date("2026-09-21T07:00:00Z"));
  await fetchTripDetails("trip-1");
  await fetchTripDetails("trip-1");

  // One re-read after the pin expires, then cached again against the
  // dataset that was just confirmed.
  expect(tripUrls).toHaveLength(2);
  expect(tripUrls[1]).toContain("/20260920-120000/");
});

// A quiet stop late in the evening: the live feed has nothing ahead and the
// timetable lookup fails. Answered as a plain empty board, that read as "no
// more buses tonight" when nobody had been able to check.
test("says the timetable went unchecked when the live feed has nothing ahead", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: { status: "OK", servertime: 1900000000, result: [] },
      });
    }
    return Promise.reject(new Error("GTFS unavailable"));
  });

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toEqual([]);
  expect(result.realtimeAvailable).toBe(true);
  expect(result.scheduleAvailable).toBe(false);
  expect(result.scheduleFailed).toBe(true);
});

test("does not flag the timetable when the live feed already has what is next", async () => {
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data: {
          status: "OK",
          servertime: 1900000000,
          result: [
            {
              lineref: "1",
              monitored: true,
              expecteddeparturetime: 1900000300,
            },
          ],
        },
      });
    }
    return Promise.reject(new Error("GTFS should not be asked"));
  });

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toHaveLength(1);
  expect(result.scheduleFailed).toBe(false);
});

function cancelledRequest() {
  const error = new Error("canceled");
  error.name = "CanceledError";
  return error;
}

function timetableWithTrips(reference, trips, { status = "OK", onHang } = {}) {
  const everyDay = {
    monday: 1,
    tuesday: 1,
    wednesday: 1,
    thursday: 1,
    friday: 1,
    saturday: 1,
    sunday: 1,
    start_date: "20260901",
    end_date: "20260930",
  };

  mocks.get.mockImplementation((url, options) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data:
          status === "OK"
            ? { status, servertime: reference, result: [] }
            : { status, servertime: reference },
      });
    }
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: trips.map(({ id, time }, index) => ({
          trip_id: id,
          arrival_time: time,
          departure_time: time,
          stop_sequence: 10 + index,
          pickup_type: 0,
          drop_off_type: 0,
        })),
      });
    }
    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({ data: { daily: everyDay } });
    }
    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }
    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [{ route_id: "route-32", route_short_name: "32", route_type: 3 }],
      });
    }
    const trip = trips.find(({ id }) => url === `${datasetBase}/trips/trip/${id}`);
    if (trip?.hangs) {
      // Settles only as axios does when its request is cancelled.
      onHang?.();
      return new Promise((resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(cancelledRequest());
          return;
        }
        signal?.addEventListener("abort", () => reject(cancelledRequest()));
      });
    }
    if (trip && !trip.fails) {
      return Promise.resolve({
        data: [
          { route_id: "route-32", service_id: "daily", trip_headsign: "Varissuo" },
        ],
      });
    }
    return Promise.reject(new Error(`Unavailable: ${url}`));
  });
}

// One trip lookup failing used to drop that departure silently, so the next
// bus looked like the 16:10 when the 15:40 might well be running.
test("stops the timetable list at a departure it could not check", async () => {
  const reference = Date.parse("2026-09-21T12:15:00Z") / 1000; // 15:15 Helsinki
  timetableWithTrips(reference, [
    { id: "trip-gap-a", time: "15:20:00" },
    { id: "trip-gap-b", time: "15:40:00", fails: true },
    { id: "trip-gap-c", time: "16:10:00" },
  ]);

  const result = await fetchStopMonitor("621");

  expect(result.arrivals.map((row) => row.tripref)).toEqual(["trip-gap-a"]);
  expect(result.scheduleAvailable).toBe(true);
  expect(result.scheduleIncomplete).toBe(true);
  expect(result.scheduleFailed).toBe(false);
});

test("counts a timetable whose first departure could not be checked as unchecked", async () => {
  const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;
  timetableWithTrips(reference, [
    { id: "trip-first-a", time: "15:20:00", fails: true },
    { id: "trip-first-b", time: "15:40:00" },
  ]);

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toEqual([]);
  expect(result.scheduleFailed).toBe(true);
});

// Switching stops cancels the old stop's timetable lookups. Counted as trips
// that could not be checked, the cancellation came back as a failed update
// (or, at a stop with a live answer, as an unchecked timetable) and landed on
// the stop the passenger had just opened.
test.each(["OK", "NO_SIRI_DATA"])(
  "a timetable lookup cancelled midway ends as cancelled at a %s stop",
  async (status) => {
    const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;
    const controller = new AbortController();
    timetableWithTrips(
      reference,
      [{ id: "trip-cancelled", time: "15:20:00", hangs: true }],
      { status, onHang: () => globalThis.queueMicrotask(() => controller.abort()) }
    );

    const outcome = await fetchStopMonitor("621", controller.signal).then(
      (value) => ({ value }),
      (error) => ({ error })
    );

    expect(outcome.value).toBeUndefined();
    expect(["CanceledError", "AbortError"]).toContain(outcome.error?.name);
  }
);

// A busy stop's live answer can list the followed line's bus 27th. Cut to
// 24 rows before the board's line filter saw it, the line looked idle.
test("keeps every live row of a busy stop for the board to filter", async () => {
  const now = Math.floor(Date.now() / 1000);
  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/164") {
      return Promise.resolve({
        data: {
          status: "OK",
          servertime: now,
          result: Array.from({ length: 45 }, (_, index) => ({
            lineref: index === 26 || index === 44 ? "32" : "1",
            destinationdisplay: index === 26 || index === 44 ? "Varissuo" : "Satama",
            monitored: true,
            expecteddeparturetime: now + 60 + index * 30,
            aimeddeparturetime: now + 60 + index * 30,
          })),
        },
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const result = await fetchStopMonitor("164");

  expect(result.arrivals).toHaveLength(45);
  expect(result.arrivals.filter((row) => row.lineref === "32")).toHaveLength(2);
});

test("reads a followed line's next departures from the stop's timetable", async () => {
  const reference = Date.parse("2026-09-21T12:45:00Z") / 1000; // Mon 15:45 Helsinki

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/stop_times/stop/164`) {
      return Promise.resolve({
        data: [
          // Line 1 every few minutes, which a stop-wide fallback would fill up on.
          ...Array.from({ length: 40 }, (_, index) => ({
            trip_id: `trip-1-${index}`,
            arrival_time: `16:${String(index).padStart(2, "0")}:00`,
            departure_time: `16:${String(index).padStart(2, "0")}:00`,
            stop_sequence: 3,
            pickup_type: 0,
          })),
          { trip_id: "trip-18-a", departure_time: "16:55:00", arrival_time: "16:55:00", stop_sequence: 5, pickup_type: 0 },
          { trip_id: "trip-18-weekend", departure_time: "17:25:00", arrival_time: "17:25:00", stop_sequence: 5, pickup_type: 0 },
          { trip_id: "trip-18-b", departure_time: "17:55:00", arrival_time: "17:55:00", stop_sequence: 5, pickup_type: 0 },
        ],
      });
    }
    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({
        data: {
          weekday: { monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, start_date: "20260901", end_date: "20260930" },
          weekend: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 1, sunday: 1, start_date: "20260901", end_date: "20260930" },
        },
      });
    }
    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }
    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [
          { route_id: "route-1", route_short_name: "1", route_type: 3 },
          { route_id: "route-18", route_short_name: "18", route_type: 3 },
        ],
      });
    }
    if (url === `${datasetBase}/trips/route/route-18`) {
      return Promise.resolve({
        data: [
          { trip_id: "trip-18-a", service_id: "weekday", trip_headsign: "Lauste" },
          { trip_id: "trip-18-weekend", service_id: "weekend", trip_headsign: "Lauste" },
          { trip_id: "trip-18-b", service_id: "weekday", trip_headsign: "Lauste" },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const departures = await fetchScheduledLineDepartures("164", ["18"], reference);

  expect(
    departures.map((row) => [row.lineref, row.destinationdisplay, row.tripref, row.monitored])
  ).toEqual([
    ["18", "Lauste", "trip-18-a", false],
    ["18", "Lauste", "trip-18-b", false],
    ["18", "Lauste", "trip-18-a", false],
  ]);
  // Today's two weekday buses, then tomorrow's first: three per line, the
  // weekend trip skipped.
  expect(departures.map((row) => row.aimeddeparturetime)).toEqual([
    Date.parse("2026-09-21T13:55:00Z") / 1000,
    Date.parse("2026-09-21T14:55:00Z") / 1000,
    Date.parse("2026-09-22T13:55:00Z") / 1000,
  ]);
  // No per-trip lookups: the route's own trip list carries the service.
  expect(mocks.get.mock.calls.some(([url]) => url.includes("/trips/trip/"))).toBe(false);
});

// 02:00 on Sunday 4 October at a stop whose timetable lists 300 weekday-only
// trips between 05:00 and 06:40 before its first Sunday bus at 08:00.
const SUNDAY_2AM = Date.UTC(2026, 9, 3, 23, 0, 0) / 1000;

function weekdayHeavyTimetable({
  status = "NO_SIRI_DATA",
  line = "",
  weekdayTrips = 300,
  failTrips = [],
} = {}) {
  const days = (weekdays, sunday) => ({
    monday: weekdays,
    tuesday: weekdays,
    wednesday: weekdays,
    thursday: weekdays,
    friday: weekdays,
    saturday: 0,
    sunday,
    start_date: "20260801",
    end_date: "20261231",
  });
  const clock = (seconds) =>
    [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  const trips = [
    ...Array.from({ length: weekdayTrips }, (_, index) => ({
      trip_id: `wk-${index}`,
      departure_time: clock(5 * 3600 + index * 20),
      service_id: "WK",
    })),
    { trip_id: "su-1", departure_time: "08:00:00", service_id: "SU" },
  ];
  const tripUrl = `${datasetBase}/trips/trip/`;

  mocks.get.mockImplementation((url) => {
    if (url === "https://data.foli.fi/siri/sm/621") {
      return Promise.resolve({
        data:
          status === "OK"
            ? { status, servertime: SUNDAY_2AM, result: [] }
            : { status, servertime: SUNDAY_2AM },
      });
    }
    if (url === "https://data.foli.fi/gtfs/") {
      return Promise.resolve({ data: datasetMeta });
    }
    if (url === `${datasetBase}/stop_times/stop/621`) {
      return Promise.resolve({
        data: trips.map(({ trip_id, departure_time }) => ({
          trip_id,
          arrival_time: departure_time,
          departure_time,
          stop_sequence: 4,
          pickup_type: 0,
        })),
      });
    }
    if (url === `${datasetBase}/calendar`) {
      return Promise.resolve({ data: { WK: days(1, 0), SU: days(0, 1) } });
    }
    if (url === `${datasetBase}/calendar_dates`) {
      return Promise.resolve({ data: {} });
    }
    if (url === `${datasetBase}/routes`) {
      return Promise.resolve({
        data: [{ route_id: "route-32", route_short_name: "32", route_type: 3 }],
      });
    }
    if (line && url === `${datasetBase}/trips/route/route-32`) {
      return Promise.resolve({
        data: trips.map(({ trip_id, service_id }) => ({
          trip_id,
          service_id,
          trip_headsign: "Varissuo",
        })),
      });
    }
    if (url.startsWith(tripUrl)) {
      if (failTrips.includes(url.slice(tripUrl.length))) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({
        data: [
          {
            route_id: "route-32",
            service_id: url.slice(tripUrl.length).startsWith("su-") ? "SU" : "WK",
            trip_headsign: "Varissuo",
          },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

const tripLookups = () =>
  mocks.get.mock.calls.filter(([url]) => url.includes("/trips/trip/")).length;

const SUNDAY_8AM = Date.UTC(2026, 9, 4, 5, 0, 0) / 1000;

// The timetable search checked at most 256 rows. Every one of them was a
// weekday trip: first the board said "No upcoming departures" before an
// 08:00 Sunday bus, then that Föli was down, backing off its refreshes.
test("finds the first Sunday bus behind a long weekday timetable", async () => {
  weekdayHeavyTimetable();

  const result = await fetchStopMonitor("621");

  expect(result.arrivals[0]?.tripref).toBe("su-1");
  expect(result.arrivals[0]?.aimeddeparturetime).toBe(SUNDAY_8AM);
  // Then Monday's first weekday buses, up to a full board.
  expect(result.arrivals).toHaveLength(24);
  expect(result.arrivals[1]?.tripref).toBe("wk-0");
  expect(result.scheduleAvailable).toBe(true);
  expect(result.scheduleFailed).toBe(false);
  expect(result.scheduleIncomplete).toBe(false);
});

// Each weekday trip appears on Sunday and again on Monday; it is one trip,
// asked about once, and every refresh after the first asks about none.
test("a repeated timetable search reuses every trip it already read", async () => {
  weekdayHeavyTimetable();

  await fetchStopMonitor("621");
  const first = tripLookups();
  await fetchStopMonitor("621");

  expect(first).toBe(301);
  expect(tripLookups()).toBe(first);
});

// SIRI's "nothing tonight" is a normal answer, and so was the timetable: one
// trip that could not be checked is a timetable "maybe", not an outage.
test("an unchecked trip at a quiet stop leaves the timetable unfinished, not Föli down", async () => {
  weekdayHeavyTimetable({ failTrips: ["wk-10"] });

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toEqual([]);
  expect(result.realtimeAvailable).toBe(false);
  expect(result.scheduleAvailable).toBe(false);
  expect(result.scheduleFailed).toBe(true);
  expect(result.scheduleIncomplete).toBe(true);
});

test("flags an unchecked trip as an unfinished timetable beside a live feed", async () => {
  weekdayHeavyTimetable({ status: "OK", failTrips: ["wk-10"] });

  const result = await fetchStopMonitor("621");

  expect(result.arrivals).toEqual([]);
  expect(result.scheduleIncomplete).toBe(true);
  expect(result.scheduleFailed).toBe(true);
});

// The search asks about at most 1024 trips. Reaching that bound keeps what
// it found and says the rest was not checked.
test("stops a timetable search at its trip bound and calls it unfinished", async () => {
  weekdayHeavyTimetable({ weekdayTrips: 1100 });

  const result = await fetchStopMonitor("621");

  expect(tripLookups()).toBeLessThanOrEqual(1024);
  expect(result.arrivals.map((row) => row.tripref)).toEqual(["su-1"]);
  expect(result.scheduleAvailable).toBe(true);
  expect(result.scheduleIncomplete).toBe(true);
});

// A followed line's timetable checks each row against its route's trip list
// without a request, so a cap only ever hid buses: Sunday's first one sat
// behind 300 weekday rows.
test("finds a followed line's Sunday bus behind a long weekday timetable", async () => {
  weekdayHeavyTimetable({ line: "32" });

  const departures = await fetchScheduledLineDepartures("621", ["32"], SUNDAY_2AM);

  expect(departures[0]?.tripref).toBe("su-1");
  expect(departures[0]?.aimeddeparturetime).toBe(Date.UTC(2026, 9, 4, 5, 0, 0) / 1000);
});
