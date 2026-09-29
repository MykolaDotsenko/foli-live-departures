import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_STORAGE_KEY,
  RIDE_TTL_MS,
  createRideId,
  emptyGps,
  emptyRuntime,
  persistRide,
  readStoredRide,
  rideIdentity,
  storedRideId,
  validStoredRide,
} from "./rideSession";

const NOW = 1_700_000_000_000;

function storedRide(overrides = {}) {
  return {
    id: "ride-1",
    targetStop: { id: "32", name: "Puistokatu" },
    plan: { targetPredictedEpochSec: NOW / 1000 + 600 },
    stage: "boarded",
    startedAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("empty ride state", () => {
  it("starts every ride from fresh objects nothing else holds", () => {
    expect(emptyRuntime()).not.toBe(emptyRuntime());
    expect(emptyGps()).not.toBe(emptyGps());
    expect(emptyRuntime()).toMatchObject({
      lastPollAt: null,
      targetMissingCount: 0,
      trackingHealth: "schedule",
      notificationPermission: "unknown",
    });
    expect(emptyGps()).toMatchObject({
      status: "off",
      shapeStatus: "idle",
      leftBoardingFixes: 0,
      updatedAt: null,
    });
  });
});

describe("validStoredRide", () => {
  it("resumes a ride that started a minute ago", () => {
    expect(validStoredRide(storedRide(), NOW)).toBeTruthy();
  });

  it("refuses anything that is not a ride record", () => {
    expect(validStoredRide(null, NOW)).toBeFalsy();
    expect(validStoredRide("ride", NOW)).toBeFalsy();
    expect(validStoredRide(storedRide({ id: 7 }), NOW)).toBeFalsy();
    expect(validStoredRide(storedRide({ plan: null }), NOW)).toBeFalsy();
    expect(
      validStoredRide(storedRide({ targetStop: { id: "T32" } }), NOW)
    ).toBeFalsy();
  });

  it("refuses a start in the future or beyond the ride lifetime", () => {
    expect(
      validStoredRide(storedRide({ startedAt: NOW + 1000 }), NOW)
    ).toBeFalsy();
    expect(
      validStoredRide(
        storedRide({ startedAt: NOW - RIDE_TTL_MS - 1, expiresAt: NOW + 1 }),
        NOW
      )
    ).toBeFalsy();
  });

  it("refuses a ride that has expired or claims to outlive its lifetime", () => {
    expect(validStoredRide(storedRide({ expiresAt: NOW }), NOW)).toBeFalsy();
    expect(
      validStoredRide(
        storedRide({ expiresAt: NOW - 60_000 + RIDE_TTL_MS + 1 }),
        NOW
      )
    ).toBeFalsy();
  });

  it("refuses a ride long past its planned exit", () => {
    expect(
      validStoredRide(
        storedRide({
          plan: { targetPredictedEpochSec: NOW / 1000 - 46 * 60 },
        }),
        NOW
      )
    ).toBeFalsy();
  });

  it("reads the clock when no time is given", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    expect(validStoredRide(storedRide())).toBeTruthy();
    vi.setSystemTime(NOW + 60_000);
    expect(validStoredRide(storedRide())).toBeFalsy();
  });
});

describe("stored ride", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  it("saves under the ride key and reads the same ride back", () => {
    persistRide(storedRide());
    expect(JSON.parse(localStorage.getItem(RIDE_STORAGE_KEY))).toEqual(
      storedRide()
    );
    expect(readStoredRide()).toEqual(storedRide());
  });

  it("forgets the ride when there is none", () => {
    persistRide(storedRide());
    persistRide(null);
    expect(localStorage.getItem(RIDE_STORAGE_KEY)).toBeNull();
  });

  it("reads nothing when nothing is saved", () => {
    expect(readStoredRide()).toBeNull();
  });

  it("removes a record that is no longer worth resuming", () => {
    localStorage.setItem(
      RIDE_STORAGE_KEY,
      JSON.stringify(storedRide({ expiresAt: NOW - 1 }))
    );
    expect(readStoredRide()).toBeNull();
    expect(localStorage.getItem(RIDE_STORAGE_KEY)).toBeNull();
  });

  // Another tab may be running it, and know its bus is very late.
  it("does not resume, or remove, a ride long past its exit inside its lifetime", () => {
    const longOver = storedRide({
      plan: { targetPredictedEpochSec: NOW / 1000 - 46 * 60 },
    });
    localStorage.setItem(RIDE_STORAGE_KEY, JSON.stringify(longOver));
    expect(readStoredRide()).toBeNull();
    expect(JSON.parse(localStorage.getItem(RIDE_STORAGE_KEY))).toEqual(longOver);
    expect(storedRideId()).toBe("ride-1");
  });

  it("names no stored ride for a record past its lifetime or corrupt", () => {
    expect(storedRideId()).toBe("");
    localStorage.setItem(
      RIDE_STORAGE_KEY,
      JSON.stringify(storedRide({ expiresAt: NOW - 1 }))
    );
    expect(storedRideId()).toBe("");
    localStorage.setItem(RIDE_STORAGE_KEY, "{not json");
    expect(storedRideId()).toBe("");
    // Asking removes nothing.
    expect(localStorage.getItem(RIDE_STORAGE_KEY)).toBe("{not json");
  });

  it("never lets a corrupt record throw, and removes it", () => {
    localStorage.setItem(RIDE_STORAGE_KEY, "{not json");
    expect(readStoredRide()).toBeNull();
    expect(localStorage.getItem(RIDE_STORAGE_KEY)).toBeNull();
  });

  it("reads no ride when storage cannot be read or cleaned", () => {
    const getItem = vi
      .spyOn(globalThis.Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const removeItem = vi
      .spyOn(globalThis.Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(readStoredRide()).toBeNull();
    getItem.mockRestore();
    removeItem.mockRestore();
  });

  it("keeps going when storage refuses to save", () => {
    const setItem = vi
      .spyOn(globalThis.Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    expect(() => persistRide(storedRide())).not.toThrow();
    setItem.mockRestore();
  });
});

describe("createRideId", () => {
  it("uses the browser's UUIDs when it has them", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
    expect(createRideId()).toBe("uuid-1");
  });

  it("falls back to a time-based id without them", () => {
    vi.stubGlobal("crypto", {});
    expect(createRideId()).toMatch(/^ride-\d+-[a-z0-9]{1,6}$/);
  });
});

describe("rideIdentity", () => {
  it("takes only what identifies the journey", () => {
    expect(
      rideIdentity({
        ...storedRide(),
        datedVehicleJourneyRef: "journey-1",
        tripRef: "trip-1",
        vehicleRef: "bus-1",
        lineRef: "1",
        originAimedDepartureTime: 1000,
      })
    ).toEqual({
      datedVehicleJourneyRef: "journey-1",
      tripRef: "trip-1",
      vehicleRef: "bus-1",
      lineRef: "1",
      originAimedDepartureTime: 1000,
    });
  });
});
