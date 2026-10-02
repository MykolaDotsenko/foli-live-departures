import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchStopMonitor: vi.fn(),
  fetchScheduledStopDepartures: vi.fn(),
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: api.fetchStopMonitor,
  fetchScheduledStopDepartures: api.fetchScheduledStopDepartures,
  fetchTripStopTimes: api.fetchTripStopTimes,
}));

import useTransferJourneyOptions, {
  loadTransferJourneyOptions,
} from "./useTransferJourneyOptions";

function firstArrival(extra = {}) {
  return {
    tripref: "first",
    lineref: "1",
    monitored: true,
    recordedattime: 990,
    expecteddeparturetime: 1_300,
    aimeddeparturetime: 1_300,
    aimedarrivaltime: 1_300,
    ...extra,
  };
}

function scheduled(tripref, line, departure) {
  return {
    tripref,
    lineref: line,
    monitored: false,
    aimeddeparturetime: departure,
    aimedarrivaltime: departure,
    originaimeddeparturetime: departure - 300,
  };
}

function time(stopId, sequence, clock, extra = {}) {
  return {
    stopId,
    stopSequence: sequence,
    arrivalTime: clock,
    departureTime: clock,
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
  label: "Destination",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

beforeEach(() => {
  vi.useRealTimers();
  api.fetchStopMonitor.mockReset().mockResolvedValue({
    stopName: "Origin",
    arrivals: [firstArrival()],
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  });

  api.fetchScheduledStopDepartures.mockReset().mockResolvedValue({
    departures: [scheduled("second", "7", 2_050)],
    complete: true,
  });

  api.fetchTripStopTimes.mockReset().mockImplementation(async (tripId) => {
    if (tripId === "first") {
      return [
        time("100", 1, "10:00:00"),
        time("500", 2, "10:10:00"),
      ];
    }
    if (tripId === "second") {
      return [
        time("500", 1, "10:20:00"),
        time("900", 2, "10:40:00"),
      ];
    }
    return [];
  });
});

test("builds a concrete same-stop one-transfer journey", async () => {
  const options = await loadTransferJourneyOptions({
    originStops: [
      {
        id: "100",
        name: "Origin",
        distanceMeters: 20,
        lat: 60.45,
        lon: 22.26,
      },
    ],
    allStops: [
      { id: "100", name: "Origin", lat: 60.45, lon: 22.26 },
      { id: "500", name: "Hub", lat: 60.46, lon: 22.27 },
      { id: "900", name: "Destination", lat: 60.47, lon: 22.28 },
    ],
    destination,
    positionAccuracy: 10,
  });

  expect(options).toHaveLength(1);
  expect(options[0]).toMatchObject({
    originStopId: "100",
    first: {
      tripRef: "first",
      lineRef: "1",
      boardStopId: "100",
      exitStopId: "500",
      departureAt: 1_300,
      arrivalAt: 1_900,
    },
    transfer: {
      alightStopId: "500",
      boardStopId: "500",
      walkingDistanceM: 0,
      feasibility: {
        recommendable: true,
      },
    },
    second: {
      tripRef: "second",
      lineRef: "7",
      boardStopId: "500",
      exitStopId: "900",
      departureAt: 2_050,
      arrivalAt: 3_250,
    },
    journeyArrivalAt: 3_250,
  });
});


test("builds a concrete bounded two-transfer journey", async () => {
  api.fetchScheduledStopDepartures.mockImplementation(async (stopId) => {
    if (String(stopId) === "500") {
      return {
        departures: [scheduled("second", "7", 2_050)],
        complete: true,
      };
    }
    if (String(stopId) === "700") {
      return {
        departures: [scheduled("third", "18", 3_050)],
        complete: true,
      };
    }
    return { departures: [], complete: true };
  });

  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "first") {
      return [
        time("100", 1, "10:00:00"),
        time("500", 2, "10:10:00"),
      ];
    }
    if (tripId === "second") {
      return [
        time("500", 1, "10:20:00"),
        time("700", 2, "10:30:00"),
      ];
    }
    if (tripId === "third") {
      return [
        time("700", 1, "10:40:00"),
        time("900", 2, "10:55:00"),
      ];
    }
    return [];
  });

  const options = await loadTransferJourneyOptions({
    originStops: [{ id: "100", name: "Origin", distanceMeters: 20 }],
    allStops: [
      { id: "100", name: "Origin" },
      { id: "500", name: "First hub" },
      { id: "700", name: "Second hub" },
      { id: "900", name: "Destination" },
    ],
    destination,
    positionAccuracy: 10,
  });

  const twoTransfer = options.find((candidate) => candidate.legs?.length === 3);
  expect(twoTransfer).toBeTruthy();
  expect(twoTransfer).toMatchObject({
    originStopId: "100",
    destinationStopId: "900",
    legs: [
      { tripRef: "first", boardStopId: "100", exitStopId: "500" },
      { tripRef: "second", boardStopId: "500", exitStopId: "700" },
      { tripRef: "third", boardStopId: "700", exitStopId: "900" },
    ],
    transfers: [
      { alightStopId: "500", boardStopId: "500" },
      { alightStopId: "700", boardStopId: "700" },
    ],
  });
});

test("two-transfer expansion never exceeds the combined timetable request budget", async () => {
  api.fetchScheduledStopDepartures.mockImplementation(async (stopId) => ({
    departures: String(stopId).startsWith("7")
      ? [scheduled(`third-${stopId}`, "18", 3_500)]
      : [scheduled("second", "7", 2_050)],
    complete: true,
  }));
  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "first") {
      return [
        time("100", 1, "10:00:00"),
        time("500", 2, "10:10:00"),
      ];
    }
    if (tripId === "second") {
      return [
        time("500", 1, "10:20:00"),
        ...Array.from({ length: 12 }, (_, index) =>
          time(String(700 + index), index + 2, `10:${String(25 + index).padStart(2, "0")}:00`)
        ),
      ];
    }
    if (String(tripId).startsWith("third-")) {
      const board = String(tripId).slice("third-".length);
      return [
        time(board, 1, "11:00:00"),
        time("900", 2, "11:15:00"),
      ];
    }
    return [];
  });

  await loadTransferJourneyOptions({
    originStops: [{ id: "100", distanceMeters: 20 }],
    allStops: [
      { id: "500", name: "Hub" },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: String(700 + index),
        name: `Hub ${index + 1}`,
      })),
    ],
    destination,
    positionAccuracy: 10,
  });

  expect(api.fetchScheduledStopDepartures.mock.calls.length).toBeLessThanOrEqual(
    16
  );
});

test("rejects a connection with insufficient transfer margin", async () => {
  api.fetchScheduledStopDepartures.mockResolvedValue({
    departures: [scheduled("second", "7", 1_930)],
    complete: true,
  });

  const options = await loadTransferJourneyOptions({
    originStops: [{ id: "100", distanceMeters: 20 }],
    allStops: [{ id: "500", name: "Hub" }],
    destination,
    positionAccuracy: 10,
  });

  expect(options).toEqual([]);
});

test("can use a nearby platform when the same stop has no usable departure", async () => {
  api.fetchScheduledStopDepartures.mockImplementation(async (stopId) => ({
    departures:
      stopId === "501" ? [scheduled("second", "7", 2_180)] : [],
    complete: true,
  }));
  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "first") {
      return [
        time("100", 1, "10:00:00"),
        time("500", 2, "10:10:00"),
      ];
    }
    if (tripId === "second") {
      return [
        time("501", 1, "10:20:00"),
        time("900", 2, "10:40:00"),
      ];
    }
    return [];
  });

  const options = await loadTransferJourneyOptions({
    originStops: [{ id: "100", distanceMeters: 20 }],
    allStops: [
      { id: "500", name: "Hub A", lat: 60.4518, lon: 22.2666 },
      { id: "501", name: "Hub B", lat: 60.4520, lon: 22.2670 },
    ],
    destination,
    positionAccuracy: 10,
  });

  expect(options).toHaveLength(1);
  expect(options[0].transfer.boardStopId).toBe("501");
  expect(options[0].transfer.walkingDistanceM).toBeGreaterThan(0);
});

test("never exceeds the transfer timetable lookup budget", async () => {
  api.fetchStopMonitor.mockImplementation(async (stopId) => ({
    stopName: stopId,
    arrivals: [firstArrival({ tripref: `first-${stopId}` })],
    serverTime: 1_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  }));
  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (String(tripId).startsWith("first-")) {
      const suffix = String(tripId).split("-")[1];
      return [
        time(suffix, 1, "10:00:00"),
        time(`x-${suffix}`, 2, "10:10:00"),
      ];
    }
    return [];
  });
  api.fetchScheduledStopDepartures.mockResolvedValue({
    departures: [],
    complete: true,
  });

  const origins = Array.from({ length: 12 }, (_, index) => ({
    id: String(100 + index),
    distanceMeters: 10,
  }));
  const stops = origins.flatMap((origin) => [
    origin,
    { id: `x-${origin.id}` },
  ]);

  await loadTransferJourneyOptions({
    originStops: origins,
    allStops: stops,
    destination,
    positionAccuracy: 10,
  });

  expect(api.fetchScheduledStopDepartures.mock.calls.length).toBeLessThanOrEqual(
    8
  );
});


afterEach(() => {
  vi.useRealTimers();
});

test("returns no transfer work without a destination or nearby origins", async () => {
  await expect(
    loadTransferJourneyOptions({
      originStops: [],
      allStops: [],
      destination: null,
    })
  ).resolves.toEqual([]);
  expect(api.fetchStopMonitor).not.toHaveBeenCalled();
});

test("fails closed when all origin monitors fail or contain no catchable departures", async () => {
  api.fetchStopMonitor
    .mockRejectedValueOnce(new Error("provider down"))
    .mockResolvedValueOnce({
      stopName: "Quiet",
      arrivals: [],
      serverTime: 1_000,
      realtimeAvailable: true,
      scheduleAvailable: false,
      scheduleFailed: false,
      scheduleIncomplete: false,
    });

  await expect(
    loadTransferJourneyOptions({
      originStops: [
        { id: "100", distanceMeters: 20 },
        { id: "101", distanceMeters: 30 },
      ],
      allStops: [],
      destination,
      positionAccuracy: 10,
    })
  ).resolves.toEqual([]);
  expect(api.fetchTripStopTimes).not.toHaveBeenCalled();
});

test("skips failed first-leg and second-leg topology lookups instead of inventing a transfer", async () => {
  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "first") throw new Error("first topology missing");
    return [];
  });

  await expect(
    loadTransferJourneyOptions({
      originStops: [{ id: "100", distanceMeters: 20 }],
      allStops: [{ id: "500", name: "Hub" }],
      destination,
      positionAccuracy: 10,
    })
  ).resolves.toEqual([]);

  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "first") {
      return [time("100", 1, "10:00:00"), time("500", 2, "10:10:00")];
    }
    throw new Error("second topology missing");
  });

  await expect(
    loadTransferJourneyOptions({
      originStops: [{ id: "100", distanceMeters: 20 }],
      allStops: [{ id: "500", name: "Hub" }],
      destination,
      positionAccuracy: 10,
    })
  ).resolves.toEqual([]);
});

test("carries external-place final walking into one-transfer door arrival", async () => {
  const external = {
    ...destination,
    id: "external:nominatim:node:1",
    kind: "external-place",
    label: "Museum",
    finalWalkDistanceByStop: { "900": 210 },
  };

  const options = await loadTransferJourneyOptions({
    originStops: [
      {
        id: "100",
        name: "Origin",
        distanceMeters: 50,
        lat: 60.45,
        lon: 22.26,
      },
    ],
    allStops: [
      { id: "100", name: "Origin", lat: 60.45, lon: 22.26 },
      { id: "500", name: "Hub", lat: 60.46, lon: 22.27 },
      { id: "900", name: "Destination", lat: 60.47, lon: 22.28 },
    ],
    destination: external,
    positionAccuracy: 10,
  });

  expect(options).toHaveLength(1);
  expect(options[0].finalWalkDistanceM).toBe(210);
  expect(options[0].finalWalkSecEstimate).toBeGreaterThan(0);
  expect(options[0].journeyArrivalAt).toBeGreaterThan(
    options[0].destinationArrivalAt
  );
  expect(options[0].totalWalkingDistanceM).toBeGreaterThan(250);
});

test("hook stays idle while disabled and does not touch the network", () => {
  const { result } = renderHook(() =>
    useTransferJourneyOptions({
      enabled: false,
      originStops: [{ id: "100", distanceMeters: 20 }],
      allStops: [],
      destination,
      positionAccuracy: 10,
    })
  );

  expect(result.current).toEqual({ options: [], state: "idle" });
  expect(api.fetchStopMonitor).not.toHaveBeenCalled();
});

test("hook publishes ready options and schedules a bounded refresh", async () => {
  const timeoutSpy = vi.spyOn(window, "setTimeout");
  const { result, unmount } = renderHook(() =>
    useTransferJourneyOptions({
      enabled: true,
      originStops: [{ id: "100", distanceMeters: 20 }],
      allStops: [
        { id: "100", name: "Origin", lat: 60.45, lon: 22.26 },
        { id: "500", name: "Hub", lat: 60.46, lon: 22.27 },
        { id: "900", name: "Destination", lat: 60.47, lon: 22.28 },
      ],
      destination,
      positionAccuracy: 10,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.options).toHaveLength(1);
  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

  unmount();
  timeoutSpy.mockRestore();
});

test("hook exposes a provider error and clears stale transfer options", async () => {
  api.fetchStopMonitor.mockRejectedValue(new Error("down"));

  const { result } = renderHook(() =>
    useTransferJourneyOptions({
      enabled: true,
      originStops: [{ id: "100", distanceMeters: 20 }],
      allStops: [],
      destination,
      positionAccuracy: 10,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.options).toEqual([]);

  api.fetchStopMonitor.mockImplementation(() => {
    throw new TypeError("synchronous failure");
  });

  // A new signature starts a fresh request; any unexpected provider exception
  // still fails closed instead of retaining an old recommendation.
  const { result: failed } = renderHook(() =>
    useTransferJourneyOptions({
      enabled: true,
      originStops: [{ id: "101", distanceMeters: 20 }],
      allStops: [],
      destination,
      positionAccuracy: 10,
    })
  );
  await waitFor(() => expect(failed.current.state).toBe("error"));
  expect(failed.current.options).toEqual([]);
});
