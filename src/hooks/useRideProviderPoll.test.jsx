import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchStopMonitor: vi.fn() }));

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: mocks.fetchStopMonitor,
}));

import useRideProviderPoll from "./useRideProviderPoll";
import { RIDE_STAGE } from "../utils/rideProgress";

const session = {
  id: "ride-1",
  lineRef: "1",
  tripRef: "trip-1",
  targetStop: { id: "32", name: "Puistokatu" },
  previousStop: { id: "164", name: "Kauppatori" },
};

function okResponse() {
  return {
    stopName: "Puistokatu",
    serverTime: 1_000,
    arrivals: [{ lineref: "1", tripref: "trip-1", recordedattime: 990 }],
  };
}

function harness(overrides = {}) {
  return {
    rideId: "ride-1",
    sessionRef: { current: session },
    runtimeRef: { current: {} },
    rideIdentity: () => ({ tripRef: "trip-1" }),
    readArrivalSignals: () => ({}),
    onRuntime: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // The backoff adds jitter from Math.random so a city's phones do not retry
  // in lockstep. Counting rounds in a fixed window is only meaningful with
  // that pinned: otherwise an unlucky draw fails a correct implementation.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  mocks.fetchStopMonitor.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// A throw used to leave nothing scheduled, so live tracking ended for the
// rest of the ride with only the clock tick keeping the schedule fallback
// moving — and nothing on screen to say it had happened.
test("keeps polling after applying a result throws", async () => {
  mocks.fetchStopMonitor.mockResolvedValue(okResponse());

  const onRuntime = vi.fn(() => {
    throw new Error("state update blew up");
  });
  const props = harness({ onRuntime });

  const { unmount } = renderHook(() => useRideProviderPoll(props));

  await vi.advanceTimersByTimeAsync(0);
  expect(onRuntime).toHaveBeenCalledTimes(1);
  const afterFirst = mocks.fetchStopMonitor.mock.calls.length;

  await vi.advanceTimersByTimeAsync(21_000);
  expect(mocks.fetchStopMonitor.mock.calls.length).toBeGreaterThan(afterFirst);
  expect(onRuntime).toHaveBeenCalledTimes(2);

  unmount();
});

test("slows down while the provider is failing and speeds back up after it answers", async () => {
  mocks.fetchStopMonitor.mockRejectedValue(new Error("provider down"));
  const props = harness();

  const { unmount } = renderHook(() => useRideProviderPoll(props));

  // Gaps grow 20s, 40s, 80s, 80s…, so polls land at 0, 20, 60 and 140
  // seconds: four rounds where a flat 20s cadence would have made ten.
  await vi.advanceTimersByTimeAsync(200_000);
  const failingRounds = mocks.fetchStopMonitor.mock.calls.length / 2;
  expect(failingRounds).toBe(4);

  // One success resets the cadence, so the next 100s is back to 20s steps.
  mocks.fetchStopMonitor.mockResolvedValue(okResponse());
  await vi.advanceTimersByTimeAsync(100_000);
  const recoveredRounds =
    mocks.fetchStopMonitor.mock.calls.length / 2 - failingRounds;
  expect(recoveredRounds).toBeGreaterThanOrEqual(4);

  unmount();
});

test("stops polling once the ride ends", async () => {
  mocks.fetchStopMonitor.mockResolvedValue(okResponse());
  const props = harness();

  const { unmount } = renderHook(() => useRideProviderPoll(props));
  await vi.advanceTimersByTimeAsync(0);
  unmount();

  const afterUnmount = mocks.fetchStopMonitor.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(mocks.fetchStopMonitor.mock.calls.length).toBe(afterUnmount);
});

// One poll round against canned answers for the target (32) and the stop
// before it (164), returning what the round hands to the ride.
async function pollOnce(answers, runtime = {}, sessionOverrides = {}) {
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve(answers[String(stopId)])
  );
  const onRuntime = vi.fn();
  const readArrivalSignals = vi.fn(() => ({ liveEtaSec: 42 }));
  const props = harness({
    onRuntime,
    readArrivalSignals,
    runtimeRef: { current: runtime },
    sessionRef: { current: { ...session, ...sessionOverrides } },
  });

  const { unmount } = renderHook(() => useRideProviderPoll(props));
  await vi.advanceTimersByTimeAsync(0);
  unmount();

  expect(onRuntime).toHaveBeenCalledTimes(1);
  return { next: onRuntime.mock.calls[0][0], readArrivalSignals };
}

function answer(arrivals, extra = {}) {
  return { serverTime: 1_000, realtimeAvailable: true, arrivals, ...extra };
}

const trackedRow = { lineref: "1", tripref: "trip-1", monitored: true };
const untrackedRow = {
  lineref: "1",
  tripref: "trip-1",
  monitored: false,
  aimedarrivaltime: 1_060,
};

// The departure board fills a quiet stop from the GTFS timetable, under the
// same trip id the ride follows. A ride that asked for that board matched the
// timetable row and called it a live sighting.
test("asks the realtime feed alone, never the board's timetable fallback", async () => {
  mocks.fetchStopMonitor.mockResolvedValue(okResponse());
  const props = harness();

  const { unmount } = renderHook(() => useRideProviderPoll(props));
  await vi.advanceTimersByTimeAsync(0);

  expect(mocks.fetchStopMonitor).toHaveBeenCalledWith("32", expect.anything(), {
    scheduleFallback: false,
  });
  expect(mocks.fetchStopMonitor).toHaveBeenCalledWith(
    "164",
    expect.anything(),
    { scheduleFallback: false }
  );

  unmount();
});

test("a row the feed is not tracking is not a live sighting of the bus", async () => {
  const { next, readArrivalSignals } = await pollOnce({
    32: answer([untrackedRow]),
    164: answer([untrackedRow]),
  });

  expect(next.lastLiveMatchAt ?? null).toBeNull();
  expect(next.targetListed).toBe(false);
  expect(next.targetMatchBy).toBe("");
  expect(next.liveEtaSec).toBeNull();
  expect(next.previousSeen ?? false).toBe(false);
  expect(readArrivalSignals).not.toHaveBeenCalled();
});

test("a tracked row is still a live sighting at both stops", async () => {
  const targetRow = { ...trackedRow, expectedarrivaltime: 1_060 };
  const { next, readArrivalSignals } = await pollOnce({
    32: answer([targetRow]),
    164: answer([trackedRow]),
  });

  expect(next.lastLiveMatchAt).toEqual(expect.any(Number));
  expect(next.targetListed).toBe(true);
  expect(next.targetMatchBy).toBe("trip");
  expect(next.liveEtaSec).toBe(42);
  expect(next.previousSeen).toBe(true);
  expect(readArrivalSignals).toHaveBeenCalledWith(
    targetRow,
    1_000,
    session.targetStop
  );
});

test("repeated identical SIRI snapshots do not freeze the ETA anchor", async () => {
  const startMs = 1_700_000_000_000;
  vi.setSystemTime(startMs);
  const targetRow = {
    ...trackedRow,
    recordedattime: 990,
    expectedarrivaltime: 1_060,
    latitude: 60.45,
    longitude: 22.25,
  };
  const answers = {
    32: answer([targetRow]),
    164: answer([{ ...trackedRow, recordedattime: 990 }]),
  };

  const first = await pollOnce(answers);
  expect(first.next.targetSeenAt).toBe(startMs);
  expect(first.next.targetSnapshotSignature).toBeTruthy();
  expect(first.readArrivalSignals).toHaveBeenCalledTimes(1);

  vi.setSystemTime(startMs + 20_000);
  const repeated = await pollOnce(answers, first.next);
  expect(repeated.next.targetSeenAt).toBe(startMs);
  expect(repeated.next.lastLiveMatchAt).toBe(first.next.lastLiveMatchAt);
  expect(repeated.next.liveEtaSec).toBe(42);
  expect(repeated.readArrivalSignals).not.toHaveBeenCalled();

  // A provider observation that actually advanced gets a new anchor.
  vi.setSystemTime(startMs + 40_000);
  const freshRow = { ...targetRow, recordedattime: 1_030 };
  const fresh = await pollOnce(
    {
      32: answer([freshRow]),
      164: answer([{ ...trackedRow, recordedattime: 1_030 }]),
    },
    repeated.next
  );
  expect(fresh.next.targetSeenAt).toBe(startMs + 40_000);
  expect(fresh.next.lastLiveMatchAt).toBe(startMs + 40_000);
  expect(fresh.readArrivalSignals).toHaveBeenCalledTimes(1);
});

test("an ambiguous repeated visit never counts as the bus disappearing", async () => {
  const ambiguousRows = [
    { ...trackedRow, expectedarrivaltime: 1_000 },
    { ...trackedRow, expectedarrivaltime: 2_200 },
  ];
  const before = {
    targetListed: true,
    targetMatchBy: "trip",
    targetMissingCount: 1,
    targetWasAtStop: false,
    liveEtaSec: 120,
    providerDistanceM: 300,
    providerPositionAgeSec: 10,
    previousSeen: true,
    previousMissingCount: 1,
    lastLiveMatchAt: 5,
  };

  const { next, readArrivalSignals } = await pollOnce(
    {
      32: answer(ambiguousRows),
      164: answer(ambiguousRows),
    },
    before
  );

  expect(next.targetListed).toBe(true);
  expect(next.targetMatchBy).toBe("trip");
  expect(next.targetMissingCount).toBe(1);
  expect(next.liveEtaSec).toBe(120);
  expect(next.providerDistanceM).toBe(300);
  expect(next.previousSeen).toBe(true);
  expect(next.previousMissingCount).toBe(1);
  expect(next.lastLiveMatchAt).toBe(5);
  expect(readArrivalSignals).not.toHaveBeenCalled();
});

test("a tracked bus dropping to an untracked row reads as gone from live data", async () => {
  const { next } = await pollOnce(
    { 32: answer([untrackedRow]), 164: answer([]) },
    {
      targetListed: true,
      targetMatchBy: "trip",
      targetMissingCount: 0,
      targetWasAtStop: false,
      liveEtaSec: 120,
      previousSeen: false,
      previousMissingCount: 0,
    }
  );

  expect(next.targetListed).toBe(false);
  expect(next.targetMatchBy).toBe("");
  expect(next.targetMissingCount).toBe(1);
  expect(next.liveEtaSec).toBeNull();
});

// Föli also answers NO_SIRI_DATA for a stop with nothing coming, which is
// exactly what the exit stop looks like once the bus has left it. Holding the
// last live picture there kept the bus "at the stop" and the get-off alarm
// repeating for the rest of the ride.
test("an answer without realtime rows reads as the bus gone from the exit stop", async () => {
  const before = {
    targetListed: true,
    targetMatchBy: "trip",
    targetMissingCount: 0,
    targetWasAtStop: true,
    liveEtaSec: 0,
    providerDistanceM: 12,
    providerPositionAgeSec: 5,
    lastLiveMatchAt: 5,
  };
  const { next } = await pollOnce(
    { 32: answer([], { realtimeAvailable: false }), 164: answer([]) },
    before
  );

  expect(next.targetListed).toBe(false);
  expect(next.targetMatchBy).toBe("");
  expect(next.targetMissingCount).toBe(1);
  expect(next.targetWasAtStop).toBe(true);
  expect(next.liveEtaSec).toBeNull();
  expect(next.providerDistanceM).toBeNull();
  expect(next.providerPositionAgeSec).toBeNull();
  // Not a sighting, so live tracking still ages out on its own clock.
  expect(next.lastLiveMatchAt).toBe(5);
});

// The previous-stop check turns a disappearance into "Press STOP now", so it
// may only count one the feed actually reported. A stop whose feed has no data
// says nothing about the bus: counted as a departure, an outage there (or a
// recovery that reached the exit stop first) raised the alarm minutes before
// the bus reached the stop before yours.
test("a no-data answer at the stop before yours is not the bus leaving it", async () => {
  const { next } = await pollOnce(
    {
      32: answer([trackedRow]),
      164: answer([], { realtimeAvailable: false }),
    },
    {
      targetListed: true,
      targetMissingCount: 0,
      previousSeen: true,
      previousMissingCount: 1,
    }
  );

  expect(next.previousSeen).toBe(true);
  expect(next.previousMissingCount).toBe(1);
  expect(next.targetListed).toBe(true);
});

// An untracked row leaves the board when its timetable time passes, bus or
// no bus. Its disappearance must not stand in for the bus leaving the stop.
test("an untracked listing at the previous stop cannot later pass for the bus leaving it", async () => {
  const first = await pollOnce(
    { 32: answer([trackedRow]), 164: answer([untrackedRow]) },
    {
      targetListed: true,
      targetMissingCount: 0,
      previousSeen: true,
      previousMissingCount: 0,
    }
  );
  expect(first.next.previousSeen).toBe(false);

  const second = await pollOnce(
    { 32: answer([trackedRow]), 164: answer([]) },
    first.next
  );
  expect(second.next.previousMissingCount).toBe(0);
});

test("a live bus dropping off the stop before yours still counts as passing it", async () => {
  const { next } = await pollOnce(
    { 32: answer([trackedRow]), 164: answer([]) },
    {
      targetListed: true,
      targetMissingCount: 0,
      previousSeen: true,
      previousMissingCount: 0,
    }
  );

  expect(next.previousSeen).toBe(true);
  expect(next.previousMissingCount).toBe(1);
  expect(next.targetListed).toBe(true);
});

// While "get off now" sounds, the exit stop still listing the journey, even
// untracked, is the bus still due there. Counted as gone, it ended the alarm
// within a minute of NOW while the bus was still on its way, in exactly the
// case where the phone's location was the only evidence left.
test("at the get-off stop, an untracked listing does not count as the bus gone", async () => {
  const { next } = await pollOnce(
    { 32: answer([untrackedRow]), 164: answer([]) },
    { targetListed: false, targetMissingCount: 1, targetWasAtStop: false },
    { stage: RIDE_STAGE.NOW }
  );

  expect(next.targetListed).toBe(false);
  expect(next.targetMissingCount).toBe(1);
});

test("at the get-off stop, an answer without the bus still counts towards ending the alarm", async () => {
  const { next } = await pollOnce(
    { 32: answer([]), 164: answer([]) },
    { targetListed: false, targetMissingCount: 1, targetWasAtStop: false },
    { stage: RIDE_STAGE.NOW }
  );

  expect(next.targetMissingCount).toBe(2);
});


test("a stale at-stop row never arms the historical target-at-stop latch", async () => {
  const staleAtStop = {
    ...trackedRow,
    vehicleatstop: true,
    expectedarrivaltime: 1_060,
  };
  const onRuntime = vi.fn();
  const props = harness({
    onRuntime,
    runtimeRef: { current: { targetWasAtStop: false } },
    readArrivalSignals: () => ({
      liveEtaSec: 60,
      providerPositionAgeSec: 300,
    }),
  });
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve(
      String(stopId) === "32"
        ? answer([staleAtStop])
        : answer([])
    )
  );

  const { unmount } = renderHook(() => useRideProviderPoll(props));
  await vi.advanceTimersByTimeAsync(0);

  const next = onRuntime.mock.calls[0][0];
  expect(next.targetWasAtStop).toBe(false);

  unmount();
});

test("a fresh at-stop row still arms the historical target-at-stop latch", async () => {
  const freshAtStop = {
    ...trackedRow,
    vehicleatstop: true,
    expectedarrivaltime: 1_060,
  };
  const onRuntime = vi.fn();
  const props = harness({
    onRuntime,
    runtimeRef: { current: { targetWasAtStop: false } },
    readArrivalSignals: () => ({
      liveEtaSec: 60,
      providerPositionAgeSec: 5,
    }),
  });
  mocks.fetchStopMonitor.mockImplementation((stopId) =>
    Promise.resolve(
      String(stopId) === "32"
        ? answer([freshAtStop])
        : answer([])
    )
  );

  const { unmount } = renderHook(() => useRideProviderPoll(props));
  await vi.advanceTimersByTimeAsync(0);

  const next = onRuntime.mock.calls[0][0];
  expect(next.targetWasAtStop).toBe(true);

  unmount();
});
