import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bearingDegrees,
  compassPoint,
  headingFromOrientationEvent,
  movementHeading,
  normalizeDegrees,
  radarPoint,
  radarRangeMeters,
  radarStops,
  requestCompassPermission,
  relativeBearingDegrees,
  relativeDirectionKey,
  smoothHeading,
} from "./stopRadar";

describe("stop radar geometry", () => {
  it("computes cardinal bearings and relative angles deterministically", () => {
    const origin = { lat: 60, lon: 22 };
    expect(bearingDegrees(origin, { lat: 61, lon: 22 })).toBeCloseTo(0, 5);
    expect(bearingDegrees(origin, { lat: 60, lon: 23 })).toBeCloseTo(89.57, 1);
    expect(relativeBearingDegrees(90, 0)).toBe(90);
    expect(relativeBearingDegrees(0, 90)).toBe(270);
    expect(relativeBearingDegrees(20, null)).toBe(20);
  });

  it("fails closed for missing or malformed coordinate pairs", () => {
    expect(bearingDegrees(null, { lat: 60, lon: 22 })).toBeNull();
    expect(bearingDegrees({ lat: 60, lon: 22 }, undefined)).toBeNull();
    expect(
      bearingDegrees(
        { lat: "not-a-latitude", lon: 22 },
        { lat: 60.45, lon: 22.26 }
      )
    ).toBeNull();
    expect(
      movementHeading(
        { lat: 60.45, lon: 22.26, accuracy: 8 },
        { lat: null, lon: 22.27, accuracy: 8 }
      )
    ).toBeNull();
  });

  it("smooths across north without inventing a zero-degree prior heading", () => {
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(null, 12)).toBe(12);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(null)).toBeNull();
    expect(normalizeDegrees(undefined)).toBeNull();
    expect(normalizeDegrees("")).toBeNull();
  });

  it("uses only absolute orientation or Safari compass heading", () => {
    expect(
      headingFromOrientationEvent({ webkitCompassHeading: 42, alpha: 100 })
    ).toBe(42);
    expect(headingFromOrientationEvent({ absolute: true, alpha: 90 })).toBe(270);
    expect(headingFromOrientationEvent({ absolute: false, alpha: 90 })).toBeNull();
  });

  // The phone's top edge points west; turned a quarter to the left
  // (screen angle 90, Safari's window.orientation 90), the top of its
  // screen points north. Turned to the right, -90 or 270.
  it("gives the heading of the screen's top, not the phone's", () => {
    expect(headingFromOrientationEvent({ webkitCompassHeading: 270 }, 90)).toBe(0);
    expect(headingFromOrientationEvent({ webkitCompassHeading: 90 }, -90)).toBe(0);
    expect(headingFromOrientationEvent({ absolute: true, alpha: 90 }, 270)).toBe(180);
    expect(headingFromOrientationEvent({ absolute: true, alpha: 90 }, undefined)).toBe(270);
    expect(headingFromOrientationEvent({ absolute: false, alpha: 90 }, 90)).toBeNull();
  });

  it("rejects GPS jitter as a fake movement heading", () => {
    expect(
      movementHeading(
        { lat: 60.4518, lon: 22.2666, accuracy: 15 },
        { lat: 60.45182, lon: 22.26662, accuracy: 15 }
      )
    ).toBeNull();

    const heading = movementHeading(
      { lat: 60.4518, lon: 22.2666, accuracy: 8 },
      { lat: 60.4520, lon: 22.2666, accuracy: 8 }
    );
    expect(heading).toBeCloseTo(0, 3);

    expect(
      movementHeading(
        { lat: 60.4518, lon: 22.2666, accuracy: 80 },
        { lat: 60.4524, lon: 22.2666, accuracy: 80 }
      )
    ).toBeNull();
  });

  it("keeps the target even when it is outside the nearest-eight list", () => {
    const origin = { lat: 60.4518, lon: 22.2666 };
    const stops = Array.from({ length: 10 }, (_, index) => ({
      id: String(index + 1),
      lat: 60.4518 + index * 0.0001,
      lon: 22.2666,
    }));
    const shown = radarStops(stops, origin, "10");
    expect(shown).toHaveLength(9);
    expect(shown.at(-1)?.id).toBe("10");
  });

  it("uses bounded readable radar ranges and pins outliers to the edge", () => {
    expect(radarRangeMeters(150)).toBe(200);
    expect(radarRangeMeters(600)).toBe(800);
    expect(radarRangeMeters(3_000)).toBe(2_000);

    const point = radarPoint(90, 0, 3_000, 2_000);
    expect(point).toMatchObject({ x: 92, y: 50, clipped: true });
  });

  // Scaled to the eighth-nearest stop, a target 40 m away sat on the
  // passenger's own dot on a 2 km scale, where the walk needs precision.
  it("scales the radar to the stop being walked to, down to 50 m", () => {
    expect(radarRangeMeters(20)).toBe(50);
    expect(radarRangeMeters(50)).toBe(100);
    expect(radarRangeMeters(390)).toBe(800);
    expect(radarRangeMeters(null)).toBe(200);
    expect(radarRangeMeters(null, 400)).toBe(400);
  });

  it("zooms out at once but zooms in only once the target is well inside", () => {
    // Walking away: the target must never leave the scale.
    expect(radarRangeMeters(90, 100)).toBe(200);
    // Walking closer from 400 m: the scale steps down to 200 m once the
    // target is inside two thirds of it, and not before.
    expect(radarRangeMeters(130, 400)).toBe(200);
    expect(radarRangeMeters(150, 400)).toBe(400);
    // A distance hovering at a step keeps the scale on screen.
    expect(radarRangeMeters(70, 200)).toBe(200);
    expect(radarRangeMeters(66, 200)).toBe(100);
    // After a jump, the closest scale the target sits well inside: 150 m
    // is not two thirds inside 200 m, but is inside 400 m, not 2 km.
    expect(radarRangeMeters(150, 2_000)).toBe(400);
    expect(radarRangeMeters(900, 2_000)).toBe(2_000);
    expect(radarRangeMeters(790, 2_000)).toBe(1_200);
  });

  it("names the compass point of a bearing, north clockwise", () => {
    expect(compassPoint(0)).toBe(0);
    expect(compassPoint(22)).toBe(0);
    expect(compassPoint(23)).toBe(1);
    expect(compassPoint(257)).toBe(6);
    expect(compassPoint(315)).toBe(7);
    expect(compassPoint(359)).toBe(0);
    expect(compassPoint(null)).toBeNull();
  });

  it("produces accessible relative direction buckets", () => {
    expect(relativeDirectionKey(0)).toBe("Straight ahead");
    expect(relativeDirectionKey(35)).toBe("Slightly right");
    expect(relativeDirectionKey(90)).toBe("To your right");
    expect(relativeDirectionKey(270)).toBe("To your left");
    expect(relativeDirectionKey(180)).toBe("Behind you");
  });
});


describe("compass permission", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "DeviceOrientationEvent"
  );

  afterEach(() => {
    vi.restoreAllMocks();
    if (original) {
      Object.defineProperty(globalThis, "DeviceOrientationEvent", original);
    } else {
      delete globalThis.DeviceOrientationEvent;
    }
  });

  it("feature-detects unsupported and permission-free browsers", async () => {
    delete globalThis.DeviceOrientationEvent;
    await expect(requestCompassPermission()).resolves.toBe("unavailable");

    Object.defineProperty(globalThis, "DeviceOrientationEvent", {
      configurable: true,
      value: function DeviceOrientationEvent() {},
    });
    await expect(requestCompassPermission()).resolves.toBe("not-required");
  });

  it("requests absolute magnetometer access and fails closed", async () => {
    const requestPermission = vi.fn(async (absolute) =>
      absolute ? "granted" : "denied"
    );
    Object.defineProperty(globalThis, "DeviceOrientationEvent", {
      configurable: true,
      value: { requestPermission },
    });

    await expect(requestCompassPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledWith(true);

    requestPermission.mockResolvedValueOnce("denied");
    await expect(requestCompassPermission()).resolves.toBe("denied");

    requestPermission.mockRejectedValueOnce(new Error("blocked"));
    await expect(requestCompassPermission()).resolves.toBe("error");
  });
});
