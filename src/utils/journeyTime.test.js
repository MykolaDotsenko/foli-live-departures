import { describe, expect, test } from "vitest";
import {
  ARRIVE_BY_LOOKBACK_SEC,
  compareJourneyTimeCandidates,
  formatServiceDateTimeLocal,
  journeyTimeAllows,
  normalizeJourneyTimeConstraint,
  parseServiceDateTimeLocal,
} from "./journeyTime";

describe("Helsinki journey wall time", () => {
  test("round-trips an ordinary local wall time independent of device zone", () => {
    const epoch = parseServiceDateTimeLocal("2026-10-02T18:30");
    expect(epoch).toBeTypeOf("number");
    expect(formatServiceDateTimeLocal(epoch)).toBe("2026-10-02T18:30");
  });

  test("rejects the spring-forward hour that does not exist", () => {
    expect(parseServiceDateTimeLocal("2026-03-29T03:30")).toBeNull();
  });

  test("resolves the repeated autumn hour deterministically to the earlier instant", () => {
    const epoch = parseServiceDateTimeLocal("2026-10-25T03:30");
    expect(epoch).toBeTypeOf("number");
    expect(formatServiceDateTimeLocal(epoch)).toBe("2026-10-25T03:30");
    // The later physical occurrence is exactly one hour later and renders the
    // same Helsinki wall-clock time during the DST overlap.
    expect(formatServiceDateTimeLocal(epoch + 3600)).toBe("2026-10-25T03:30");
  });

  test("rejects malformed or impossible local values and empty format inputs", () => {
    expect(parseServiceDateTimeLocal("not-a-date")).toBeNull();
    expect(parseServiceDateTimeLocal("2026-02-31T12:00")).toBeNull();
    expect(parseServiceDateTimeLocal("2026-10-02T25:00")).toBeNull();
    expect(formatServiceDateTimeLocal(null)).toBe("");
    expect(formatServiceDateTimeLocal(0)).toBe("");
  });

  test("can select the later physical instant in the repeated autumn hour", () => {
    const earlier = parseServiceDateTimeLocal("2026-10-25T03:30", {
      prefer: "earliest",
    });
    const later = parseServiceDateTimeLocal("2026-10-25T03:30", {
      prefer: "latest",
    });

    expect(earlier).toBeTypeOf("number");
    expect(later).toBe(earlier + 3600);
    expect(formatServiceDateTimeLocal(later)).toBe("2026-10-25T03:30");
  });
});

describe("journey time constraints", () => {
  const now = 10_000;

  test("leave-now starts from current service time", () => {
    expect(normalizeJourneyTimeConstraint({ mode: "leave-now" }, now)).toEqual({
      mode: "leave-now",
      valid: true,
      targetTimeSec: null,
      referenceTimeSec: now,
      earliestDepartureAt: now,
      arriveByTimeSec: null,
    });
  });

  test("leave-at uses the selected wall-clock instant as lower bound", () => {
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: 12_000 },
        now
      )
    ).toMatchObject({
      valid: true,
      referenceTimeSec: 12_000,
      earliestDepartureAt: 12_000,
      arriveByTimeSec: null,
    });
  });

  test("arrive-by uses a bounded lookback and hard arrival deadline", () => {
    const target = now + 10 * 60 * 60;
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "arrive-by", targetTimeSec: target },
        now
      )
    ).toMatchObject({
      valid: true,
      referenceTimeSec: target - ARRIVE_BY_LOOKBACK_SEC,
      earliestDepartureAt: target - ARRIVE_BY_LOOKBACK_SEC,
      arriveByTimeSec: target,
    });
  });

  test("past and missing scheduled targets fail closed", () => {
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: null },
        now
      ).valid
    ).toBe(false);
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "arrive-by", targetTimeSec: now - 60 },
        now
      ).valid
    ).toBe(false);
  });

  test("unknown modes fall back to leave-now and scheduled targets respect the 30-second grace boundary", () => {
    expect(
      normalizeJourneyTimeConstraint(
        { mode: /** @type {any} */ ("teleport"), targetTimeSec: now + 500 },
        now
      )
    ).toMatchObject({
      mode: "leave-now",
      valid: true,
      earliestDepartureAt: now,
      arriveByTimeSec: null,
    });

    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: now - 30 },
        now
      ).valid
    ).toBe(false);
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: now - 29 },
        now
      ).valid
    ).toBe(true);
  });

  test("filters leave-at and arrive-by candidates", () => {
    expect(
      journeyTimeAllows(
        { departureAt: 12_100, journeyArrivalAt: 13_000 },
        { mode: "leave-at", targetTimeSec: 12_000 },
        now
      )
    ).toBe(true);
    expect(
      journeyTimeAllows(
        { departureAt: 11_000, journeyArrivalAt: 13_000 },
        { mode: "leave-at", targetTimeSec: 12_000 },
        now
      )
    ).toBe(false);
    expect(
      journeyTimeAllows(
        { departureAt: 12_100, journeyArrivalAt: 13_001 },
        { mode: "arrive-by", targetTimeSec: 13_000 },
        now
      )
    ).toBe(false);
  });

  test("fails closed on incomplete candidates and accepts destination-arrival fallback at exact boundaries", () => {
    expect(
      journeyTimeAllows(
        { departureAt: null, journeyArrivalAt: 13_000 },
        { mode: "leave-now" },
        now
      )
    ).toBe(false);
    expect(
      journeyTimeAllows(
        { departureAt: 12_000, journeyArrivalAt: null, destinationArrivalAt: null },
        { mode: "leave-now" },
        now
      )
    ).toBe(false);

    expect(
      journeyTimeAllows(
        { departureAt: 11_970, destinationArrivalAt: 13_000 },
        { mode: "leave-at", targetTimeSec: 12_000 },
        now
      )
    ).toBe(true);

    expect(
      journeyTimeAllows(
        { departureAt: 12_000, destinationArrivalAt: 13_000 },
        { mode: "arrive-by", targetTimeSec: 13_000 },
        now
      )
    ).toBe(true);
  });

  test("arrive-by ranks the latest viable departure first", () => {
    const early = { departureAt: 11_000, journeyArrivalAt: 12_000 };
    const late = { departureAt: 11_500, journeyArrivalAt: 12_500 };
    expect(
      [early, late].sort((a, b) =>
        compareJourneyTimeCandidates(a, b, { mode: "arrive-by" })
      )
    ).toEqual([late, early]);
  });

  test("ranking uses deterministic tie-breaks for both arrive-by and ordinary modes", () => {
    const sameDepartureEarlierArrival = {
      departureAt: 11_500,
      journeyArrivalAt: 12_200,
    };
    const sameDepartureLaterArrival = {
      departureAt: 11_500,
      journeyArrivalAt: 12_400,
    };
    expect(
      compareJourneyTimeCandidates(
        sameDepartureEarlierArrival,
        sameDepartureLaterArrival,
        { mode: "arrive-by" }
      )
    ).toBeLessThan(0);

    const sameArrivalEarlyDeparture = {
      departureAt: 11_000,
      journeyArrivalAt: 12_400,
    };
    const sameArrivalLateDeparture = {
      departureAt: 11_300,
      journeyArrivalAt: 12_400,
    };
    expect(
      compareJourneyTimeCandidates(
        sameArrivalEarlyDeparture,
        sameArrivalLateDeparture,
        { mode: "leave-now" }
      )
    ).toBeLessThan(0);

    expect(
      compareJourneyTimeCandidates(
        { departureAt: null, destinationArrivalAt: null },
        { departureAt: 12_000, destinationArrivalAt: 13_000 },
        { mode: "leave-now" }
      )
    ).toBeGreaterThan(0);
  });
});


describe("journey time fail-closed edge matrix", () => {
  const now = 20_000;

  test("rejects malformed and impossible datetime-local values", () => {
    expect(parseServiceDateTimeLocal("")).toBeNull();
    expect(parseServiceDateTimeLocal("2026-10-02 18:30")).toBeNull();
    expect(parseServiceDateTimeLocal("2026-02-30T12:00")).toBeNull();
    expect(parseServiceDateTimeLocal("2026-13-01T12:00")).toBeNull();
  });

  test("formats only positive finite epoch seconds", () => {
    expect(formatServiceDateTimeLocal(null)).toBe("");
    expect(formatServiceDateTimeLocal(0)).toBe("");
    expect(formatServiceDateTimeLocal(-1)).toBe("");
    expect(formatServiceDateTimeLocal(Number.NaN)).toBe("");
  });

  test("fall-back overlap can deliberately choose the later physical instant", () => {
    const early = parseServiceDateTimeLocal("2026-10-25T03:30");
    const late = parseServiceDateTimeLocal("2026-10-25T03:30", {
      prefer: "latest",
    });
    expect(late - early).toBe(3600);
  });

  test("unknown mode becomes leave-now and invalid now falls back to real time", () => {
    const normalized = normalizeJourneyTimeConstraint(
      { mode: "teleport", targetTimeSec: 99_999 },
      Number.NaN
    );
    expect(normalized.mode).toBe("leave-now");
    expect(normalized.valid).toBe(true);
    expect(normalized.targetTimeSec).toBeNull();
    expect(normalized.referenceTimeSec).toBeGreaterThan(0);
    expect(normalized.earliestDepartureAt).toBe(normalized.referenceTimeSec);
  });

  test("scheduled targets fail closed at the 30-second stale cutoff", () => {
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: now - 29 },
        now
      ).valid
    ).toBe(true);
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: now - 30 },
        now
      ).valid
    ).toBe(false);
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "leave-at", targetTimeSec: now - 31 },
        now
      ).valid
    ).toBe(false);
  });

  test("near arrive-by target never searches before now", () => {
    const target = now + 30 * 60;
    const normalized = normalizeJourneyTimeConstraint(
      { mode: "arrive-by", targetTimeSec: target },
      now
    );
    expect(normalized.referenceTimeSec).toBe(now);
    expect(normalized.earliestDepartureAt).toBe(now);
    expect(normalized.arriveByTimeSec).toBe(target);
  });

  test("invalid arrive-by target preserves fail-closed deadline metadata", () => {
    expect(
      normalizeJourneyTimeConstraint(
        { mode: "arrive-by", targetTimeSec: null },
        now
      )
    ).toMatchObject({
      mode: "arrive-by",
      valid: false,
      targetTimeSec: null,
      earliestDepartureAt: null,
      arriveByTimeSec: null,
    });
  });

  test("candidate filtering rejects missing or non-positive times", () => {
    const leaveNow = { mode: "leave-now" };
    expect(journeyTimeAllows({}, leaveNow, now)).toBe(false);
    expect(
      journeyTimeAllows(
        { departureAt: now + 60, journeyArrivalAt: 0 },
        leaveNow,
        now
      )
    ).toBe(false);
    expect(
      journeyTimeAllows(
        { departureAt: 0, journeyArrivalAt: now + 600 },
        leaveNow,
        now
      )
    ).toBe(false);
  });

  test("departure grace accepts 30 seconds early but rejects anything earlier", () => {
    const plan = { mode: "leave-at", targetTimeSec: now + 600 };
    expect(
      journeyTimeAllows(
        {
          departureAt: now + 570,
          destinationArrivalAt: now + 1200,
        },
        plan,
        now
      )
    ).toBe(true);
    expect(
      journeyTimeAllows(
        {
          departureAt: now + 569,
          destinationArrivalAt: now + 1200,
        },
        plan,
        now
      )
    ).toBe(false);
  });

  test("destination arrival is a valid fallback when door arrival is absent", () => {
    expect(
      journeyTimeAllows(
        {
          departureAt: now + 60,
          destinationArrivalAt: now + 600,
        },
        { mode: "arrive-by", targetTimeSec: now + 600 },
        now
      )
    ).toBe(true);
  });

  test("arrive-by tie breaks equal departures by earlier arrival", () => {
    const earlierArrival = {
      departureAt: now + 300,
      journeyArrivalAt: now + 900,
    };
    const laterArrival = {
      departureAt: now + 300,
      journeyArrivalAt: now + 1000,
    };
    expect(
      compareJourneyTimeCandidates(
        earlierArrival,
        laterArrival,
        { mode: "arrive-by" }
      )
    ).toBeLessThan(0);
  });

  test("leave modes rank earlier arrival, then earlier departure", () => {
    const earlierArrival = {
      departureAt: now + 500,
      journeyArrivalAt: now + 900,
    };
    const laterArrival = {
      departureAt: now + 100,
      journeyArrivalAt: now + 1000,
    };
    expect(
      compareJourneyTimeCandidates(earlierArrival, laterArrival, {
        mode: "leave-at",
      })
    ).toBeLessThan(0);

    const earlyDeparture = {
      departureAt: now + 100,
      destinationArrivalAt: now + 900,
    };
    const lateDeparture = {
      departureAt: now + 200,
      destinationArrivalAt: now + 900,
    };
    expect(
      compareJourneyTimeCandidates(earlyDeparture, lateDeparture, {
        mode: "leave-now",
      })
    ).toBeLessThan(0);
  });

  test("comparison remains deterministic with missing candidate timestamps", () => {
    expect(
      compareJourneyTimeCandidates({}, {}, { mode: "leave-now" })
    ).toBe(0);
    expect(
      compareJourneyTimeCandidates(
        {},
        { departureAt: now + 1, destinationArrivalAt: now + 10 },
        { mode: "arrive-by" }
      )
    ).toBeGreaterThan(0);
  });
});
