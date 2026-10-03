import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_CONTINUATION_STORAGE_KEY,
  clearRideContinuation,
  persistRideContinuation,
  readRideContinuation,
} from "./rideContinuation";

beforeEach(() => {
  sessionStorage.clear();
});

describe("ride continuation", () => {
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

  it("never hands one ride another ride's continuation", () => {
    persistRideContinuation("ride-1", {
      transferJourney: { id: "journey-1" },
    });

    expect(readRideContinuation("ride-2")).toBeNull();
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
      sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("drops malformed session data instead of throwing", () => {
    sessionStorage.setItem(RIDE_CONTINUATION_STORAGE_KEY, "{bad json");
    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
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
