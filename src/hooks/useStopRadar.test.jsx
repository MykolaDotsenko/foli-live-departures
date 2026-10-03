import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useStopRadar from "./useStopRadar";

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("watches live location only while active and clears the watch on close", async () => {
  let deliver;
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((success) => {
    deliver = success;
    return 17;
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch },
  });

  const onPosition = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ active }) =>
      useStopRadar({
        active,
        compassPermission: "unavailable",
        onPosition,
      }),
    { initialProps: { active: true } }
  );

  expect(watchPosition).toHaveBeenCalledTimes(1);
  act(() =>
    deliver({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 12,
        heading: null,
        speed: null,
      },
      timestamp: 123,
    })
  );

  await waitFor(() => expect(result.current.status).toBe("active"));
  expect(result.current.position).toMatchObject({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: 12,
  });
  expect(onPosition).toHaveBeenCalledTimes(1);

  rerender({ active: false });
  expect(clearWatch).toHaveBeenCalledWith(17);
  unmount();
});

test("uses absolute orientation when available and keeps relative orientation out", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 9;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({
      active: true,
      compassPermission: "granted",
    })
  );

  act(() =>
    deliver({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 10,
      },
      timestamp: Date.now(),
    })
  );

  act(() => {
    const relative = new Event("deviceorientation");
    Object.defineProperties(relative, {
      alpha: { value: 90 },
      absolute: { value: false },
    });
    globalThis.dispatchEvent(relative);
  });
  expect(result.current.headingSource).toBe("north");

  act(() => {
    const absolute = new Event("deviceorientationabsolute");
    Object.defineProperties(absolute, {
      alpha: { value: 90 },
      absolute: { value: true },
    });
    globalThis.dispatchEvent(absolute);
  });

  await waitFor(() => expect(result.current.headingSource).toBe("compass"));
  expect(result.current.heading).toBeCloseTo(270, 2);
});

test("falls back to direction of travel only after meaningful movement", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 11;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({
      active: true,
      compassPermission: "unavailable",
    })
  );

  act(() =>
    deliver({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 8,
      },
      timestamp: 1,
    })
  );
  expect(result.current.headingSource).toBe("north");

  act(() =>
    deliver({
      coords: {
        latitude: 60.4520,
        longitude: 22.2666,
        accuracy: 8,
      },
      timestamp: 2,
    })
  );

  await waitFor(() => expect(result.current.headingSource).toBe("motion"));
  expect(result.current.heading).toBeCloseTo(0, 2);
});


test("fails closed when continuous geolocation is unavailable", async () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn() },
  });

  const { result } = renderHook(() =>
    useStopRadar({
      active: true,
      compassPermission: "unavailable",
    })
  );

  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error).toMatch(/Live location tracking is not available/);
});

test("recovers after a location error when a later watch fix succeeds", async () => {
  let deliver;
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        deliver = success;
        fail = error;
        return 33;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({
      active: true,
      compassPermission: "denied",
    })
  );

  act(() => fail({ code: 1 }));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error).toMatch(/Location access is blocked/);

  act(() =>
    deliver({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 10,
      },
      timestamp: Date.now(),
    })
  );
  await waitFor(() => expect(result.current.status).toBe("active"));
  expect(result.current.error).toBe("");
});
