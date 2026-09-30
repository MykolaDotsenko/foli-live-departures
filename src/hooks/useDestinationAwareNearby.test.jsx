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
      "100": [arrival("t-good", 1_600)],
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
