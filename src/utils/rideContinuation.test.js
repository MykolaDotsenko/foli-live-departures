import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_CONTINUATION_STORAGE_KEY,
  clearRideContinuation,
  normalizeRideContinuation,
  persistRideContinuation,
  readRideContinuation,
  rideContinuationCanPersistDurably,
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

  it("never hands one ride another ride's continuation", () => {
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

    expect(readRideContinuation("ride-2")).toBeNull();
    expect(
      globalThis.sessionStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      globalThis.localStorage.getItem(RIDE_CONTINUATION_STORAGE_KEY)
    ).toBeNull();
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
