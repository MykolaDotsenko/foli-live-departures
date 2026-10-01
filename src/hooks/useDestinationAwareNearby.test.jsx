import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchStopMonitor: vi.fn(),
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: api.fetchStopMonitor,
  fetchTripStopTimes: api.fetchTripStopTimes,
}));

import useDestinationAwareNearby, {
  loadDestinationAwareNearby,
} from "./useDestinationAwareNearby";

function arrival(tripref, departure, extra = {}) {
  return {
    tripref,
    lineref: "18",
    monitored: true,
    recordedattime: 990,
    expecteddeparturetime: departure,
    expectedarrivaltime: null,
    aimeddeparturetime: departure,
    aimedarrivaltime: departure,
    visitnumber: 1,
    ...extra,
  };
}

function stopTime(stopId, stopSequence, time, extra = {}) {
  return {
    stopId,
    stopSequence,
    arrivalTime: time,
    departureTime: time,
    pickupType: 0,
    dropOffType: 0,
    timepoint: 1,
    shapeDistTraveled: null,
    ...extra,
  };
}

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

beforeEach(() => {
  api.fetchStopMonitor.mockReset();
  api.fetchTripStopTimes.mockReset();

  api.fetchStopMonitor.mockImplementation(async (stopId) => {
    if (stopId === "400") throw new Error("provider down");
    const byStop = {
      "100": [
        arrival("t-good", 1_600, {
          originaimeddeparturetime: 1_200,
        }),
      ],
      "200": [arrival("t-behind", 1_700)],
      "300": [arrival("t-none", 1_800)],
      "500": [arrival("t-late", 1_100)],
    };
    return {
      stopName: "",
      arrivals: byStop[stopId] || [],
      serverTime: 1_000,
      realtimeAvailable: true,
      scheduleAvailable: false,
      scheduleFailed: false,
      scheduleIncomplete: false,
    };
  });

  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "t-good") {
      return [
        stopTime("100", 1, "10:00:00"),
        stopTime("900", 2, "10:20:00"),
      ];
    }
    if (tripId === "t-behind") {
      return [
        stopTime("900", 1, "10:00:00"),
        stopTime("200", 2, "10:10:00"),
      ];
    }
    if (tripId === "t-none") {
      return [
        stopTime("300", 1, "10:00:00"),
        stopTime("777", 2, "10:15:00"),
      ];
    }
    return [
      stopTime("500", 1, "10:00:00"),
      stopTime("900", 2, "10:20:00"),
    ];
  });
});

test("classifies useful, wrong-direction, no-direct, unavailable and too-late stops", async () => {
  const fits = await loadDestinationAwareNearby({
    stops: [
      { id: "100", distanceMeters: 100 },
      { id: "200", distanceMeters: 80 },
      { id: "300", distanceMeters: 70 },
      { id: "400", distanceMeters: 60 },
      { id: "500", distanceMeters: 350 },
    ],
    destination,
    positionAccuracy: 20,
  });

  expect(fits["100"]).toMatchObject({
    status: "good",
    best: {
      tripRef: "t-good",
      destinationStopId: "900",
      originAimedDepartureAt: 1_200,
      destinationArrivalAt: 2_800,
      catchability: "comfortable",
      liveState: "live",
    },
  });
  expect(fits["200"].status).toBe("other-direction");
  expect(fits["300"].status).toBe("no-direct");
  expect(fits["400"].status).toBe("unavailable");
  expect(fits["500"].status).toBe("too-late");
});

test("prefers a comfortably catchable departure when a tight one saves only a few minutes", async () => {
  api.fetchStopMonitor.mockResolvedValue({
    stopName: "",
    arrivals: [
      arrival("tight", 1_250),
      arrival("safe", 1_500, { lineref: "7" }),
    ],
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  });
  api.fetchTripStopTimes.mockImplementation(async () => [
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:10:00"),
  ]);

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: 100 }],
    destination,
    positionAccuracy: 20,
  });

  expect(fits["100"].best.lineRef).toBe("7");
  expect(fits["100"].best.catchability).toBe("comfortable");
});

test("hook stays idle with no destination and loads evidence when destination exists", async () => {
  const { result, rerender, unmount } = renderHook(
    ({ target }) =>
      useDestinationAwareNearby({
        stops: [{ id: "100", distanceMeters: 100 }],
        destination: target,
        positionAccuracy: 20,
      }),
    { initialProps: { target: null } }
  );

  expect(result.current.state).toBe("idle");
  expect(api.fetchStopMonitor).not.toHaveBeenCalled();

  rerender({ target: destination });

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.fitsByStop["100"].status).toBe("good");

  unmount();
});


test("keeps unknown catchability uncertain instead of calling it good", async () => {
  api.fetchStopMonitor.mockResolvedValue({
    stopName: "",
    arrivals: [arrival("t-good", 1_600)],
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  });
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:20:00"),
  ]);

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: Number.NaN }],
    destination,
    positionAccuracy: null,
  });

  expect(fits["100"].status).toBe("uncertain");
  expect(fits["100"].best?.catchability).toBe("unknown");
});


test("prefers fresh destination-stop live arrival over propagated schedule timing", async () => {
  api.fetchStopMonitor.mockImplementation(async (stopId) => {
    if (stopId === "100") {
      return {
        stopName: "",
        arrivals: [arrival("t-good", 1_600)],
        serverTime: 1_000,
        realtimeAvailable: true,
        scheduleAvailable: false,
        scheduleFailed: false,
        scheduleIncomplete: false,
      };
    }
    if (stopId === "900") {
      return {
        stopName: "",
        arrivals: [
          arrival("t-good", 2_500, {
            expectedarrivaltime: 2_500,
            expecteddeparturetime: 2_520,
            recordedattime: 980,
          }),
        ],
        serverTime: 1_000,
        realtimeAvailable: true,
        scheduleAvailable: false,
        scheduleFailed: false,
        scheduleIncomplete: false,
      };
    }
    return {
      stopName: "",
      arrivals: [],
      serverTime: 1_000,
      realtimeAvailable: true,
      scheduleAvailable: false,
      scheduleFailed: false,
      scheduleIncomplete: false,
    };
  });
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:20:00"),
  ]);

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: 100 }],
    destination,
    positionAccuracy: 20,
  });

  // Schedule propagation would be 1600 + 1200 = 2800. The fresh destination
  // prediction is stronger evidence and should win.
  expect(fits["100"].best?.destinationArrivalAt).toBe(2_500);
  expect(fits["100"].best?.liveState).toBe("live");
});

test("ignores stale destination-stop live prediction", async () => {
  api.fetchStopMonitor.mockImplementation(async (stopId) => {
    if (stopId === "100") {
      return {
        stopName: "",
        arrivals: [arrival("t-good", 1_600)],
        serverTime: 1_000,
        realtimeAvailable: true,
        scheduleAvailable: false,
        scheduleFailed: false,
        scheduleIncomplete: false,
      };
    }
    return {
      stopName: "",
      arrivals: [
        arrival("t-good", 2_500, {
          expectedarrivaltime: 2_500,
          recordedattime: 700,
        }),
      ],
      serverTime: 1_000,
      realtimeAvailable: true,
      scheduleAvailable: false,
      scheduleFailed: false,
      scheduleIncomplete: false,
    };
  });
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:20:00"),
  ]);

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: 100 }],
    destination,
    positionAccuracy: 20,
  });

  expect(fits["100"].best?.destinationArrivalAt).toBe(2_800);
});


test("does not restart polling for identity-only rerenders with the same semantic request", async () => {
  const firstStops = [{ id: "100", distanceMeters: 100 }];
  const { result, rerender } = renderHook(
    ({ currentStops, target }) =>
      useDestinationAwareNearby({
        stops: currentStops,
        destination: target,
        positionAccuracy: 20,
      }),
    {
      initialProps: {
        currentStops: firstStops,
        target: destination,
      },
    }
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  const callsAfterReady = api.fetchStopMonitor.mock.calls.length;

  rerender({
    currentStops: [{ id: "100", distanceMeters: 100 }],
    target: { ...destination, acceptableStopIds: [...destination.acceptableStopIds] },
  });

  await new Promise((resolve) => window.setTimeout(resolve, 30));
  expect(api.fetchStopMonitor.mock.calls.length).toBe(callsAfterReady);
});

test("re-evaluates when the approved destination stop set changes", async () => {
  const { result, rerender } = renderHook(
    ({ target }) =>
      useDestinationAwareNearby({
        stops: [{ id: "100", distanceMeters: 100 }],
        destination: target,
        positionAccuracy: 20,
      }),
    { initialProps: { target: destination } }
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  const callsAfterFirst = api.fetchStopMonitor.mock.calls.length;

  rerender({
    target: {
      ...destination,
      primaryStopId: "901",
      acceptableStopIds: ["901"],
    },
  });

  await waitFor(() =>
    expect(api.fetchStopMonitor.mock.calls.length).toBeGreaterThan(
      callsAfterFirst
    )
  );
});


test("caps dense-hub trip-detail lookups and samples every stop fairly", async () => {
  const denseStops = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    distanceMeters: 50 + index * 25,
  }));

  api.fetchStopMonitor.mockImplementation(async (stopId) => ({
    stopName: "",
    arrivals: Array.from({ length: 16 }, (_, departureIndex) =>
      arrival(
        `${stopId}-trip-${departureIndex}`,
        1_300 + departureIndex * 60,
        { lineref: String(Number(stopId) + 1) }
      )
    ),
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  }));

  // No fetched trip serves its own boarding stop, so target-stop monitor
  // enrichment is never triggered. This isolates the trip-detail budget.
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("9999", 1, "10:00:00"),
    stopTime("900", 2, "10:20:00"),
  ]);

  await loadDestinationAwareNearby({
    stops: denseStops,
    destination,
    positionAccuracy: 15,
  });

  expect(api.fetchTripStopTimes).toHaveBeenCalledTimes(96);

  const fetchedTripIds = new Set(
    api.fetchTripStopTimes.mock.calls.map(([tripId]) => tripId)
  );

  for (const stop of denseStops) {
    expect(fetchedTripIds.has(`${stop.id}-trip-0`)).toBe(true);
    expect(fetchedTripIds.has(`${stop.id}-trip-7`)).toBe(true);
    expect(fetchedTripIds.has(`${stop.id}-trip-8`)).toBe(false);
  }
});


test("prefers a later bus when its shorter final walk reaches the place earlier", async () => {
  api.fetchStopMonitor.mockImplementation(async (stopId) => {
    if (stopId === "100") {
      return {
        stopName: "",
        arrivals: [
          arrival("t-long-walk", 1_600, { lineref: "1" }),
          arrival("t-short-walk", 1_700, { lineref: "2" }),
        ],
        serverTime: 1_000,
        realtimeAvailable: true,
        scheduleAvailable: false,
        scheduleFailed: false,
        scheduleIncomplete: false,
      };
    }

    return {
      stopName: "",
      arrivals: [],
      serverTime: 1_000,
      realtimeAvailable: true,
      scheduleAvailable: false,
      scheduleFailed: false,
      scheduleIncomplete: false,
    };
  });

  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "t-long-walk") {
      return [
        stopTime("100", 1, "10:00:00"),
        stopTime("900", 2, "10:10:00"),
      ];
    }
    return [
      stopTime("100", 1, "10:00:00"),
      stopTime("901", 2, "10:15:00"),
    ];
  });

  const externalDestination = {
    id: "external:nominatim:node:123",
    kind: "external-place",
    label: "Prisma Itäharju",
    primaryStopId: "901",
    acceptableStopIds: ["900", "901"],
    lat: 60.45,
    lon: 22.30,
    finalWalkDistanceByStop: {
      "900": 900,
      "901": 50,
    },
    source: "osm-nominatim",
  };

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: 100 }],
    destination: externalDestination,
    positionAccuracy: 20,
  });

  expect(fits["100"].best).toMatchObject({
    tripRef: "t-short-walk",
    destinationStopId: "901",
    destinationArrivalAt: 2_600,
    finalWalkDistanceM: 50,
    finalWalkSecEstimate: 53,
    journeyArrivalAt: 2_653,
  });

  const longWalk = fits["100"].departures.find(
    (candidate) => candidate.tripRef === "t-long-walk"
  );
  expect(longWalk?.destinationArrivalAt).toBe(2_200);
  expect(longWalk?.journeyArrivalAt).toBeGreaterThan(3_100);
});


test("chooses the best alighting stop within one trip for an external place", async () => {
  api.fetchStopMonitor.mockImplementation(async (stopId) => ({
    stopName: "",
    arrivals:
      stopId === "100"
        ? [arrival("same-trip", 1_600, { lineref: "5" })]
        : [],
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  }));

  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:08:00"),
    stopTime("901", 3, "10:12:00"),
  ]);

  const externalDestination = {
    id: "external:nominatim:node:456",
    kind: "external-place",
    label: "Destination",
    primaryStopId: "901",
    acceptableStopIds: ["900", "901"],
    lat: 60.45,
    lon: 22.30,
    finalWalkDistanceByStop: {
      "900": 960,
      "901": 30,
    },
    source: "osm-nominatim",
  };

  const fits = await loadDestinationAwareNearby({
    stops: [{ id: "100", distanceMeters: 100 }],
    destination: externalDestination,
    positionAccuracy: 20,
  });

  expect(fits["100"].best).toMatchObject({
    tripRef: "same-trip",
    destinationStopId: "901",
    rideDurationSec: 12 * 60,
    finalWalkDistanceM: 30,
  });
});
