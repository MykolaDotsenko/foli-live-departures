import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useStopRadar from "./useStopRadar";
import { RADAR_MOVEMENT_HEADING_MAX_AGE_MS } from "../utils/stopRadar";

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

const originalVisibility = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState"
);

function setVisibility(value) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
  // jsdom keeps visibilityState on the prototype: a test that hid the page
  // and failed before showing it again left every later test paused.
  if (originalVisibility) {
    Object.defineProperty(document, "visibilityState", originalVisibility);
  } else {
    delete document.visibilityState;
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


test("drops stale compass heading across background and waits for fresh orientation", async () => {
  let deliver;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 21;
      }),
      clearWatch,
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
    const absolute = new Event("deviceorientationabsolute");
    Object.defineProperties(absolute, {
      alpha: { value: 90 },
      absolute: { value: true },
    });
    globalThis.dispatchEvent(absolute);
  });
  await waitFor(() => expect(result.current.headingSource).toBe("compass"));

  act(() => setVisibility("hidden"));
  await waitFor(() => expect(result.current.status).toBe("paused"));
  await waitFor(() => expect(result.current.headingSource).toBe("north"));
  expect(clearWatch).toHaveBeenCalledWith(21);
  // A locked phone woke to an empty radar: the last fix stays on screen...
  expect(result.current.position).toMatchObject({ lat: 60.4518 });

  act(() => setVisibility("visible"));
  // ...shown as waiting for the new watch's first fix.
  await waitFor(() => expect(result.current.status).toBe("stale"));
  expect(result.current.headingSource).toBe("north");
});

test("does not infer motion direction across a background pause", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 22;
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
      timestamp: Date.now(),
    })
  );
  act(() =>
    deliver({
      coords: {
        latitude: 60.4520,
        longitude: 22.2666,
        accuracy: 8,
      },
      timestamp: Date.now(),
    })
  );
  await waitFor(() => expect(result.current.headingSource).toBe("motion"));

  act(() => setVisibility("hidden"));
  await waitFor(() => expect(result.current.headingSource).toBe("north"));

  act(() => setVisibility("visible"));
  await waitFor(() => expect(result.current.status).toBe("stale"));

  // The first post-resume fix can be far away. It establishes a new baseline
  // but must not be treated as a direction-of-travel vector from stale data.
  act(() =>
    deliver({
      coords: {
        latitude: 60.4550,
        longitude: 22.2666,
        accuracy: 8,
      },
      timestamp: Date.now(),
    })
  );
  await waitFor(() => expect(result.current.status).toBe("active"));
  expect(result.current.headingSource).toBe("north");
});

test("expires movement heading even when no later GPS callback causes a rerender", async () => {
  vi.useFakeTimers();
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 31;
      }),
      clearWatch: vi.fn(),
    },
  });

  try {
    const { result } = renderHook(() =>
      useStopRadar({
        active: true,
        compassPermission: "unavailable",
      })
    );

    act(() => {
      deliver({
        coords: {
          latitude: 60.4518,
          longitude: 22.2666,
          accuracy: 8,
        },
        timestamp: Date.now(),
      });
      deliver({
        coords: {
          latitude: 60.4520,
          longitude: 22.2666,
          accuracy: 8,
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.headingSource).toBe("motion");

    act(() => {
      vi.advanceTimersByTime(RADAR_MOVEMENT_HEADING_MAX_AGE_MS + 1);
    });

    expect(result.current.headingSource).toBe("north");
    expect(result.current.heading).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("treats missing or invalid accuracy as unknown instead of perfect accuracy", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 32;
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
        accuracy: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
  );

  await waitFor(() => expect(result.current.status).toBe("active"));
  expect(result.current.position?.accuracy).toBeNull();
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
  expect(result.current.position).not.toBeNull();

  act(() => fail({ code: 1 }));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.position).toBeNull();
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

// No fix for a while (under a roof, or none within the timeout while
// standing at a crossing) cleared the radar and threw away the direction
// of travel, which then never built up between such gaps.
test("keeps the last fix and direction of travel through a passing location gap", async () => {
  let deliver;
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        deliver = success;
        fail = error;
        return 5;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  act(() =>
    deliver({ coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 8 }, timestamp: 1 })
  );
  act(() => fail({ code: 3 }));
  expect(result.current.status).toBe("stale");
  expect(result.current.position).toMatchObject({ lat: 60.4518 });
  expect(result.current.error).toBe("");

  act(() => fail({ code: 2 }));
  act(() =>
    deliver({ coords: { latitude: 60.452, longitude: 22.2666, accuracy: 8 }, timestamp: 2 })
  );
  await waitFor(() => expect(result.current.headingSource).toBe("motion"));
  expect(result.current.status).toBe("active");
});

test("a refusal still ends the radar's location and says so", async () => {
  let deliver;
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        deliver = success;
        fail = error;
        return 6;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  act(() =>
    deliver({ coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 8 }, timestamp: 1 })
  );
  act(() => fail({ code: 1 }));
  expect(result.current.status).toBe("error");
  expect(result.current.position).toBeNull();
  expect(result.current.error).toMatch(/Location access is blocked/);
});

test("a gap before the first fix is still reported as an error", async () => {
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        fail = error;
        return 7;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  act(() => fail({ code: 3 }));
  expect(result.current.status).toBe("error");
  expect(result.current.position).toBeNull();
});

// A walker's fixes a second apart are about 1.4 m apart, under the jitter
// floor every time: compared fix by fix, a whole walk stayed north-up.
test("reads a walker's direction from fixes a second apart", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 8;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  // 1.4 m north per second; 0.0000126° of latitude is about 1.4 m.
  for (let second = 0; second < 6; second += 1) {
    act(() =>
      deliver({
        coords: { latitude: 60.4518 + second * 0.0000126, longitude: 22.2666, accuracy: 8 },
        timestamp: 1_000 * second,
      })
    );
  }
  expect(result.current.headingSource).toBe("north");

  for (let second = 6; second < 12; second += 1) {
    act(() =>
      deliver({
        coords: { latitude: 60.4518 + second * 0.0000126, longitude: 22.2666, accuracy: 8 },
        timestamp: 1_000 * second,
      })
    );
  }
  await waitFor(() => expect(result.current.headingSource).toBe("motion"));
  expect(result.current.heading).toBeCloseTo(0, 0);
});

test("does not read a direction across fixes too far apart in time", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 10;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  act(() =>
    deliver({ coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 8 }, timestamp: 1 })
  );
  // 22 m on, but long after: drift, not a walk the radar watched.
  act(() =>
    deliver({
      coords: { latitude: 60.452, longitude: 22.2666, accuracy: 8 },
      timestamp: RADAR_MOVEMENT_HEADING_MAX_AGE_MS + 1_001,
    })
  );
  expect(result.current.status).toBe("active");
  expect(result.current.headingSource).toBe("north");
});

test("a passing gap after a background pause keeps the last fix on screen", async () => {
  let deliver;
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        deliver = success;
        fail = error;
        return 12;
      }),
      clearWatch: vi.fn(),
    },
  });

  const { result } = renderHook(() =>
    useStopRadar({ active: true, compassPermission: "unavailable" })
  );

  act(() =>
    deliver({ coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 8 }, timestamp: 1 })
  );
  act(() => setVisibility("hidden"));
  await waitFor(() => expect(result.current.status).toBe("paused"));
  act(() => setVisibility("visible"));
  await waitFor(() => expect(result.current.status).toBe("stale"));

  act(() => fail({ code: 3 }));
  expect(result.current.status).toBe("stale");
  expect(result.current.position).toMatchObject({ lat: 60.4518 });
  expect(result.current.error).toBe("");
});

test("turns the compass with the screen when the phone is on its side", async () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: vi.fn(() => 13), clearWatch: vi.fn() },
  });
  const originalOrientation = Object.getOwnPropertyDescriptor(globalThis.screen, "orientation");
  Object.defineProperty(globalThis.screen, "orientation", {
    configurable: true,
    value: { angle: 90 },
  });

  try {
    const { result } = renderHook(() =>
      useStopRadar({ active: true, compassPermission: "granted" })
    );

    // The phone's top edge points west; turned a quarter to the left, the
    // top of its screen points north.
    act(() => {
      const event = new Event("deviceorientation");
      Object.defineProperty(event, "webkitCompassHeading", { value: 270 });
      globalThis.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.headingSource).toBe("compass"));
    expect(result.current.heading).toBeCloseTo(0, 5);
  } finally {
    if (originalOrientation) {
      Object.defineProperty(globalThis.screen, "orientation", originalOrientation);
    } else {
      delete globalThis.screen.orientation;
    }
  }
});
