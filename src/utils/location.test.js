import { describe, expect, test, vi } from "vitest";
import {
  FALLBACK_LOCATION_OPTIONS,
  HIGH_ACCURACY_LOCATION_OPTIONS,
  locationErrorMessage,
  requestOneTimePosition,
} from "./location";

describe("location error copy", () => {
  test.each([
    [1, "Location access is blocked. Allow location for this site in your browser settings and try again."],
    [2, "Your device could not determine its location. Check location services and try again."],
    [3, "Location took too long to respond. Move near a window or try again."],
    [99, "Your location could not be read. Try again or choose a stop manually."],
  ])("maps browser error code %s to actionable copy", (code, expected) => {
    expect(locationErrorMessage({ code })).toBe(expected);
  });
});

describe("one-time browser location", () => {
  test("returns a valid high-accuracy position without a fallback request", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((resolve, _reject, options) => {
        expect(options).toBe(HIGH_ACCURACY_LOCATION_OPTIONS);
        resolve({
          coords: {
            latitude: 60.4518,
            longitude: 22.2666,
            accuracy: 12.5,
          },
        });
      }),
    };

    await expect(requestOneTimePosition(geolocation)).resolves.toEqual({
      lat: 60.4518,
      lon: 22.2666,
      accuracy: 12.5,
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test("retries once with lower accuracy only when the high-accuracy request times out", async () => {
    const seenOptions = [];
    const geolocation = {
      getCurrentPosition: vi.fn((resolve, reject, options) => {
        seenOptions.push(options);
        if (seenOptions.length === 1) {
          reject({ code: 3 });
          return;
        }
        resolve({
          coords: {
            latitude: "60.45",
            longitude: "22.26",
            accuracy: "",
          },
        });
      }),
    };

    await expect(requestOneTimePosition(geolocation)).resolves.toEqual({
      lat: 60.45,
      lon: 22.26,
      accuracy: null,
    });
    expect(seenOptions).toEqual([
      HIGH_ACCURACY_LOCATION_OPTIONS,
      FALLBACK_LOCATION_OPTIONS,
    ]);
  });

  test("does not retry permission denial as a lower-accuracy request", async () => {
    const denied = { code: 1 };
    const geolocation = {
      getCurrentPosition: vi.fn((_resolve, reject) => reject(denied)),
    };

    await expect(requestOneTimePosition(geolocation)).rejects.toBe(denied);
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test("rejects an invalid browser coordinate instead of passing it to stop matching", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((resolve) =>
        resolve({
          coords: {
            latitude: 120,
            longitude: 22.26,
            accuracy: 10,
          },
        })
      ),
    };

    await expect(requestOneTimePosition(geolocation)).rejects.toThrow(
      "Invalid browser location."
    );
  });

  test("normalizes non-finite accuracy to unknown while preserving valid coordinates", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((resolve) =>
        resolve({
          coords: {
            latitude: 60.45,
            longitude: 22.26,
            accuracy: "not-a-number",
          },
        })
      ),
    };

    await expect(requestOneTimePosition(geolocation)).resolves.toEqual({
      lat: 60.45,
      lon: 22.26,
      accuracy: null,
    });
  });

  test("fails clearly when the browser exposes no geolocation API", async () => {
    await expect(requestOneTimePosition(null)).rejects.toThrow(
      "Geolocation unsupported."
    );
    await expect(requestOneTimePosition({})).rejects.toThrow(
      "Geolocation unsupported."
    );
  });
});
