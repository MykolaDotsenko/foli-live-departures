import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agedLiveEtaSec,
  agedProviderPositionAgeSec,
  providerDistanceToTarget,
  readArrivalSignals,
  targetAnswerAgeSec,
  trackingHealth,
} from "./rideFeedEvidence";
import { emptyRuntime } from "./rideSession";

const NOW = 1_700_000_000_000;
const targetStop = { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 };

function runtime(overrides = {}) {
  return { ...emptyRuntime(), ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trackingHealth", () => {
  it("is live, then delayed, then back on the timetable as a match ages", () => {
    expect(trackingHealth(runtime({ lastLiveMatchAt: NOW - 45_000 }), true)).toBe(
      "live"
    );
    expect(
      trackingHealth(runtime({ lastLiveMatchAt: NOW - 120_000 }), true)
    ).toBe("delayed");
    expect(
      trackingHealth(runtime({ lastLiveMatchAt: NOW - 120_001 }), true)
    ).toBe("schedule");
  });

  it("is the timetable offline or before any live match", () => {
    expect(trackingHealth(runtime({ lastLiveMatchAt: NOW }), false)).toBe(
      "schedule"
    );
    expect(trackingHealth(runtime(), true)).toBe("schedule");
  });
});

describe("the exit stop's live row", () => {
  it("measures the bus's distance only when both positions are known", () => {
    expect(
      providerDistanceToTarget({ latitude: 60.4488, longitude: 22.255 }, targetStop)
    ).toBe(0);
    expect(providerDistanceToTarget({}, targetStop)).toBeNull();
    expect(
      providerDistanceToTarget({ latitude: 60.4, longitude: 22.2 }, { id: "32" })
    ).toBeNull();
  });

  it("reads the estimate, distance and position age from one row", () => {
    const serverTime = NOW / 1000;
    expect(
      readArrivalSignals(
        {
          expectedarrivaltime: serverTime + 90,
          recordedattime: serverTime - 12,
          latitude: 60.4488,
          longitude: 22.255,
        },
        serverTime,
        targetStop
      )
    ).toEqual({ liveEtaSec: 90, providerDistanceM: 0, providerPositionAgeSec: 12 });
  });
});

describe("ageing the exit stop's answer", () => {
  it("knows no exit-stop answer before the bus was ever listed", () => {
    expect(targetAnswerAgeSec(null, NOW)).toBeNull();
    expect(targetAnswerAgeSec(0, NOW)).toBeNull();
    expect(targetAnswerAgeSec(NOW - 30_000, NOW)).toBe(30);
  });

  it("counts the live estimate down until the answer is too old", () => {
    const answer = runtime({ liveEtaSec: 100 });
    expect(agedLiveEtaSec(answer, 30)).toBe(70);
    expect(agedLiveEtaSec(answer, 120)).toBe(-20);
    expect(agedLiveEtaSec(answer, 121)).toBeNull();
    expect(agedLiveEtaSec(answer, null)).toBeNull();
    expect(agedLiveEtaSec(runtime({ liveEtaSec: null }), 5)).toBeNull();
  });

  it("grows the bus position's age by the time since its answer", () => {
    expect(
      agedProviderPositionAgeSec(runtime({ providerPositionAgeSec: 10 }), 30)
    ).toBe(40);
    expect(
      agedProviderPositionAgeSec(runtime({ providerPositionAgeSec: 10 }), null)
    ).toBeNull();
    expect(
      agedProviderPositionAgeSec(runtime({ providerPositionAgeSec: null }), 30)
    ).toBeNull();
  });
});

