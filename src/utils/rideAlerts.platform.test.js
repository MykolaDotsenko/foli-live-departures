import { afterEach, expect, test, vi } from "vitest";
import {
  playRideTone,
  requestRideNotificationPermission,
  showRideNotification,
  stopRideAlerts,
  unlockRideAudio,
  vibrateRideStage,
} from "./rideAlerts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete navigator.serviceWorker;
});

function notificationApi(permission, requestPermission = vi.fn()) {
  class FakeNotification {
    constructor() {}
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = requestPermission;
  return FakeNotification;
}

test("notification permission respects already granted and denied browser state", async () => {
  const grantedRequest = vi.fn();
  vi.stubGlobal("Notification", notificationApi("granted", grantedRequest));
  await expect(requestRideNotificationPermission()).resolves.toBe(true);
  expect(grantedRequest).not.toHaveBeenCalled();

  const deniedRequest = vi.fn();
  vi.stubGlobal("Notification", notificationApi("denied", deniedRequest));
  await expect(requestRideNotificationPermission()).resolves.toBe(false);
  expect(deniedRequest).not.toHaveBeenCalled();
});

test("notification permission reports the result of an explicit browser prompt", async () => {
  const requestPermission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("Notification", notificationApi("default", requestPermission));

  await expect(requestRideNotificationPermission()).resolves.toBe(true);
  expect(requestPermission).toHaveBeenCalledTimes(1);
});

test("notification permission degrades safely when the prompt rejects or the API is absent", async () => {
  const requestPermission = vi.fn().mockRejectedValue(new Error("blocked"));
  vi.stubGlobal("Notification", notificationApi("default", requestPermission));
  await expect(requestRideNotificationPermission()).resolves.toBe(false);

  vi.stubGlobal("Notification", undefined);
  await expect(requestRideNotificationPermission()).resolves.toBe(false);
});

test("a failed service-worker notification is reported instead of escaping the ride flow", async () => {
  const NotificationApi = notificationApi("granted");
  vi.stubGlobal("Notification", NotificationApi);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockRejectedValue(new Error("worker gone")),
    },
  });

  await expect(showRideNotification("now", "Puistokatu")).resolves.toBe(false);
});

test("a broken page-level Notification constructor is contained", async () => {
  function ThrowingNotification() {
    throw new Error("notification constructor failed");
  }
  ThrowingNotification.permission = "granted";
  vi.stubGlobal("Notification", ThrowingNotification);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(null) },
  });

  await expect(showRideNotification("now", "Puistokatu")).resolves.toBe(false);
});

test("haptic failures never break ride progress", () => {
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vi.fn(() => {
      throw new Error("haptics unavailable");
    }),
  });

  expect(vibrateRideStage("now")).toBe(false);
  expect(() => stopRideAlerts()).not.toThrow();
});

test("audio unlock resumes a suspended context and the NOW pattern can be scheduled", async () => {
  const oscillators = [];
  const gains = [];
  const context = {
    state: "suspended",
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
  };

  class FakeAudioContext {
    constructor() {
      return context;
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("webkitAudioContext", undefined);

  await expect(unlockRideAudio()).resolves.toBe(true);
  expect(context.resume).toHaveBeenCalledTimes(1);

  expect(playRideTone("now")).toBe(true);
  expect(oscillators).toHaveLength(3);
  expect(gains).toHaveLength(3);
  expect(oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([
    880,
    1040,
    880,
  ]);
  expect(oscillators.every((oscillator) => oscillator.start.mock.calls.length === 1)).toBe(true);
  expect(oscillators.every((oscillator) => oscillator.stop.mock.calls.length === 1)).toBe(true);
});
