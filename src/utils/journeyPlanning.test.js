import { expect, test } from "vitest";
import {
  DEFAULT_JOURNEY_PLAN,
  journeyPlanAllowsOption,
  journeyPlanInputValue,
  journeySearchReferenceSec,
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
