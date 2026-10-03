import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_CONTINUATION_STORAGE_KEY,
  clearRideContinuation,
  normalizeRideContinuation,
  persistRideContinuation,
  readRideContinuation,
} from "./rideContinuation";

const futureExpiry = () => Date.now() + 60_000;

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe("ride continuation", () => {
  it("normalizes only supported continuation records", () => {
    expect(normalizeRideContinuation(null)).toBeNull();
    expect(normalizeRideContinuation([])).toBeNull();
    expect(normalizeRideContinuation({})).toBeNull();

    expect(
      normalizeRideContinuation({
        transferJourney: { id: "journey-1" },
        destination: {
          id: "stop:32",
          kind: "public-stop",
          label: "Puistokatu",
          primaryStopId: "32",
          acceptableStopIds: ["32"],
        },
      })
    ).toEqual({
      transferJourney: { id: "journey-1" },
      finalWalk: null,
      destination: {
        id: "stop:32",
        kind: "public-stop",
        label: "Puistokatu",
        primaryStopId: "32",
        acceptableStopIds: ["32"],
      },
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

  it("persists one active continuation with the ride expiry", () => {
    const expiry = futureExpiry();
    const continuation = {
      transferJourney: { id: "journey-1" },
      finalWalk: null,
      destination: {
        id: "stop:32",
        kind: "public-stop",
        label: "Puistokatu",
        primaryStopId: "32",
        acceptableStopIds: ["32"],
      },
    };

    expect(
      persistRideContinuation("ride-1", continuation, expiry)
    ).toEqual(continuation);
    expect(readRideContinuation("ride-1")).toEqual(continuation);

    expect(
      JSON.parse(
        globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
      )
    ).toMatchObject({
      rideId: "ride-1",
      expiresAt: expiry,
      continuation,
    });
  });

  it("is shared across tabs but expires with the active ride", () => {
    const expiry = futureExpiry();
    persistRideContinuation(
      "ride-1",
      { transferJourney: { id: "journey-1" } },
      expiry
    );

    expect(readRideContinuation("ride-1", expiry - 1)).toMatchObject({
      transferJourney: { id: "journey-1" },
    });
    expect(readRideContinuation("ride-1", expiry)).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("never hands one ride another ride's continuation", () => {
    persistRideContinuation(
      "ride-1",
      { transferJourney: { id: "journey-1" } },
      futureExpiry()
    );

    expect(readRideContinuation("ride-2")).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("cleans empty or malformed stored continuation records", () => {
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        expiresAt: futureExpiry(),
        continuation: {},
      })
    );
    expect(readRideContinuation("ride-1")).toBeNull();

    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );
    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("returns no continuation without a ride id or storage record", () => {
    expect(readRideContinuation("")).toBeNull();
    expect(readRideContinuation(null)).toBeNull();
    expect(readRideContinuation("ride-1")).toBeNull();
  });

  it("does not persist missing, expired or empty active state", () => {
    const continuation = {
      transferJourney: { id: "journey-1" },
    };

    expect(
      persistRideContinuation("", continuation, futureExpiry())
    ).toMatchObject({
      transferJourney: { id: "journey-1" },
    });
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();

    persistRideContinuation("ride-1", continuation, Date.now() - 1);
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();

    persistRideContinuation("ride-1", null, futureExpiry());
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("clears only the matching active ride unless explicitly cleared", () => {
    persistRideContinuation(
      "ride-1",
      { transferJourney: { id: "journey-1" } },
      futureExpiry()
    );

    clearRideContinuation("ride-2");
    expect(readRideContinuation("ride-1")).toMatchObject({
      transferJourney: { id: "journey-1" },
    });

    clearRideContinuation("ride-1");
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();

    persistRideContinuation(
      "ride-3",
      { transferJourney: { id: "journey-3" } },
      futureExpiry()
    );
    clearRideContinuation();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("cleans malformed data when clearing a ride", () => {
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );

    expect(() => clearRideContinuation("ride-1")).not.toThrow();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("keeps in-memory continuity when Web Storage writes are blocked", () => {
    const blocked = vi
      .spyOn(globalThis.Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(
      persistRideContinuation(
        "ride-1",
        { transferJourney: { id: "journey-1" } },
        futureExpiry()
      )
    ).toMatchObject({
      transferJourney: { id: "journey-1" },
    });

    blocked.mockRestore();
  });
});
