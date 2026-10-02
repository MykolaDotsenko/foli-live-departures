import { expect, test } from "vitest";
import {
  DEFAULT_JOURNEY_PLAN,
  MORE_BUFFER_MIN_SLACK_SEC,
  compareJourneyOptions,
  finalArrivalAt,
  firstDepartureAt,
  journeyPlanAllowsOption,
  journeyPlanInputValue,
  journeyPlanKey,
  journeySearchReferenceSec,
  journeyTransferCount,
  journeyWalkingMeters,
  minimumTransferSlackSec,
  normalizeJourneyPlan,
  serviceWallTimeToEpochSec,
} from "./journeyPlanning";

test("normalizes unsupported planning values fail closed", () => {
  expect(normalizeJourneyPlan({ mode: "x", preference: "x" })).toEqual(
    DEFAULT_JOURNEY_PLAN
  );
});

test("converts Helsinki wall time independent of the device zone", () => {
  expect(serviceWallTimeToEpochSec("2026-01-15T12:00")).toBe(
    Date.parse("2026-01-15T10:00:00Z") / 1000
  );
  expect(serviceWallTimeToEpochSec("2026-07-15T12:00")).toBe(
    Date.parse("2026-07-15T09:00:00Z") / 1000
  );
  expect(
    journeyPlanInputValue(Date.parse("2026-07-15T09:00:00Z") / 1000)
  ).toBe("2026-07-15T12:00");
});

test("rejects a non-existent Helsinki DST wall time and disambiguates fall-back", () => {
  expect(serviceWallTimeToEpochSec("2026-03-29T03:30")).toBeNull();
  expect(serviceWallTimeToEpochSec("2026-10-25T03:30")).toBe(
    Date.parse("2026-10-25T00:30:00Z") / 1000
  );
  expect(
    serviceWallTimeToEpochSec("2026-10-25T03:30", { prefer: "latest" })
  ).toBe(Date.parse("2026-10-25T01:30:00Z") / 1000);
});

test("leave-at and arrive-by constrain concrete options", () => {
  const option = {
    legs: [{ departureAt: 2_000 }],
    journeyArrivalAt: 3_000,
  };
  expect(
    journeyPlanAllowsOption(option, {
      mode: "leave-at",
      targetTimeSec: 1_900,
      preference: "balanced",
    }, 1_000)
  ).toBe(true);
  expect(
    journeyPlanAllowsOption(option, {
      mode: "leave-at",
      targetTimeSec: 2_100,
      preference: "balanced",
    }, 1_000)
  ).toBe(false);
  expect(
    journeyPlanAllowsOption(option, {
      mode: "arrive-by",
      targetTimeSec: 3_100,
      preference: "balanced",
    }, 1_000)
  ).toBe(true);
  expect(
    journeyPlanAllowsOption(option, {
      mode: "arrive-by",
      targetTimeSec: 2_900,
      preference: "balanced",
    }, 1_000)
  ).toBe(false);
});

test("arrive-by searches a bounded window before the requested arrival", () => {
  expect(
    journeySearchReferenceSec(
      { mode: "arrive-by", targetTimeSec: 40_000, preference: "balanced" },
      1_000
    )
  ).toBe(11_200);
});


test("normalizes valid modes, positive targets and preferences", () => {
  expect(
    normalizeJourneyPlan({
      mode: "leave-at",
      targetTimeSec: 2_000,
      preference: "less-walking",
    })
  ).toEqual({
    mode: "leave-at",
    targetTimeSec: 2_000,
    preference: "less-walking",
  });
  expect(
    normalizeJourneyPlan({
      mode: "arrive-by",
      targetTimeSec: -1,
      preference: "more-buffer",
    })
  ).toEqual({
    mode: "arrive-by",
    targetTimeSec: null,
    preference: "more-buffer",
  });
});

test("journey plan key is deterministic and excludes leave-now target noise", () => {
  expect(
    journeyPlanKey({
      mode: "leave-now",
      targetTimeSec: 9_999,
      preference: "fewer-transfers",
    })
  ).toBe("leave-now::fewer-transfers");
  expect(
    journeyPlanKey({
      mode: "arrive-by",
      targetTimeSec: 5_000,
      preference: "balanced",
    })
  ).toBe("arrive-by:5000:balanced");
});

test("extracts first departure from direct or itinerary options fail closed", () => {
  expect(firstDepartureAt({ departure: { departureAt: 10 } })).toBe(10);
  expect(firstDepartureAt({ legs: [{ departureAt: 20 }] })).toBe(20);
  expect(firstDepartureAt({ legs: [{ departureAt: 0 }] })).toBeNull();
  expect(firstDepartureAt(null)).toBeNull();
});

test("extracts final door arrival in priority order", () => {
  expect(
    finalArrivalAt({
      departure: {
        journeyArrivalAt: 100,
        destinationArrivalAt: 90,
      },
      journeyArrivalAt: 80,
    })
  ).toBe(100);
  expect(
    finalArrivalAt({
      departure: { destinationArrivalAt: 90 },
      journeyArrivalAt: 80,
    })
  ).toBe(90);
  expect(finalArrivalAt({ journeyArrivalAt: 80 })).toBe(80);
  expect(finalArrivalAt({ destinationArrivalAt: 70 })).toBe(70);
  expect(finalArrivalAt({})).toBeNull();
});

test("counts transfers from explicit transfers or transit legs", () => {
  expect(journeyTransferCount({ transfers: [{}, {}] })).toBe(2);
  expect(journeyTransferCount({ legs: [{}, {}, {}] })).toBe(2);
  expect(journeyTransferCount({})).toBe(0);
});

test("computes walking from direct board/final walk or itinerary total", () => {
  expect(
    journeyWalkingMeters({
      distanceMeters: 120,
      departure: { finalWalkDistanceM: 80 },
    })
  ).toBe(200);
  expect(
    journeyWalkingMeters({
      distanceMeters: -5,
      departure: { finalWalkDistanceM: 80 },
    })
  ).toBe(80);
  expect(journeyWalkingMeters({ totalWalkingDistanceM: 450 })).toBe(450);
  expect(journeyWalkingMeters({ totalWalkingDistanceM: -1 })).toBe(
    Number.POSITIVE_INFINITY
  );
});

test("minimum transfer slack handles direct, finite and unknown transfers", () => {
  expect(minimumTransferSlackSec({ transfers: [] })).toBe(
    Number.POSITIVE_INFINITY
  );
  expect(
    minimumTransferSlackSec({
      transfers: [
        { feasibility: { slackSec: 420 } },
        { feasibility: { slackSec: 360 } },
      ],
    })
  ).toBe(360);
  expect(
    minimumTransferSlackSec({
      transfers: [
        { feasibility: { slackSec: 420 } },
        { feasibility: { slackSec: null } },
      ],
    })
  ).toBe(Number.NEGATIVE_INFINITY);
});

test("more-buffer is a hard five-minute transfer constraint", () => {
  const safe = {
    legs: [{ departureAt: 2_000 }],
    journeyArrivalAt: 3_000,
    transfers: [{ feasibility: { slackSec: MORE_BUFFER_MIN_SLACK_SEC } }],
  };
  const unsafe = {
    ...safe,
    transfers: [
      { feasibility: { slackSec: MORE_BUFFER_MIN_SLACK_SEC - 1 } },
    ],
  };
  const plan = {
    mode: "leave-now",
    preference: "more-buffer",
  };

  expect(journeyPlanAllowsOption(safe, plan, 1_000)).toBe(true);
  expect(journeyPlanAllowsOption(unsafe, plan, 1_000)).toBe(false);
});

function option({
  departureAt,
  arrivalAt,
  transfers = 0,
  walking = 0,
  slack = 600,
}) {
  return {
    legs: [
      { departureAt },
      ...Array.from({ length: transfers }, () => ({ departureAt })),
    ],
    transfers: Array.from({ length: transfers }, () => ({
      feasibility: { slackSec: slack },
    })),
    journeyArrivalAt: arrivalAt,
    totalWalkingDistanceM: walking,
  };
}

test("balanced comparison keeps clock intent ahead of convenience metrics", () => {
  const early = option({
    departureAt: 2_000,
    arrivalAt: 3_000,
    transfers: 2,
    walking: 900,
  });
  const late = option({
    departureAt: 1_900,
    arrivalAt: 3_300,
    transfers: 0,
    walking: 10,
  });

  expect(compareJourneyOptions(early, late, { preference: "balanced" })).toBeLessThan(0);
});

test("fewer-transfers may trade at most ten minutes of arrival time", () => {
  const simple = option({
    departureAt: 2_000,
    arrivalAt: 3_500,
    transfers: 0,
    walking: 500,
  });
  const complex = option({
    departureAt: 1_900,
    arrivalAt: 3_000,
    transfers: 2,
    walking: 100,
  });

  expect(
    compareJourneyOptions(simple, complex, {
      preference: "fewer-transfers",
    })
  ).toBeLessThan(0);

  simple.journeyArrivalAt = 3_700;
  expect(
    compareJourneyOptions(simple, complex, {
      preference: "fewer-transfers",
    })
  ).toBeGreaterThan(0);
});

test("less-walking and more-buffer rank only finite meaningful differences", () => {
  const left = option({
    departureAt: 2_000,
    arrivalAt: 3_000,
    transfers: 1,
    walking: 100,
    slack: 700,
  });
  const right = option({
    departureAt: 2_100,
    arrivalAt: 3_100,
    transfers: 1,
    walking: 500,
    slack: 400,
  });

  expect(
    compareJourneyOptions(left, right, { preference: "less-walking" })
  ).toBeLessThan(0);
  expect(
    compareJourneyOptions(left, right, { preference: "more-buffer" })
  ).toBeLessThan(0);
});

test("arrive-by comparison prefers the latest viable departure", () => {
  const earlierDeparture = option({
    departureAt: 2_000,
    arrivalAt: 2_900,
  });
  const laterDeparture = option({
    departureAt: 2_300,
    arrivalAt: 2_950,
  });

  expect(
    compareJourneyOptions(earlierDeparture, laterDeparture, {
      mode: "arrive-by",
      targetTimeSec: 3_000,
      preference: "balanced",
    })
  ).toBeGreaterThan(0);
});

test("comparison falls through to transfer, walking and departure tie-breaks", () => {
  const base = option({
    departureAt: 2_000,
    arrivalAt: 3_000,
    transfers: 1,
    walking: 100,
  });
  const moreTransfers = option({
    departureAt: 2_000,
    arrivalAt: 3_000,
    transfers: 2,
    walking: 50,
  });
  expect(compareJourneyOptions(base, moreTransfers, null)).toBeLessThan(0);

  const moreWalking = option({
    departureAt: 2_000,
    arrivalAt: 3_000,
    transfers: 1,
    walking: 200,
  });
  expect(compareJourneyOptions(base, moreWalking, null)).toBeLessThan(0);

  const laterDeparture = option({
    departureAt: 2_100,
    arrivalAt: 3_000,
    transfers: 1,
    walking: 100,
  });
  expect(compareJourneyOptions(base, laterDeparture, null)).toBeLessThan(0);
});


test("unknown transfer slack variants all fail closed", () => {
  for (const slackSec of [null, undefined, "", "not-a-number"]) {
    expect(
      minimumTransferSlackSec({
        transfers: [{ feasibility: { slackSec } }],
      })
    ).toBe(Number.NEGATIVE_INFINITY);
  }
  expect(
    minimumTransferSlackSec({
      transfers: [{ feasibility: { slackSec: "360" } }],
    })
  ).toBe(360);
});

test("walking metrics cover partial direct data and absent totals", () => {
  expect(
    journeyWalkingMeters({
      distanceMeters: 125,
      departure: { finalWalkDistanceM: undefined },
    })
  ).toBe(125);
  expect(
    journeyWalkingMeters({
      distanceMeters: undefined,
      departure: { finalWalkDistanceM: 75 },
    })
  ).toBe(75);
  expect(journeyWalkingMeters({})).toBe(Number.POSITIVE_INFINITY);
});

test("preference comparison falls back safely when arrival or metrics are unknown", () => {
  const unknown = {
    legs: [{ departureAt: 2_000 }],
    transfers: [{ feasibility: { slackSec: null } }],
  };
  const known = {
    legs: [{ departureAt: 2_100 }],
    transfers: [{ feasibility: { slackSec: 600 } }],
    journeyArrivalAt: 3_000,
    totalWalkingDistanceM: 100,
  };

  // Missing door arrival makes the preference trade-off unbounded, so time
  // semantics/fallback ordering wins rather than pretending the option is
  // comparable.
  expect(
    compareJourneyOptions(unknown, known, {
      preference: "less-walking",
    })
  ).toBeGreaterThan(0);
  expect(
    compareJourneyOptions(unknown, known, {
      preference: "more-buffer",
    })
  ).toBeGreaterThan(0);
});

test("more-buffer accepts direct journeys with no transfer constraint", () => {
  expect(
    journeyPlanAllowsOption(
      {
        legs: [{ departureAt: 2_000 }],
        journeyArrivalAt: 3_000,
        transfers: [],
      },
      { mode: "leave-now", preference: "more-buffer" },
      1_000
    )
  ).toBe(true);
});

test("option accessors handle empty leg collections and invalid arrivals", () => {
  expect(firstDepartureAt({ legs: [] })).toBeNull();
  expect(finalArrivalAt({ journeyArrivalAt: 0, destinationArrivalAt: -1 })).toBeNull();
  expect(journeyTransferCount({ legs: [] })).toBe(0);
});
