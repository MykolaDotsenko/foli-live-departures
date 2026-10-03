import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_CONTINUATION_STORAGE_KEY,
  clearRideContinuation,
  normalizeRideContinuation,
  persistRideContinuation,
  readRideContinuation,
} from "./rideContinuation";

beforeEach(() => {
  globalThis.sessionStorage.clear();
});

describe("ride continuation", () => {
  it("normalizes only supported continuation records", () => {
    expect(normalizeRideContinuation(null)).toBeNull();
    expect(normalizeRideContinuation([])).toBeNull();
    expect(normalizeRideContinuation({})).toBeNull();
    expect(
      normalizeRideContinuation({
        transferJourney: { id: "journey-1" },
      })
    ).toEqual({
      transferJourney: { id: "journey-1" },
      finalWalk: null,
    });
    expect(
      normalizeRideContinuation({
        finalWalk: { fromStopId: "32" },
      })
    ).toEqual({
      transferJourney: null,
      finalWalk: { fromStopId: "32" },
    });
  });

  it("returns no continuation without a ride id", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    expect(readRideContinuation("")).toBeNull();
    expect(readRideContinuation(null)).toBeNull();
  });

  it("cleans a continuation belonging to a different ride", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    expect(readRideContinuation("ride-2")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("cleans a stored record whose continuation is empty", () => {
    globalThis.sessionStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        continuation: {},
      })
    );

    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("clears the active slot when persistence receives no continuation", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    expect(persistRideContinuation("ride-1", null)).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("reads an empty continuation slot as empty", () => {
    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("can explicitly clear the tab-scoped continuation slot", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    clearRideContinuation();

    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("cleans malformed data when clearing a matching ride", () => {
    globalThis.sessionStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );

    expect(() => clearRideContinuation("ride-1")).not.toThrow();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("does not write continuation data without a ride id", () => {
    const continuation = {
      transferJourney: { id: "journey-1" },
    };

    expect(persistRideContinuation("", continuation)).toEqual({
      transferJourney: { id: "journey-1" },
      finalWalk: null,
    });
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("survives a same-tab reload boundary without entering localStorage", () => {
    const continuation = {
      transferJourney: {
        id: "journey-1",
        destinationLabel: "Home",
        itinerary: { legs: [{ tripRef: "trip-2" }] },
      },
      finalWalk: {
        destinationLabel: "Private destination",
        lat: 60.45,
        lon: 22.27,
        fromStopId: "32",
      },
    };

    expect(
      persistRideContinuation("ride-1", continuation)
    ).toEqual(continuation);
    expect(readRideContinuation("ride-1")).toEqual(continuation);
    expect(localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)).toBeNull();
  });

  it("clears only the matching active ride", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    clearRideContinuation("ride-2");
    expect(readRideContinuation("ride-1")).toMatchObject({
      transferJourney: { id: "journey-1" },
    });

    clearRideContinuation("ride-1");
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("drops malformed session data instead of throwing", () => {
    globalThis.sessionStorage.setItem(RIDE_CONTINUATION_STORAGE_KEY, "{bad json");
    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("keeps working when session storage is unavailable", () => {
    const getter = vi
      .spyOn(globalThis.Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() =>
      persistRideContinuation("ride-1", {
        transferJourney: { id: "journey-1" },
      })
    ).not.toThrow();

    getter.mockRestore();
  });
});
