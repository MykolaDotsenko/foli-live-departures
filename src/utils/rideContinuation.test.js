import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_CONTINUATION_STORAGE_KEY,
  clearRideContinuation,
  normalizeRideContinuation,
  persistRideContinuation,
  readDurableRideContinuation,
  readRideContinuation,
  rideContinuationCanPersistDurably,
  syncDurableRideContinuationEvent,
} from "./rideContinuation";

const futureExpiry = () => Date.now() + 60_000;
const publicDestination = {
  id: "stop:32",
  kind: "public-stop",
  label: "Puistokatu",
  primaryStopId: "32",
  acceptableStopIds: ["32"],
};
const externalDestination = {
  id: "external:test",
  kind: "external-place",
  label: "Private destination",
  primaryStopId: "32",
  acceptableStopIds: ["32"],
  lat: 60.45,
  lon: 22.27,
};

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

describe("ride continuation", () => {
  it("normalizes supported continuation records", () => {
    expect(normalizeRideContinuation(null)).toBeNull();
    expect(normalizeRideContinuation([])).toBeNull();
    expect(normalizeRideContinuation({})).toBeNull();
    expect(
      normalizeRideContinuation({
        transferJourney: { id: "journey-1" },
        destination: publicDestination,
      })
    ).toEqual({
      transferJourney: { id: "journey-1" },
      finalWalk: null,
      destination: publicDestination,
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

  it("classifies every durable-privacy branch explicitly", () => {
    expect(rideContinuationCanPersistDurably(null)).toBe(false);
    expect(
      rideContinuationCanPersistDurably({
        transferJourney: {
          id: "journey-public",
          destinationKind: "public-stop",
        },
        finalWalk: null,
      })
    ).toBe(true);
    expect(
      rideContinuationCanPersistDurably({
        transferJourney: {
          id: "journey-saved",
          destinationKind: "saved-place",
        },
        finalWalk: null,
      })
    ).toBe(true);
    expect(
      rideContinuationCanPersistDurably({
        transferJourney: {
          id: "journey-private",
          destinationKind: "external-place",
        },
        finalWalk: null,
      })
    ).toBe(false);
    expect(
      rideContinuationCanPersistDurably({
        transferJourney: {
          id: "journey-public",
          destinationKind: "public-stop",
        },
        finalWalk: { fromStopId: "32" },
      })
    ).toBe(false);
  });

  it("uses same-tab state first but exposes durable state for storage events", () => {
    const expiry = futureExpiry();
    const sessionContinuation = {
      transferJourney: {
        id: "journey-1",
        revision: 1,
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };
    const durableContinuation = {
      transferJourney: {
        id: "journey-1",
        revision: 2,
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };

    globalThis.sessionStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        expiresAt: expiry,
        continuation: sessionContinuation,
      })
    );
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        expiresAt: expiry,
        continuation: durableContinuation,
      })
    );

    expect(readRideContinuation("ride-1")).toMatchObject({
      transferJourney: { revision: 1 },
    });
    expect(readDurableRideContinuation("ride-1")).toMatchObject({
      transferJourney: { revision: 2 },
    });
    expect(readDurableRideContinuation("")).toBeNull();
  });

  it("falls back to durable state when same-tab state is absent or invalid", () => {
    const expiry = futureExpiry();
    const continuation = {
      transferJourney: {
        id: "journey-1",
        destinationKind: "saved-place",
      },
      destination: {
        ...publicDestination,
        id: "place:home",
        kind: "saved-place",
        label: "Home",
      },
    };

    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        expiresAt: expiry,
        continuation,
      })
    );
    expect(readRideContinuation("ride-1")).toEqual(
      normalizeRideContinuation(continuation)
    );

    globalThis.sessionStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "wrong-ride",
        expiresAt: expiry,
        continuation,
      })
    );
    expect(readRideContinuation("ride-1")).toEqual(
      normalizeRideContinuation(continuation)
    );
  });

  it("drops expired and malformed durable state without deleting another ride", () => {
    const continuation = {
      transferJourney: {
        id: "journey-1",
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };

    const otherRideValue = JSON.stringify({
      rideId: "wrong-ride",
      expiresAt: futureExpiry(),
      continuation,
    });
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      otherRideValue
    );
    expect(readDurableRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBe(otherRideValue);

    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-1",
        expiresAt: Date.now() - 1,
        continuation,
      })
    );
    expect(readDurableRideContinuation("ride-1")).toBeNull();

    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );
    expect(readDurableRideContinuation("ride-1")).toBeNull();
  });

  it("syncs only matching durable events into this tab's reload state", () => {
    const expiry = futureExpiry();
    const oldContinuation = {
      transferJourney: {
        id: "journey-1",
        revision: 1,
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };
    const nextContinuation = {
      transferJourney: {
        id: "journey-1",
        revision: 2,
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };

    persistRideContinuation("ride-1", oldContinuation, expiry);

    const otherRideValue = JSON.stringify({
      rideId: "ride-2",
      expiresAt: expiry,
      continuation: nextContinuation,
    });
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      otherRideValue
    );
    expect(
      syncDurableRideContinuationEvent("ride-1", otherRideValue)
    ).toEqual({ applies: false, continuation: null });
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBe(otherRideValue);

    const sameRideValue = JSON.stringify({
      rideId: "ride-1",
      expiresAt: expiry,
      continuation: nextContinuation,
    });
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      sameRideValue
    );
    expect(
      syncDurableRideContinuationEvent("ride-1", sameRideValue)
    ).toEqual({
      applies: true,
      continuation: normalizeRideContinuation(nextContinuation),
    });
    expect(readRideContinuation("ride-1")).toMatchObject({
      transferJourney: { revision: 2 },
    });

    expect(
      syncDurableRideContinuationEvent(
        "ride-1",
        null,
        sameRideValue
      )
    ).toEqual({ applies: true, continuation: null });
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("ignores malformed or unidentifiable continuation storage events", () => {
    expect(
      syncDurableRideContinuationEvent("ride-1", "{bad json")
    ).toEqual({ applies: false, continuation: null });
    expect(
      syncDurableRideContinuationEvent("ride-1", JSON.stringify({}))
    ).toEqual({ applies: false, continuation: null });
    expect(
      syncDurableRideContinuationEvent("", JSON.stringify({ rideId: "ride-1" }))
    ).toEqual({ applies: false, continuation: null });
  });

  it("mirrors privacy-safe public continuation into durable storage", () => {
    const expiry = futureExpiry();
    const continuation = {
      transferJourney: {
        id: "journey-1",
        destinationKind: "public-stop",
      },
      finalWalk: null,
      destination: publicDestination,
    };

    expect(rideContinuationCanPersistDurably(continuation)).toBe(true);
    expect(
      persistRideContinuation("ride-1", continuation, expiry)
    ).toEqual(continuation);
    expect(readRideContinuation("ride-1")).toEqual(continuation);

    for (const target of [
      globalThis.sessionStorage,
      globalThis.localStorage,
    ]) {
      expect(
        JSON.parse(target.getItem(RIDE_CONTINUATION_STORAGE_KEY))
      ).toMatchObject({
        rideId: "ride-1",
        expiresAt: expiry,
        continuation,
      });
    }
  });

  it("keeps private external continuation session-only", () => {
    const expiry = futureExpiry();
    const continuation = {
      transferJourney: {
        id: "journey-private",
        destinationKind: "external-place",
        destinationLabel: "Private destination",
      },
      finalWalk: {
        destinationLabel: "Private destination",
        lat: 60.45,
        lon: 22.27,
        fromStopId: "32",
      },
      destination: externalDestination,
    };

    expect(rideContinuationCanPersistDurably(continuation)).toBe(false);
    persistRideContinuation("ride-private", continuation, expiry);

    expect(readRideContinuation("ride-private")).toEqual(continuation);
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toContain("Private destination");
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("rejects a private continuation found in durable storage", () => {
    const expiry = futureExpiry();
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: "ride-private",
        expiresAt: expiry,
        continuation: {
          transferJourney: {
            id: "journey-private",
            destinationKind: "external-place",
          },
          finalWalk: null,
          destination: externalDestination,
        },
      })
    );

    expect(readRideContinuation("ride-private")).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("expires both session and durable continuation with the ride", () => {
    const expiry = futureExpiry();
    const continuation = {
      transferJourney: {
        id: "journey-1",
        destinationKind: "public-stop",
      },
      destination: publicDestination,
    };
    persistRideContinuation("ride-1", continuation, expiry);

    expect(readRideContinuation("ride-1", expiry - 1)).toMatchObject({
      transferJourney: { id: "journey-1" },
    });
    expect(readRideContinuation("ride-1", expiry)).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("never hands one ride another ride's continuation or deletes its durable owner", () => {
    persistRideContinuation(
      "ride-1",
      {
        transferJourney: {
          id: "journey-1",
          destinationKind: "public-stop",
        },
        destination: publicDestination,
      },
      futureExpiry()
    );
    const durableOwner = globalThis.localStorage.getItem(
      RIDE_CONTINUATION_STORAGE_KEY
    );

    expect(readRideContinuation("ride-2")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBe(durableOwner);
  });

  it("cleans malformed and empty stored records", () => {
    for (const target of [
      globalThis.sessionStorage,
      globalThis.localStorage,
    ]) {
      target.setItem(
        RIDE_CONTINUATION_STORAGE_KEY,
        JSON.stringify({
          rideId: "ride-1",
          expiresAt: futureExpiry(),
          continuation: {},
        })
      );
    }
    expect(readRideContinuation("ride-1")).toBeNull();

    globalThis.sessionStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );
    globalThis.localStorage.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      "{bad json"
    );
    expect(readRideContinuation("ride-1")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("does not persist missing or expired active state", () => {
    const continuation = {
      transferJourney: { id: "journey-1" },
    };

    expect(
      persistRideContinuation("", continuation, futureExpiry())
    ).toMatchObject({
      transferJourney: { id: "journey-1" },
    });
    expect(readRideContinuation("")).toBeNull();

    persistRideContinuation("ride-1", continuation, Date.now() - 1);
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();

    persistRideContinuation("ride-1", null, futureExpiry());
    expect(readRideContinuation("ride-1")).toBeNull();
  });

  it("clears matching continuation from both storage scopes", () => {
    persistRideContinuation(
      "ride-1",
      {
        transferJourney: {
          id: "journey-1",
          destinationKind: "public-stop",
        },
        destination: publicDestination,
      },
      futureExpiry()
    );

    clearRideContinuation("ride-2");
    expect(readRideContinuation("ride-1")).not.toBeNull();

    clearRideContinuation("ride-1");
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();

    persistRideContinuation(
      "ride-3",
      {
        transferJourney: {
          id: "journey-3",
          destinationKind: "public-stop",
        },
        destination: publicDestination,
      },
      futureExpiry()
    );
    clearRideContinuation();
    expect(readRideContinuation("ride-3")).toBeNull();
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
