import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchServiceBoundary: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchServiceBoundary: mocks.fetchServiceBoundary,
}));

import useServiceBoundary from "./useServiceBoundary";

const CACHE_KEY = "foli-service-boundary-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const cachedGeometry = {
  type: "MultiPolygon",
  coordinates: [[[[22.0, 60.0], [23.0, 60.0], [23.0, 61.0], [22.0, 60.0]]]],
};

const liveGeometry = {
  type: "MultiPolygon",
  coordinates: [[[[21.0, 59.0], [24.0, 59.0], [24.0, 62.0], [21.0, 59.0]]]],
};

beforeEach(() => {
  localStorage.clear();
  mocks.fetchServiceBoundary.mockReset();
});

test("uses a fresh cached service boundary without calling the provider", () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ geometry: cachedGeometry, savedAt: Date.now() })
  );

  const { result } = renderHook(() => useServiceBoundary());

  expect(result.current).toEqual({
    geometry: cachedGeometry,
    status: "ready",
  });
  expect(mocks.fetchServiceBoundary).not.toHaveBeenCalled();
});

test("refreshes a stale cached boundary and persists the new geometry", async () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      geometry: cachedGeometry,
      savedAt: Date.now() - DAY_MS - 1,
    })
  );
  mocks.fetchServiceBoundary.mockResolvedValue(liveGeometry);

  const { result } = renderHook(() => useServiceBoundary());

  expect(result.current.geometry).toEqual(cachedGeometry);
  expect(result.current.status).toBe("ready");

  await waitFor(() => expect(result.current.geometry).toEqual(liveGeometry));
  expect(result.current.status).toBe("ready");

  const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
  expect(stored.geometry).toEqual(liveGeometry);
  expect(stored.savedAt).toEqual(expect.any(Number));
});

test("reports unavailable when no usable cache exists and the provider fails", async () => {
  mocks.fetchServiceBoundary.mockRejectedValue(new Error("provider down"));

  const { result, unmount } = renderHook(() => useServiceBoundary());

  expect(result.current).toEqual({ geometry: null, status: "loading" });
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.geometry).toBeNull();

  unmount();
});

test("keeps stale cached geometry usable when a refresh fails", async () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      geometry: cachedGeometry,
      savedAt: Date.now() - DAY_MS - 1,
    })
  );
  mocks.fetchServiceBoundary.mockRejectedValue(new Error("provider down"));

  const { result, unmount } = renderHook(() => useServiceBoundary());

  await waitFor(() => expect(mocks.fetchServiceBoundary).toHaveBeenCalledTimes(1));
  expect(result.current).toEqual({
    geometry: cachedGeometry,
    status: "ready",
  });

  unmount();
});

test("ignores malformed cached data and fetches a valid boundary", async () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      geometry: { type: "Polygon", coordinates: [] },
      savedAt: Date.now(),
    })
  );
  mocks.fetchServiceBoundary.mockResolvedValue(liveGeometry);

  const { result } = renderHook(() => useServiceBoundary());

  expect(result.current.geometry).toBeNull();
  await waitFor(() => expect(result.current.geometry).toEqual(liveGeometry));
  expect(result.current.status).toBe("ready");
});

test("aborts an in-flight boundary request when the consumer unmounts", () => {
  let signal = null;
  mocks.fetchServiceBoundary.mockImplementation((requestSignal) => {
    signal = requestSignal;
    return new Promise(() => {});
  });

  const { unmount } = renderHook(() => useServiceBoundary());

  expect(signal).not.toBeNull();
  expect(signal.aborted).toBe(false);

  unmount();

  expect(signal.aborted).toBe(true);
});
