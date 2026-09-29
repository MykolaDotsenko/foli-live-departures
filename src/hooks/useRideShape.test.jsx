import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTripShape: vi.fn(),
  prepareRideShape: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripShape: mocks.fetchTripShape,
}));

vi.mock("../utils/rideGeometry", () => ({
  prepareRideShape: mocks.prepareRideShape,
}));

import useRideShape from "./useRideShape";

beforeEach(() => {
  mocks.fetchTripShape.mockReset();
  mocks.prepareRideShape.mockReset();
});

function harness(overrides = {}) {
  return {
    rideId: "ride-1",
    enabled: true,
    shapeId: "shape-1",
    onStatus: vi.fn(),
    ...overrides,
  };
}

test("does not fetch a shape until an active ride enables location matching", () => {
  const props = harness({ enabled: false });
  const { result } = renderHook(() => useRideShape(props));

  expect(result.current.current).toBeNull();
  expect(mocks.fetchTripShape).not.toHaveBeenCalled();
  expect(props.onStatus).not.toHaveBeenCalled();
});

test("publishes a prepared GTFS-distance shape as ready", async () => {
  const points = [{ lat: 60.45, lon: 22.26, traveled: 0 }];
  const prepared = { usesGtfsDistance: true, points: ["prepared"] };
  mocks.fetchTripShape.mockResolvedValue(points);
  mocks.prepareRideShape.mockReturnValue(prepared);
  const props = harness();

  const { result } = renderHook(() => useRideShape(props));

  await waitFor(() => expect(props.onStatus).toHaveBeenCalledWith("ready"));
  expect(mocks.fetchTripShape).toHaveBeenCalledWith(
    "shape-1",
    expect.any(AbortSignal)
  );
  expect(mocks.prepareRideShape).toHaveBeenCalledWith(points);
  expect(result.current.current).toBe(prepared);
});

test("refuses a shape whose distance scale cannot be matched to GTFS stops", async () => {
  mocks.fetchTripShape.mockResolvedValue([{ lat: 60.45, lon: 22.26 }]);
  mocks.prepareRideShape.mockReturnValue({ usesGtfsDistance: false });
  const props = harness();

  const { result } = renderHook(() => useRideShape(props));

  await waitFor(() =>
    expect(props.onStatus).toHaveBeenCalledWith("unavailable")
  );
  expect(result.current.current).toBeNull();
});

test("reports shape lookup failure without leaving stale matching data", async () => {
  mocks.fetchTripShape.mockRejectedValue(new Error("GTFS shape unavailable"));
  const props = harness();

  const { result } = renderHook(() => useRideShape(props));

  await waitFor(() =>
    expect(props.onStatus).toHaveBeenCalledWith("unavailable")
  );
  expect(result.current.current).toBeNull();
});

test("aborts the trip-shape request and clears the ref on unmount", () => {
  let signal = null;
  mocks.fetchTripShape.mockImplementation((_shapeId, requestSignal) => {
    signal = requestSignal;
    return new Promise(() => {});
  });
  const props = harness();

  const { result, unmount } = renderHook(() => useRideShape(props));

  expect(signal).not.toBeNull();
  expect(signal.aborted).toBe(false);
  expect(result.current.current).toBeNull();

  unmount();

  expect(signal.aborted).toBe(true);
  expect(result.current.current).toBeNull();
});

test("aborts the previous shape before starting a different ride shape", () => {
  const signals = [];
  mocks.fetchTripShape.mockImplementation((_shapeId, requestSignal) => {
    signals.push(requestSignal);
    return new Promise(() => {});
  });
  const onStatus = vi.fn();

  const { rerender } = renderHook(
    ({ rideId, shapeId }) =>
      useRideShape({ rideId, enabled: true, shapeId, onStatus }),
    {
      initialProps: { rideId: "ride-1", shapeId: "shape-1" },
    }
  );

  expect(signals).toHaveLength(1);
  expect(signals[0].aborted).toBe(false);

  rerender({ rideId: "ride-2", shapeId: "shape-2" });

  expect(signals[0].aborted).toBe(true);
  expect(signals).toHaveLength(2);
  expect(signals[1].aborted).toBe(false);
});
