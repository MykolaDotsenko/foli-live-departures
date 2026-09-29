import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useRideWakeLock from "./useRideWakeLock";

function fakeSentinel() {
  const listeners = [];
  return {
    release: vi.fn(() => Promise.resolve()),
    addEventListener: (type, handler) => {
      if (type === "release") listeners.push(handler);
    },
    fireRelease: () => listeners.forEach((handler) => handler()),
  };
}

function stubWakeLock(request) {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
}

afterEach(() => {
  delete navigator.wakeLock;
});

test("holds the screen awake while a ride is running", async () => {
  const sentinel = fakeSentinel();
  stubWakeLock(vi.fn(() => Promise.resolve(sentinel)));

  const { result } = renderHook(() => useRideWakeLock("ride-1"));

  await waitFor(() => expect(result.current).toBe("active"));
  expect(navigator.wakeLock.request).toHaveBeenCalledWith("screen");
});

test("stays inactive when no ride is running", async () => {
  stubWakeLock(vi.fn(() => Promise.resolve(fakeSentinel())));

  const { result } = renderHook(() => useRideWakeLock(""));

  expect(result.current).toBe("inactive");
  expect(navigator.wakeLock.request).not.toHaveBeenCalled();
});

// The browser drops a screen lock every time the page is hidden. Nothing
// re-takes it on its own, so a passenger who checks a message mid-ride would
// come back to a screen free to sleep through their own get-off alert.
test("takes the lock again after the page comes back into view", async () => {
  const first = fakeSentinel();
  const second = fakeSentinel();
  const request = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  stubWakeLock(request);

  const { result } = renderHook(() => useRideWakeLock("ride-1"));
  await waitFor(() => expect(result.current).toBe("active"));

  first.fireRelease();
  await waitFor(() => expect(result.current).toBe("inactive"));

  document.dispatchEvent(new globalThis.Event("visibilitychange"));
  await waitFor(() => expect(result.current).toBe("active"));
  expect(request).toHaveBeenCalledTimes(2);
});

test("says so plainly when the platform has no wake lock", () => {
  const { result } = renderHook(() => useRideWakeLock("ride-1"));
  expect(result.current).toBe("unsupported");
});

test("reports inactive rather than throwing when the request is refused", async () => {
  stubWakeLock(vi.fn(() => Promise.reject(new Error("denied"))));

  const { result } = renderHook(() => useRideWakeLock("ride-1"));

  await waitFor(() => expect(navigator.wakeLock.request).toHaveBeenCalled());
  expect(result.current).toBe("inactive");
});

test("releases the lock when the ride ends", async () => {
  const sentinel = fakeSentinel();
  stubWakeLock(vi.fn(() => Promise.resolve(sentinel)));

  const { result, unmount } = renderHook(() => useRideWakeLock("ride-1"));
  await waitFor(() => expect(result.current).toBe("active"));

  unmount();
  expect(sentinel.release).toHaveBeenCalled();
});


test("does not issue a second wake-lock request while the first one is still pending", async () => {
  let resolveRequest;
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  stubWakeLock(request);

  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");

  const sentinel = fakeSentinel();
  const { result } = renderHook(() => useRideWakeLock("ride-1"));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

  document.dispatchEvent(new globalThis.Event("visibilitychange"));
  document.dispatchEvent(new globalThis.Event("visibilitychange"));

  expect(request).toHaveBeenCalledTimes(1);

  resolveRequest(sentinel);
  await waitFor(() => expect(result.current).toBe("active"));

  visibility.mockRestore();
});


test("releases a wake lock that resolves after the ride has already ended", async () => {
  let resolveRequest;
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  stubWakeLock(request);

  const sentinel = fakeSentinel();
  const { unmount } = renderHook(() => useRideWakeLock("ride-1"));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  unmount();

  resolveRequest(sentinel);

  await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
});
