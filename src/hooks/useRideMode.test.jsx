import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStopMonitor: vi.fn(() => new Promise(() => {})),
  fetchTripShape: vi.fn(() =>
    Promise.resolve([
      { lat: 60.4518, lon: 22.2666, traveled: 0 },
      { lat: 60.4488, lon: 22.255, traveled: 1100 },
    ])
  ),
  runRideTestAlert: vi.fn(() => Promise.resolve()),
  stopRideAlerts: vi.fn(),
  requestRideNotificationPermission: vi.fn(() => Promise.resolve(false)),
  announceRideStage: vi.fn(),
  repeatNowRideSignal: vi.fn(),
  primeRideVoices: vi.fn(() => true),
  unlockRideAudio: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: mocks.fetchStopMonitor,
  fetchTripShape: mocks.fetchTripShape,
}));

vi.mock("../utils/rideAlerts", () => ({
  announceRideStage: mocks.announceRideStage,
  repeatNowRideSignal: mocks.repeatNowRideSignal,
  requestRideNotificationPermission: mocks.requestRideNotificationPermission,
  runRideTestAlert: mocks.runRideTestAlert,
  stopRideAlerts: mocks.stopRideAlerts,
  primeRideVoices: mocks.primeRideVoices,
  unlockRideAudio: mocks.unlockRideAudio,
}));

import useRideMode from "./useRideMode";
import RideMode from "../components/RideMode";

const rideConfig = {
  lineRef: "1",
  destination: "Satama",
  tripRef: "trip-1",
  routeType: 3,
  shapeId: "shape-1",
  datedVehicleJourneyRef: "journey-1",
  vehicleRef: "bus-1",
  originAimedDepartureTime: 1000,
  boardingStop: {
    id: "164",
    name: "Kauppatori",
    shapeDistTraveled: 0,
  },
  targetStop: {
    id: "32",
    name: "Puistokatu",
    lat: 60.4488,
    lon: 22.255,
    shapeDistTraveled: 1100,
  },
  previousStop: { id: "164", name: "Kauppatori" },
  nextStop: { id: "4", name: "Turun linna" },
  plan: {
    boardingStop: {
      id: "164",
      name: "Kauppatori",
      shapeDistTraveled: 0,
    },
    targetStop: {
      id: "32",
      name: "Puistokatu",
      shapeDistTraveled: 1100,
    },
    targetPredictedEpochSec: Math.floor(Date.now() / 1000) + 500,
    stopsToTarget: [
      {
        id: "32",
        name: "Puistokatu",
        predictedEpochSec: Math.floor(Date.now() / 1000) + 500,
      },
    ],
  },
  options: {
    locationBackup: true,
    notifications: false,
  },
};

let watchPosition;
let clearWatch;
let originalGeolocation;

beforeEach(() => {
  localStorage.clear();
  mocks.fetchStopMonitor.mockClear();
  mocks.fetchTripShape.mockClear();
  mocks.runRideTestAlert.mockClear();
  mocks.stopRideAlerts.mockClear();

  originalGeolocation = navigator.geolocation;
  watchPosition = vi.fn((success) => {
    success({
      coords: {
        latitude: 61.1234,
        longitude: 23.5678,
        accuracy: 15,
      },
    });
    return 77;
  });
  clearWatch = vi.fn();

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition,
      clearWatch,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.useRealTimers();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: originalGeolocation,
  });
  localStorage.clear();
});

test("persists the ride but never persists the device GPS sample", async () => {
  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide(rideConfig);
  });

  await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));

  const stored = localStorage.getItem("foli-active-ride-v1");
  expect(stored).toContain('"tripRef":"trip-1"');
  expect(stored).not.toContain("61.1234");
  expect(stored).not.toContain("23.5678");

  act(() => {
    result.current.endRide();
  });

  expect(clearWatch).toHaveBeenCalledWith(77);
  expect(localStorage.getItem("foli-active-ride-v1")).toBeNull();
  unmount();
});

test("restores a non-expired active ride", () => {
  const stored = {
    id: "ride-restored",
    ...rideConfig,
    options: { locationBackup: false, notifications: false },
    stage: "next",
    stageReason: "schedule-fallback",
    stageConfidence: "schedule",
    startedAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60_000,
  };

  localStorage.setItem("foli-active-ride-v1", JSON.stringify(stored));

  const { result } = renderHook(() => useRideMode());

  expect(result.current.session?.id).toBe("ride-restored");
  expect(result.current.session?.stage).toBe("next");
});

// What another tab does to the stored ride, as this tab hears of it.
function otherTabWrites(value) {
  if (value === null) {
    localStorage.removeItem("foli-active-ride-v1");
  } else {
    localStorage.setItem("foli-active-ride-v1", value);
  }
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-active-ride-v1",
        newValue: value,
      })
    );
  });
}

// Turned off in one tab, the ride kept alerting in the other, which then
// wrote its copy back: the next reload brought the ended ride back.
test("a ride turned off in another tab ends here too and stays off", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  const { result } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide(rideConfig);
  });
  mocks.stopRideAlerts.mockClear();

  otherTabWrites(null);

  expect(result.current.session).toBeNull();
  expect(mocks.stopRideAlerts).toHaveBeenCalled();
  expect(clearWatch).toHaveBeenCalledWith(77);

  // Later clock ticks have no ride left to write back.
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(localStorage.getItem("foli-active-ride-v1")).toBeNull();
});

test("a ride started in another tab replaces this tab's ride without a write back", () => {
  const { result } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide(rideConfig);
  });
  const oldId = result.current.session.id;

  const replacement = JSON.stringify({
    id: "ride-other-tab",
    ...rideConfig,
    stage: "boarded",
    stageReason: "tracking",
    stageConfidence: "live",
    startedAt: Date.now() - 1_000,
    stageChangedAt: Date.now() - 1_000,
    expiresAt: Date.now() + 60_000,
  });
  otherTabWrites(replacement);

  expect(result.current.session?.id).toBe("ride-other-tab");
  expect(result.current.session?.id).not.toBe(oldId);
  expect(localStorage.getItem("foli-active-ride-v1")).toBe(replacement);
});

// Every open tab took up a ride started in any of them, so each polled,
// watched the location, held the screen on and said "Get off now" itself.
test("a ride started in another tab is left to that tab when this one has none", async () => {
  const idle = renderHook(() => useRideMode());
  const riding = renderHook(() => useRideMode());
  act(() => {
    riding.result.current.startRide(rideConfig);
  });
  await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));
  const rideId = riding.result.current.session.id;

  // The starting tab's write, as the other tab hears of it.
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-active-ride-v1",
        newValue: localStorage.getItem("foli-active-ride-v1"),
      })
    );
  });

  expect(idle.result.current.session).toBeNull();
  expect(riding.result.current.session?.id).toBe(rideId);
  expect(watchPosition).toHaveBeenCalledTimes(1);

  // Turned off where it runs, it is gone for both, and the idle tab still
  // follows nothing.
  act(() => riding.result.current.endRide());
  otherTabWrites(null);
  expect(idle.result.current.session).toBeNull();
  idle.unmount();
  riding.unmount();
});

test("another tab's progress on the same ride leaves this tab's ride running", () => {
  const { result } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide(rideConfig);
  });
  const session = result.current.session;
  mocks.stopRideAlerts.mockClear();

  otherTabWrites(JSON.stringify({ ...session, stageChangedAt: Date.now() }));

  expect(result.current.session).toBe(session);
  expect(mocks.stopRideAlerts).not.toHaveBeenCalled();
});

test("drops a stored ride whose start time is in the future", () => {
  const now = Date.now();
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({
      id: "ride-future-clock",
      ...rideConfig,
      options: { locationBackup: false, notifications: false },
      stage: "next",
      stageReason: "schedule-fallback",
      stageConfidence: "schedule",
      startedAt: now + 60_000,
      expiresAt: now + 6 * 60 * 60 * 1000,
    })
  );

  const { result } = renderHook(() => useRideMode());

  expect(result.current.session).toBeNull();
  expect(localStorage.getItem("foli-active-ride-v1")).toBeNull();
});

test("drops a stored ride whose expiry exceeds the ride lifetime", () => {
  const now = Date.now();
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({
      id: "ride-corrupt-expiry",
      ...rideConfig,
      options: { locationBackup: false, notifications: false },
      stage: "next",
      stageReason: "schedule-fallback",
      stageConfidence: "schedule",
      startedAt: now - 60_000,
      expiresAt: now + 24 * 60 * 60 * 1000,
    })
  );

  const { result } = renderHook(() => useRideMode());

  expect(result.current.session).toBeNull();
  expect(localStorage.getItem("foli-active-ride-v1")).toBeNull();
});


test("map-matched GPS can advance Ride Mode to NEXT without SIRI proximity", async () => {
  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 88;
  });

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    // Four stops by the timetable: only the location can say "next".
    result.current.startRide({
      ...rideConfig,
      plan: {
        ...rideConfig.plan,
        stopsToTarget: ["41", "42", "43", "32"].map((id) => ({
          id,
          name: `Stop ${id}`,
          predictedEpochSec: Math.floor(Date.now() / 1000) + 500,
        })),
      },
    });
  });

  await waitFor(() => {
    expect(result.current.gps.shapeStatus).toBe("ready");
  });

  // Two fixes in a row, riding along the route.
  act(() => {
    deliverGps({
      coords: {
        latitude: 60.4493,
        longitude: 22.2569,
        accuracy: 18,
        speed: 8,
      },
    });
  });
  act(() => {
    deliverGps({
      coords: {
        latitude: 60.44925,
        longitude: 22.25674,
        accuracy: 18,
        speed: 8,
      },
    });
  });

  await waitFor(() => {
    expect(result.current.session?.stage).toBe("next");
  });

  expect(result.current.session?.stageReason).toBe("gps-route-distance");
  expect(result.current.gps.onRoute).toBe(true);
  expect(result.current.gps.routeDistanceM).toBeLessThan(600);
  expect(result.current.gps.routeDistanceM).toBeGreaterThan(0);

  act(() => {
    result.current.endRide();
  });
  expect(clearWatch).toHaveBeenCalledWith(88);
  unmount();
});

// Someone waiting at the boarding stop for a one-stop ride is already
// "400 m from the exit". Their location said "Your stop is next" there,
// and a step along the platform said "Press STOP now", twenty minutes
// before the bus came.
const METRES_PER_DEGREE_LON = 54_900;
const alongShortRoute = (metres) => ({
  latitude: 60.45,
  longitude: 22.25 + metres / METRES_PER_DEGREE_LON,
});

async function waitForShortRide(result, { departsInSec = 1200 } = {}) {
  mocks.fetchTripShape.mockResolvedValueOnce([
    { lat: 60.45, lon: 22.25, traveled: 0 },
    { lat: 60.45, lon: 22.25 + 549 / METRES_PER_DEGREE_LON, traveled: 549 },
    { lat: 60.45, lon: 22.25 + 1098 / METRES_PER_DEGREE_LON, traveled: 1098 },
  ]);
  const now = Math.floor(Date.now() / 1000);
  const boarding = {
    id: "164",
    name: "Kauppatori",
    lat: 60.45,
    lon: 22.25,
    shapeDistTraveled: 0,
    predictedEpochSec: now + departsInSec,
  };
  const target = {
    id: "32",
    name: "Puistokatu",
    ...(({ latitude, longitude }) => ({ lat: latitude, lon: longitude }))(
      alongShortRoute(400)
    ),
    shapeDistTraveled: 400,
    predictedEpochSec: now + departsInSec + 90,
  };
  act(() => {
    result.current.startRide({
      ...rideConfig,
      boardingStop: boarding,
      targetStop: target,
      previousStop: boarding,
      plan: {
        boardingStop: boarding,
        targetStop: target,
        previousStop: boarding,
        routeStops: [boarding, target],
        stopsToTarget: [target],
        targetPredictedEpochSec: target.predictedEpochSec,
      },
    });
  });
  await waitFor(() => {
    expect(result.current.gps.shapeStatus).toBe("ready");
  });
}

test("a rejected forward snap does not reset the accepted route-anchor clock", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 29, 7, 0, 0);
  vi.setSystemTime(startMs);

  mocks.fetchTripShape.mockResolvedValueOnce([
    { lat: 60.45, lon: 22.25, traveled: 0 },
    { lat: 60.45, lon: 22.27, traveled: 1100 },
    { lat: 60.4515, lon: 22.27, traveled: 1267 },
    { lat: 60.4515, lon: 22.25, traveled: 2367 },
  ]);

  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 188;
  });

  const nowSec = Math.floor(startMs / 1000);
  const boarding = {
    id: "164",
    name: "Board",
    lat: 60.45,
    lon: 22.25,
    shapeDistTraveled: 0,
    predictedEpochSec: nowSec - 60,
  };
  const target = {
    id: "32",
    name: "Target",
    lat: 60.4515,
    lon: 22.25,
    shapeDistTraveled: 2367,
    predictedEpochSec: nowSec + 900,
  };
  const previousStop = {
    id: "31",
    name: "Before",
    shapeDistTraveled: 1800,
    predictedEpochSec: nowSec + 780,
  };

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "loop-shape",
      boardingStop: boarding,
      targetStop: target,
      previousStop,
      plan: {
        boardingStop: boarding,
        targetStop: target,
        previousStop,
        targetPredictedEpochSec: target.predictedEpochSec,
        stopsToTarget: [
          { id: "a", predictedEpochSec: nowSec + 300 },
          { id: "b", predictedEpochSec: nowSec + 500 },
          { id: "31", predictedEpochSec: nowSec + 780 },
          target,
        ],
      },
    });
  });

  await waitFor(() => expect(result.current.gps.shapeStatus).toBe("ready"));

  const outboundFix = {
    latitude: 60.45,
    longitude: 22.254,
    accuracy: 15,
    speed: 8,
  };
  act(() => deliverGps({ coords: outboundFix }));
  act(() => deliverGps({ coords: outboundFix }));

  expect(result.current.session?.underway).toBe(true);
  expect(result.current.gps.alongRouteM).toBeLessThan(400);
  const acceptedAt = result.current.gps.alongRouteUpdatedAt;

  // Thirty seconds later the phone lands on a future parallel leg almost
  // two kilometres ahead. That jump is not physically plausible yet.
  vi.setSystemTime(startMs + 30_000);
  act(() => {
    deliverGps({
      coords: {
        latitude: 60.4515,
        longitude: 22.254,
        accuracy: 15,
        speed: 10,
      },
    });
  });

  expect(result.current.gps.onRoute).toBe(false);
  expect(result.current.gps.alongRouteM).toBeLessThan(400);
  expect(result.current.gps.alongRouteUpdatedAt).toBe(acceptedAt);

  // Fifteen seconds later it is plausible relative to the last accepted
  // anchor. A rejected sample must not shorten that elapsed-time window.
  vi.setSystemTime(startMs + 45_000);
  act(() => {
    deliverGps({
      coords: {
        latitude: 60.4515,
        longitude: 22.254,
        accuracy: 15,
        speed: 10,
      },
    });
  });

  expect(result.current.gps.onRoute).toBe(true);
  expect(result.current.gps.alongRouteM).toBeGreaterThan(1_800);
  expect(result.current.gps.alongRouteUpdatedAt).toBe(startMs + 45_000);

  act(() => result.current.endRide());
  expect(clearWatch).toHaveBeenCalledWith(188);
  unmount();
});

test("location says nothing while the passenger still waits at the boarding stop", async () => {
  mocks.announceRideStage.mockClear();
  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 89;
  });
  const { result, unmount } = renderHook(() => useRideMode());
  await waitForShortRide(result);

  const fix = (metres, extra) =>
    act(() => {
      deliverGps({ coords: { ...alongShortRoute(metres), accuracy: 15, ...extra } });
    });

  fix(0, { speed: 0 });
  fix(35, { speed: 0 });
  fix(50, { speed: 1.2 });
  fix(60, { speed: 1.4 });

  expect(result.current.gps.onRoute).toBe(true);
  expect(result.current.session?.stage).toBe("boarded");
  expect(result.current.session?.underway).not.toBe(true);
  expect(result.current.session?.previousLeft).not.toBe(true);
  expect(mocks.announceRideStage).not.toHaveBeenCalled();

  // The bus comes and carries them off: one alert, and it is the press.
  fix(80, { speed: 7 });
  expect(mocks.announceRideStage).not.toHaveBeenCalled();
  fix(95, { speed: 8 });

  expect(result.current.session?.underway).toBe(true);
  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.previousLeft).toBe(true);
  expect(mocks.announceRideStage).toHaveBeenCalledTimes(1);
  expect(mocks.announceRideStage).toHaveBeenLastCalledWith(
    "next",
    expect.objectContaining({ id: "32" }),
    false,
    3,
    expect.objectContaining({ previousLeft: true })
  );

  act(() => result.current.endRide());
  unmount();
});

test("one vague fix past the stop before does not say press STOP now", async () => {
  mocks.announceRideStage.mockClear();
  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 90;
  });
  const { result, unmount } = renderHook(() => useRideMode());
  await waitForShortRide(result);

  const fix = (metres, accuracy) =>
    act(() => {
      deliverGps({ coords: { ...alongShortRoute(metres), accuracy, speed: 6 } });
    });

  // 31 m past the stop, give or take 110 m: the bus may still be at it.
  fix(31, 110);
  fix(31, 110);
  expect(result.current.session?.previousLeft).not.toBe(true);
  // One good fix past it, then a poor one: not two in a row.
  fix(70, 10);
  fix(20, 110);
  expect(result.current.session?.previousLeft).not.toBe(true);
  expect(mocks.announceRideStage).not.toHaveBeenCalled();

  act(() => result.current.endRide());
  unmount();
});

test("falls back to the timetable once the live prediction has gone stale", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 21, 12, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve({
      serverTime: nowSec,
      arrivals:
        String(stopId) === "32"
          ? [
              {
                datedvehiclejourneyref: "journey-1",
                monitored: true,
                expectedarrivaltime: nowSec + 600,
                vehicleatstop: false,
                recordedattime: nowSec,
              },
            ]
          : [],
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      plan: {
        targetPredictedEpochSec: nowSec + 210,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: nowSec + 90 },
          { id: "12", name: "Two", predictedEpochSec: nowSec + 150 },
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 210 },
        ],
      },
    });
  });

  // Three stops out, so the timetable alone reaches SOON. The provider then
  // answers with ten minutes, which must not be overtaken by the timetable.
  await waitFor(() => expect(result.current.runtime.liveEtaSec).toBe(600));
  expect(result.current.session?.stage).toBe("soon");

  // The provider goes quiet. The frozen prediction must stop counting as a
  // live answer, letting the timetable take over.
  vi.setSystemTime(startMs + 121_000);
  const onPosition = watchPosition.mock.calls[0][0];

  act(() => {
    onPosition({
      coords: { latitude: 61.1234, longitude: 23.5678, accuracy: 15 },
    });
  });

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.stageReason).toBe("schedule-fallback");
  expect(result.current.session?.stageConfidence).toBe("schedule");

  act(() => {
    result.current.endRide();
  });
  unmount();
});

test("an early pass near the target cannot later fake a missed stop", async () => {
  // Fifteen minutes before the target, the route drives a block from it. That
  // old fix must neither announce arrival later nor arm the "gone past it"
  // latch, or the passenger is told to get off while still approaching.
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 21, 9, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 91;
  });

  let etaOffsetSec = 900;
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve({
      serverTime: Math.floor(Date.now() / 1000),
      arrivals:
        String(stopId) === "32"
          ? [
              {
                datedvehiclejourneyref: "journey-1",
                monitored: true,
                expectedarrivaltime:
                  Math.floor(Date.now() / 1000) + etaOffsetSec,
                vehicleatstop: false,
                recordedattime: Math.floor(Date.now() / 1000),
              },
            ]
          : [],
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      plan: {
        targetPredictedEpochSec: nowSec + 900,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: nowSec + 300 },
          { id: "12", name: "Two", predictedEpochSec: nowSec + 600 },
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 900 },
        ],
      },
    });
  });

  await waitFor(() => expect(deliverGps).not.toBeNull());
  await waitFor(() => expect(result.current.runtime.liveEtaSec).toBe(900));

  // The early pass, fifty metres from a stop that is still fifteen minutes out.
  act(() => {
    deliverGps({
      coords: { latitude: 60.4492, longitude: 22.2555, accuracy: 15 },
    });
  });
  expect(result.current.session?.stage).toBe("boarded");

  // Fifteen minutes later the provider puts the stop one minute away. The old
  // fix is far too stale to mean "you are at the stop".
  vi.setSystemTime(startMs + 15 * 60_000);
  etaOffsetSec = 60;
  act(() => {
    document.dispatchEvent(new globalThis.Event("visibilitychange"));
  });
  await waitFor(() => expect(result.current.session?.stage).toBe("next"));

  // A fresh sample from the real approach, still several hundred metres short.
  act(() => {
    deliverGps({
      coords: { latitude: 60.4455, longitude: 22.261, accuracy: 15 },
    });
  });

  expect(result.current.session?.stage).toBe("next");

  act(() => {
    result.current.endRide();
  });
  unmount();
});

test("the shown estimate falls back with the stage logic instead of freezing", async () => {
  // A failed poll leaves the previous prediction in runtime. Showing it as a
  // confident "~2 min" beside a badge that already reads "schedule" tells the
  // passenger two different things at once.
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 21, 11, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve({
      serverTime: nowSec,
      arrivals:
        String(stopId) === "32"
          ? [
              {
                datedvehiclejourneyref: "journey-1",
                monitored: true,
                expectedarrivaltime: nowSec + 120,
                vehicleatstop: false,
                recordedattime: nowSec,
              },
            ]
          : [],
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: nowSec + 1_800,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: nowSec + 900 },
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 1_800 },
        ],
      },
    });
  });

  await waitFor(() => expect(result.current.runtime.etaSec).toBe(120));

  // The provider goes quiet for five minutes.
  vi.setSystemTime(startMs + 5 * 60_000);
  mocks.fetchStopMonitor.mockImplementation(() =>
    Promise.reject(new Error("provider unavailable"))
  );
  act(() => {
    document.dispatchEvent(new globalThis.Event("visibilitychange"));
  });

  await waitFor(() => {
    expect(result.current.runtime.trackingHealth).not.toBe("live");
  });

  // The frozen 120 seconds must not still be on show.
  expect(result.current.runtime.etaSec).not.toBe(120);

  act(() => {
    result.current.endRide();
  });
  unmount();
});

test("a timetable-only listing at the target never reads as live tracking", async () => {
  // The feed still lists the journey but is not tracking it, so the time on
  // the row is the raw timetable: one minute out. The plan, anchored to the
  // real departure, has the bus five stops and eight minutes away. Reading
  // that row as live showed "Following your bus" and "Press STOP now".
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 21, 13, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve({
      serverTime: nowSec,
      realtimeAvailable: true,
      arrivals:
        String(stopId) === "32"
          ? [
              {
                datedvehiclejourneyref: "journey-1",
                tripref: "trip-1",
                lineref: "1",
                monitored: false,
                vehicleatstop: false,
                aimedarrivaltime: nowSec + 60,
                aimeddeparturetime: nowSec + 60,
              },
            ]
          : [],
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: nowSec + 500,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: nowSec + 100 },
          { id: "12", name: "Two", predictedEpochSec: nowSec + 200 },
          { id: "13", name: "Three", predictedEpochSec: nowSec + 300 },
          { id: "14", name: "Four", predictedEpochSec: nowSec + 400 },
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 500 },
        ],
      },
    });
  });

  await waitFor(() => expect(result.current.runtime.lastPollAt).not.toBeNull());

  expect(result.current.runtime.trackingHealth).toBe("schedule");
  expect(result.current.runtime.targetMatchBy).toBe("");
  expect(result.current.runtime.etaSec).toBe(500);
  expect(result.current.session?.stage).toBe("boarded");

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("the get-off alarm stops once the bus has left, even if the stop then reports no data", async () => {
  // Once the bus leaves the exit stop, a stop with nothing else coming is
  // answered with NO_SIRI_DATA. The alarm must still see the bus as gone.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 21, 14, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.repeatNowRideSignal.mockClear();

  let exitStopAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    if (String(stopId) !== "32") {
      return Promise.resolve({ serverTime: nowSec, arrivals: [] });
    }
    exitStopAnswers += 1;
    return Promise.resolve(
      exitStopAnswers === 1
        ? {
            serverTime: nowSec,
            arrivals: [
              {
                datedvehiclejourneyref: "journey-1",
                monitored: true,
                vehicleatstop: true,
                recordedattime: nowSec,
                expectedarrivaltime: nowSec,
              },
            ],
          }
        : { serverTime: nowSec, realtimeAvailable: false, arrivals: [] }
    );
  });

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: nowSec + 60,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 60 },
        ],
      },
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.session?.stage).toBe("now");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(mocks.repeatNowRideSignal).toHaveBeenCalled();

  // Two polls without the bus: it has left the stop.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40_000);
  });
  expect(result.current.runtime.targetMissingCount).toBeGreaterThanOrEqual(2);

  const repeatsSoFar = mocks.repeatNowRideSignal.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(mocks.repeatNowRideSignal).toHaveBeenCalledTimes(repeatsSoFar);

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("a bus position from before the stop went quiet cannot raise the get-off alarm", async () => {
  // A loop brings the bus within 45 m of the exit stop four minutes before it
  // serves it; then the stop stops reporting. That position must not be kept
  // as current, or the timetable's NEXT turns it into "Get off now".
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 21, 15, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  let exitStopAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    if (String(stopId) !== "32") {
      return Promise.resolve({ serverTime: nowSec, arrivals: [] });
    }
    exitStopAnswers += 1;
    return Promise.resolve(
      exitStopAnswers === 1
        ? {
            serverTime: nowSec,
            arrivals: [
              {
                datedvehiclejourneyref: "journey-1",
                monitored: true,
                vehicleatstop: false,
                recordedattime: nowSec,
                latitude: 60.4492,
                longitude: 22.255,
                expectedarrivaltime: nowSec + 240,
              },
            ],
          }
        : { serverTime: nowSec, realtimeAvailable: false, arrivals: [] }
    );
  });

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: nowSec + 240,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 240 },
        ],
      },
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.session?.stage).toBe("soon");

  // Long enough for the old live answer to age out of the stage logic.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(140_000);
  });

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.stageReason).not.toBe("provider-near-target");

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("an outage at the stop before yours cannot fake the bus passing it", async () => {
  // The stop before the exit loses its feed while the exit stop still tracks
  // the bus six minutes out. Counting those empty answers as the bus leaving
  // raised "Press STOP now" before the bus had even reached that stop.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 21, 16, 0, 0);
  vi.setSystemTime(startMs);
  const startSec = Math.floor(startMs / 1000);

  let previousAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    const serverTime = Math.floor(Date.now() / 1000);
    const live = {
      datedvehiclejourneyref: "journey-1",
      monitored: true,
      vehicleatstop: false,
      recordedattime: serverTime,
    };
    if (String(stopId) === "32") {
      return Promise.resolve({
        serverTime,
        arrivals: [{ ...live, expectedarrivaltime: startSec + 420 }],
      });
    }
    previousAnswers += 1;
    return Promise.resolve(
      previousAnswers === 1
        ? {
            serverTime,
            arrivals: [{ ...live, expectedarrivaltime: startSec + 300 }],
          }
        : { serverTime, realtimeAvailable: false, arrivals: [] }
    );
  });

  const { result, unmount } = renderHook(() => useRideMode());

  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: startSec + 420,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: startSec + 120 },
          { id: "12", name: "Two", predictedEpochSec: startSec + 200 },
          { id: "164", name: "Kauppatori", predictedEpochSec: startSec + 300 },
          { id: "32", name: "Puistokatu", predictedEpochSec: startSec + 420 },
        ],
      },
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.runtime.previousSeen).toBe(true);

  // Two polls where the stop before yours has no data at all.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40_000);
  });

  expect(result.current.runtime.previousMissingCount).toBe(0);
  expect(result.current.session?.stage).toBe("boarded");
  expect(result.current.session?.stageReason).not.toBe("previous-stop-passed");

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

function liveExitRow(serverTime, overrides = {}) {
  return {
    datedvehiclejourneyref: "journey-1",
    monitored: true,
    vehicleatstop: false,
    recordedattime: serverTime,
    ...overrides,
  };
}

// Answers the exit stop once with `first`, then as `after` says. The stop
// before it lists nothing, so it never counts as a sighting.
function exitStopAnswersOnce(first, after) {
  let exitStopAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    const serverTime = Math.floor(Date.now() / 1000);
    if (String(stopId) !== "32") {
      return Promise.resolve({ serverTime, arrivals: [] });
    }
    exitStopAnswers += 1;
    return exitStopAnswers === 1 ? Promise.resolve(first) : after(serverTime);
  });
}

const offline = () => Promise.reject(new Error("network unavailable"));

function startTimedRide(result, nowSec, stopOffsets) {
  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        targetPredictedEpochSec: nowSec + stopOffsets[stopOffsets.length - 1],
        stopsToTarget: stopOffsets.map((offset, index) => ({
          id: index === stopOffsets.length - 1 ? "32" : String(11 + index),
          name: index === stopOffsets.length - 1 ? "Puistokatu" : `Stop ${index}`,
          predictedEpochSec: nowSec + offset,
        })),
      },
    });
  });
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

test("a failed poll cannot keep an old bus position fresh enough to say get off now", async () => {
  // The loop's outbound leg passes 44 m from the exit stop minutes before
  // the bus serves it. Every poll after that one fails, and the position
  // used to be carried forward with the age it had when it arrived, so the
  // timetable reaching NEXT turned it into "Get off now".
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 8, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        liveExitRow(nowSec, {
          latitude: 60.4492,
          longitude: 22.255,
          expectedarrivaltime: nowSec + 480,
        }),
      ],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [150, 330, 480]);
  await advance(0);
  expect(result.current.session?.stage).toBe("boarded");

  await advance(400_000);

  expect(result.current.session?.stage).toBe("next");
  expect(mocks.announceRideStage.mock.calls.map(([stage]) => stage)).not.toContain(
    "now"
  );

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("the live estimate keeps counting down while polls fail", async () => {
  // A hundred seconds out, then silence. Frozen at 100, "Press STOP" came
  // after the bus was due at the stop.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 9, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [liveExitRow(nowSec, { expectedarrivaltime: nowSec + 100 })],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [150, 300, 450, 600]);
  await advance(0);
  expect(result.current.session?.stage).toBe("soon");

  await advance(20_000);

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.stageReason).toBe("live-eta");
  expect(result.current.runtime.etaSec).toBeLessThanOrEqual(80);

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("an exit stop that keeps failing cannot freeze the estimate while the stop before answers", async () => {
  // Sightings at the stop before kept the ride's "last live" time fresh, so
  // the exit stop's last estimate counted as live for as long as they came.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 10, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  let exitStopAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    const serverTime = Math.floor(Date.now() / 1000);
    if (String(stopId) !== "32") {
      return Promise.resolve({
        serverTime,
        arrivals: [liveExitRow(serverTime, { expectedarrivaltime: nowSec + 450 })],
      });
    }
    exitStopAnswers += 1;
    return exitStopAnswers === 1
      ? Promise.resolve({
          serverTime,
          arrivals: [liveExitRow(serverTime, { expectedarrivaltime: nowSec + 600 })],
        })
      : offline();
  });

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [150, 300, 450, 600]);
  await advance(0);
  expect(result.current.runtime.etaSec).toBe(600);

  await advance(200_000);
  // Past the point where the exit stop's estimate still counts: the panel
  // shows the timetable's, not a frozen 600.
  expect(result.current.runtime.etaSec).toBe(400);

  await advance(320_000);
  expect(result.current.session?.stage).toBe("next");

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("a get-off alarm raised by the bus's position stops once the bus has gone", async () => {
  // Polled every 20 s, a bus that dwells 15 s is never seen standing at the
  // stop, and only a bus seen standing there could end the alarm.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 11, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.repeatNowRideSignal.mockClear();
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        liveExitRow(nowSec, {
          latitude: 60.4489,
          longitude: 22.2552,
          expectedarrivaltime: nowSec + 40,
        }),
      ],
    },
    (serverTime) => Promise.resolve({ serverTime, arrivals: [] })
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [60]);
  await advance(0);
  expect(result.current.session?.stage).toBe("now");
  expect(result.current.session?.stageReason).toBe("provider-near-target");

  await advance(60_000);
  const repeatsSoFar = mocks.repeatNowRideSignal.mock.calls.length;
  expect(repeatsSoFar).toBeGreaterThan(0);

  await advance(60_000);
  expect(mocks.repeatNowRideSignal).toHaveBeenCalledTimes(repeatsSoFar);

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("a reload during the get-off alarm still lets it stop once the bus has gone", async () => {
  // The reloaded page starts with no sighting of the bus, and the count of
  // answers without it only ever started after one.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 12, 0, 0);
  vi.setSystemTime(startMs);
  mocks.repeatNowRideSignal.mockClear();
  mocks.fetchStopMonitor.mockImplementation(() =>
    Promise.resolve({ serverTime: Math.floor(Date.now() / 1000), arrivals: [] })
  );
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({
      id: "ride-reloaded",
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      stage: "now",
      stageReason: "target-at-stop",
      stageConfidence: "live",
      startedAt: startMs - 600_000,
      stageChangedAt: startMs - 5_000,
      expiresAt: startMs + 3_600_000,
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());
  expect(result.current.session?.stage).toBe("now");

  await advance(60_000);
  const repeatsSoFar = mocks.repeatNowRideSignal.mock.calls.length;
  expect(repeatsSoFar).toBeGreaterThan(0);

  await advance(60_000);
  expect(mocks.repeatNowRideSignal).toHaveBeenCalledTimes(repeatsSoFar);

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("the get-off alarm gives up after three minutes with no news at all", async () => {
  // With the network gone nothing can say the bus has left, and a phone in a
  // pocket repeated "get off now" until the ride expired hours later.
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 13, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.repeatNowRideSignal.mockClear();
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        liveExitRow(nowSec, { vehicleatstop: true, expectedarrivaltime: nowSec }),
      ],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [30]);
  await advance(0);
  expect(result.current.session?.stage).toBe("now");

  await advance(170_000);
  expect(mocks.repeatNowRideSignal).toHaveBeenCalled();

  await advance(20_000);
  const repeatsSoFar = mocks.repeatNowRideSignal.mock.calls.length;
  await advance(120_000);
  expect(mocks.repeatNowRideSignal).toHaveBeenCalledTimes(repeatsSoFar);
  // The ride itself stays open, for the recovery actions.
  expect(result.current.session?.stage).toBe("now");

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

// A straight street through the exit stop at 1100 m and on beyond it, so a
// phone can be placed a given way past the stop along the route.
const throughTheStop = [
  { lat: 60.4518, lon: 22.2666, traveled: 0 },
  { lat: 60.4488, lon: 22.255, traveled: 1100 },
  { lat: 60.4458, lon: 22.2434, traveled: 2200 },
];

function pastTheStop(fraction) {
  return {
    latitude: 60.4488 - 0.003 * fraction,
    longitude: 22.255 - 0.0116 * fraction,
    accuracy: 10,
  };
}

async function rideToGetOffNow() {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 14, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();
  mocks.fetchTripShape.mockResolvedValueOnce(throughTheStop);
  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 93;
  });
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        liveExitRow(nowSec, { vehicleatstop: true, expectedarrivaltime: nowSec }),
      ],
    },
    (serverTime) => Promise.resolve({ serverTime, arrivals: [] })
  );

  const hook = renderHook(() => useRideMode());
  act(() => {
    hook.result.current.startRide({
      ...rideConfig,
      options: { locationBackup: true, notifications: false },
      plan: {
        ...rideConfig.plan,
        targetPredictedEpochSec: nowSec + 30,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 30 },
        ],
      },
    });
  });
  await advance(0);
  expect(hook.result.current.gps.shapeStatus).toBe("ready");
  expect(hook.result.current.session?.stage).toBe("now");

  return {
    ...hook,
    startMs,
    deliver: (coords) =>
      act(() => {
        deliverGps({ coords });
      }),
  };
}

test("walking on down the street after getting off is not a missed stop", async () => {
  const { result, unmount, startMs, deliver } = await rideToGetOffNow();

  deliver({ ...pastTheStop(0), speed: 0 });
  vi.setSystemTime(startMs + 160_000);
  deliver({ ...pastTheStop(0.2), speed: 1.3 });

  expect(result.current.gps.passedTarget).toBe(true);
  expect(result.current.session?.stage).toBe("now");
  expect(mocks.announceRideStage.mock.calls.map(([stage]) => stage)).not.toContain(
    "missed"
  );

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("a phone that reports no speed still catches a ride past the stop", async () => {
  // Browsers send a speed they do not have as null, which used to become
  // 0 m/s: standing still, however fast the bus was carrying them on.
  const { result, unmount, startMs, deliver } = await rideToGetOffNow();

  vi.setSystemTime(startMs + 60_000);
  deliver({ ...pastTheStop(0.2), speed: null });

  expect(result.current.gps.speedMps).toBeNull();
  expect(result.current.session?.stage).toBe("missed");

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

// Offline, the badge goes back to the timetable at once. "Your bus is
// confirmed" stayed beside it for up to 45 seconds, over the banner that
// said live tracking had been lost.
test("an offline phone never calls the bus confirmed", async () => {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 22, 10, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [liveExitRow(nowSec, { expectedarrivaltime: nowSec + 400 })],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [150, 300, 450]);
  await advance(0);
  expect(result.current.runtime.trackingHealth).toBe("live");
  expect(result.current.runtime.targetLive).toBe(true);

  const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    await advance(10_000);

    expect(result.current.runtime.trackingHealth).toBe("schedule");
    expect(result.current.runtime.targetLive).toBe(false);
  } finally {
    onLine.mockRestore();
    act(() => result.current.endRide());
    unmount();
    mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
  }
});

// A tab reloaded two stops before the exit, with the bus six minutes behind
// the timetable. The timetable alone said "Press STOP" within a second, the
// live answer three seconds later said five minutes, and a stage is never
// taken back.
test("a reloaded ride waits for live data before the timetable can say press STOP", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 23, 7, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();

  let answerTarget;
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    String(stopId) === "32"
      ? new Promise((resolve) => {
          answerTarget = resolve;
        })
      : Promise.resolve({ serverTime: nowSec, arrivals: [] })
  );
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({
      id: "ride-reloaded-early",
      ...rideConfig,
      shapeId: "",
      plan: {
        targetPredictedEpochSec: nowSec + 60,
        stopsToTarget: [{ id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 60 }],
      },
      stage: "soon",
      stageReason: "planned-stop-count",
      stageConfidence: "schedule",
      startedAt: startMs - 600_000,
      stageChangedAt: startMs - 60_000,
      expiresAt: startMs + 3_600_000,
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());
  // The location fix arrives at once; the exit stop has not answered.
  expect(result.current.session?.stage).toBe("soon");

  await act(async () => {
    answerTarget({
      serverTime: nowSec,
      arrivals: [
        {
          datedvehiclejourneyref: "journey-1",
          monitored: true,
          expectedarrivaltime: nowSec + 300,
          vehicleatstop: false,
          recordedattime: nowSec,
        },
      ],
    });
  });

  await waitFor(() => expect(result.current.runtime.liveEtaSec).toBe(300));
  expect(result.current.session?.stage).toBe("soon");
  expect(mocks.announceRideStage.mock.calls.map(([stage]) => stage)).not.toContain(
    "next"
  );

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

test("a ride nobody ended is not brought back hours after its stop", () => {
  mocks.announceRideStage.mockClear();
  const nowSec = Math.floor(Date.now() / 1000);
  localStorage.setItem(
    "foli-active-ride-v1",
    JSON.stringify({
      id: "ride-forgotten",
      ...rideConfig,
      plan: { ...rideConfig.plan, targetPredictedEpochSec: nowSec - 4 * 3600 },
      stage: "next",
      stageReason: "planned-stop-count",
      stageConfidence: "schedule",
      startedAt: Date.now() - 4.5 * 3600_000,
      expiresAt: Date.now() + 1.5 * 3600_000,
    })
  );

  const { result } = renderHook(() => useRideMode());

  expect(result.current.session).toBeNull();
  // Not this tab's to delete inside its lifetime: another tab may still be
  // running it (below). It expires with that lifetime.
  expect(localStorage.getItem("foli-active-ride-v1")).not.toBeNull();
  expect(mocks.announceRideStage).not.toHaveBeenCalled();
});

// A very late bus: the tab running the ride still has it coming, live, well
// past the planned exit. A second tab opened then read the record as long
// over and deleted it, and the first tab, hearing the ride had gone, ended it.
test("opening a second tab does not end a very late ride running in the first", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 23, 9, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  const first = renderHook(() => useRideMode());
  act(() => {
    first.result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        ...rideConfig.plan,
        targetPredictedEpochSec: nowSec + 500,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 500 },
        ],
      },
    });
  });
  const rideId = first.result.current.session.id;
  const stored = localStorage.getItem("foli-active-ride-v1");

  // An hour on, past the planned exit by more than 45 minutes.
  vi.setSystemTime(startMs + 60 * 60 * 1000);
  const second = renderHook(() => useRideMode());

  expect(second.result.current.session).toBeNull();
  expect(localStorage.getItem("foli-active-ride-v1")).toBe(stored);
  // Whatever the second tab did to storage, the first tab hears of it.
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-active-ride-v1",
        newValue: localStorage.getItem("foli-active-ride-v1"),
      })
    );
  });
  expect(first.result.current.session?.id).toBe(rideId);

  second.unmount();
  act(() => first.result.current.endRide());
  first.unmount();
});

test("a ride long past its stop ends quietly while nothing live says the bus is coming", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 23, 9, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));

  const { result, unmount } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      plan: {
        targetPredictedEpochSec: nowSec + 1200,
        stopsToTarget: [
          { id: "11", name: "One", predictedEpochSec: nowSec + 400 },
          { id: "12", name: "Two", predictedEpochSec: nowSec + 800 },
          { id: "13", name: "Three", predictedEpochSec: nowSec + 1000 },
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 1200 },
        ],
      },
    });
  });
  expect(result.current.session?.stage).toBe("boarded");

  vi.setSystemTime(startMs + (1200 + 46 * 60) * 1000);
  act(() => {
    watchPosition.mock.calls.at(-1)[0]({
      coords: { latitude: 61.1234, longitude: 23.5678, accuracy: 15 },
    });
  });

  expect(result.current.session).toBeNull();
  expect(mocks.announceRideStage).not.toHaveBeenCalled();
  unmount();
});

// STOP asks for the next stop. Said while the bus had yet to leave the stop
// before the exit, "Press STOP now" stopped it there, and the request was
// spent. NEXT names that stop first, and "press now" comes as its own alert
// once the bus is seen leaving it.
test("says press STOP now only once the bus is seen leaving the stop before", async () => {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 21, 16, 0, 0);
  vi.setSystemTime(startMs);
  const startSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();

  let previousAnswers = 0;
  mocks.fetchStopMonitor.mockImplementation((stopId) => {
    const serverTime = Math.floor(Date.now() / 1000);
    const bus = liveExitRow(serverTime);
    if (String(stopId) === "32") {
      return Promise.resolve({
        serverTime,
        arrivals: [{ ...bus, expectedarrivaltime: startSec + 85 }],
      });
    }
    previousAnswers += 1;
    return Promise.resolve({
      serverTime,
      arrivals:
        previousAnswers === 1
          ? [{ ...bus, expectedarrivaltime: startSec + 20 }]
          : [],
    });
  });

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, startSec, [85]);
  await advance(0);

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.previousLeft).toBe(false);
  expect(mocks.announceRideStage).toHaveBeenLastCalledWith(
    "next",
    expect.objectContaining({ id: "32" }),
    false,
    3,
    expect.objectContaining({ previousLeft: false })
  );

  // Two answers from the stop before without the bus: it has left.
  await advance(40_000);

  expect(result.current.session?.previousLeft).toBe(true);
  expect(mocks.announceRideStage).toHaveBeenCalledTimes(2);
  expect(mocks.announceRideStage).toHaveBeenLastCalledWith(
    "next",
    expect.objectContaining({ id: "32" }),
    false,
    3,
    expect.objectContaining({ previousLeft: true })
  );

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

// A one-stop ride set up twenty minutes early counted its one stop as next,
// and announced "Press STOP" before the bus had come.
test("the timetable raises nothing before the bus is due to leave the boarding stop", async () => {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 21, 16, 0, 0);
  vi.setSystemTime(startMs);
  const startSec = Math.floor(startMs / 1000);
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));

  const { result, unmount } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      options: { locationBackup: false, notifications: false },
      plan: {
        boardingStop: { id: "164", name: "Kauppatori", predictedEpochSec: startSec + 1200 },
        targetPredictedEpochSec: startSec + 1290,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: startSec + 1290 },
        ],
      },
    });
  });
  await advance(30_000);

  expect(result.current.session?.stage).toBe("boarded");

  // Once the timetable has it leaving, the count counts.
  vi.setSystemTime(startMs + 1_210_000);
  await advance(10_000);
  expect(result.current.session?.stage).toBe("next");

  act(() => {
    result.current.endRide();
  });
  unmount();
});

// Two fixes 300 m wide, one near the stop and one away from it, ended a
// ride that was still a minute from its stop as "your stop is behind you".
test("vague fixes cannot end a ride as missed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const startMs = Date.UTC(2026, 8, 21, 9, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);

  let deliverGps = null;
  watchPosition.mockImplementation((success) => {
    deliverGps = success;
    return 92;
  });
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve({
      serverTime: Math.floor(Date.now() / 1000),
      arrivals:
        String(stopId) === "32"
          ? [
              liveExitRow(Math.floor(Date.now() / 1000), {
                expectedarrivaltime: Math.floor(Date.now() / 1000) + 80,
              }),
            ]
          : [],
    })
  );

  const { result, unmount } = renderHook(() => useRideMode());
  act(() => {
    result.current.startRide({
      ...rideConfig,
      shapeId: "",
      plan: {
        targetPredictedEpochSec: nowSec + 80,
        stopsToTarget: [
          { id: "32", name: "Puistokatu", predictedEpochSec: nowSec + 80 },
        ],
      },
    });
  });
  await waitFor(() => expect(deliverGps).not.toBeNull());
  await waitFor(() => expect(result.current.session?.stage).toBe("next"));

  // About 70 m from the stop, then about 300 m away, both ±300 m.
  act(() => {
    deliverGps({ coords: { latitude: 60.44945, longitude: 22.255, accuracy: 300 } });
  });
  act(() => {
    deliverGps({ coords: { latitude: 60.4515, longitude: 22.255, accuracy: 300 } });
  });
  expect(result.current.session?.stage).toBe("next");

  // The same two readings, precise, do mean the bus carried on.
  act(() => {
    deliverGps({ coords: { latitude: 60.44945, longitude: 22.255, accuracy: 20 } });
  });
  act(() => {
    deliverGps({ coords: { latitude: 60.4515, longitude: 22.255, accuracy: 20 } });
  });
  expect(result.current.session?.stage).toBe("missed");

  act(() => {
    result.current.endRide();
  });
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});


test("a provider coordinate without recorded time cannot say get off now", async () => {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 29, 11, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();

  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        {
          datedvehiclejourneyref: "journey-1",
          monitored: true,
          vehicleatstop: false,
          latitude: 60.4489,
          longitude: 22.2552,
          expectedarrivaltime: nowSec + 60,
          // Deliberately no recordedattime: the provider has not told us
          // when these vehicle coordinates were sampled.
        },
      ],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [60]);
  await advance(0);

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.stageReason).not.toBe("provider-near-target");
  expect(
    mocks.announceRideStage.mock.calls.map(([stage]) => stage)
  ).not.toContain("now");

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});


test("a stale vehicle-at-stop observation cannot say get off now", async () => {
  vi.useFakeTimers();
  const startMs = Date.UTC(2026, 8, 29, 12, 0, 0);
  vi.setSystemTime(startMs);
  const nowSec = Math.floor(startMs / 1000);
  mocks.announceRideStage.mockClear();

  exitStopAnswersOnce(
    {
      serverTime: nowSec,
      arrivals: [
        {
          datedvehiclejourneyref: "journey-1",
          monitored: true,
          vehicleatstop: true,
          recordedattime: nowSec - 300,
          expectedarrivaltime: nowSec + 60,
        },
      ],
    },
    offline
  );

  const { result, unmount } = renderHook(() => useRideMode());
  startTimedRide(result, nowSec, [60]);
  await advance(0);

  expect(result.current.session?.stage).toBe("next");
  expect(result.current.session?.stageReason).not.toBe("target-at-stop");
  expect(
    mocks.announceRideStage.mock.calls.map(([stage]) => stage)
  ).not.toContain("now");

  act(() => result.current.endRide());
  unmount();
  mocks.fetchStopMonitor.mockImplementation(() => new Promise(() => {}));
});

// With no fix yet, the fix time is null, and Number(null) is 0: the panel
// said "Lost track of your location · last seen 29845074 min ago" to a
// passenger who had denied location or was still waiting for the first fix.
test("before any location fix the panel never says when it was last seen", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  watchPosition.mockImplementation((_success, failure) => {
    failure({ code: 1 });
    return 77;
  });

  function Panel() {
    const ride = useRideMode();
    Panel.ride = ride;
    return ride.session ? (
      <RideMode
        session={ride.session}
        runtime={ride.runtime}
        gps={ride.gps}
        wakeLockState={ride.wakeLockState}
        onTestAlert={() => {}}
        onEndRide={() => {}}
        onOpenStop={() => {}}
      />
    ) : null;
  }

  render(<Panel />);
  act(() => {
    Panel.ride.startRide(rideConfig);
  });
  // The clock tick weighs the evidence and publishes the fix's age.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });

  expect(Panel.ride.runtime.gpsAgeSec).toBeNull();
  expect(screen.queryByText(/last seen/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Lost track of your location")).not.toBeInTheDocument();
  expect(screen.getByText("Cannot use your location")).toBeInTheDocument();
});
