import { describe, expect, test } from "vitest";
import {
  buildDirectJourneyOptions,
  collectDirectJourneyCandidates,
  pruneDominatedDirectJourneys,
} from "./directJourneyOptions";

function departure({
  tripRef,
  arrival,
  departureAt = 1_500,
  lineRef = "18",
  catchability = "comfortable",
  liveState = "live",
  catchMarginSec = 300,
  destinationStopId = "900",
}) {
  return {
    tripRef,
    lineRef,
    destinationStopId,
    departureAt,
    destinationArrivalAt: arrival,
    catchability,
    liveState,
    rideDurationSec: null,
    accessSeconds: 120,
    catchMarginSec,
  };
}

function fit(options) {
  return {
    stopId: "",
    status: "good",
    best: options[0] || null,
    options,
    additionalCount: Math.max(0, options.length - 1),
    checkedAt: Date.now(),
  };
}

const stops = [
  { id: "100", name: "Near", distanceMeters: 100 },
  { id: "200", name: "Far", distanceMeters: 400 },
  { id: "300", name: "Middle", distanceMeters: 220 },
];

describe("direct journey alternatives", () => {
  test("collects every valid direct candidate and excludes uncatchable/unknown-arrival rows", () => {
    const candidates = collectDirectJourneyCandidates(stops, {
      "100": fit([
        departure({ tripRef: "near-1", arrival: 2_100 }),
        departure({
          tripRef: "too-late",
          arrival: 2_000,
          catchability: "too-late",
        }),
      ]),
      "200": fit([
        departure({ tripRef: "far-1", arrival: 1_900 }),
        { ...departure({ tripRef: "no-arrival", arrival: 2_500 }), destinationArrivalAt: null },
      ]),
    });

    expect(candidates.map((candidate) => candidate.tripRef)).toEqual([
      "far-1",
      "near-1",
    ]);
  });

  test("prunes a route that is worse on arrival, walking, catchability and live evidence", () => {
    const candidates = collectDirectJourneyCandidates(stops, {
      "100": fit([
        departure({
          tripRef: "better",
          arrival: 2_000,
          catchability: "comfortable",
          liveState: "live",
        }),
      ]),
      "200": fit([
        departure({
          tripRef: "dominated",
          arrival: 2_200,
          catchability: "likely",
          liveState: "schedule",
        }),
      ]),
    });

    expect(
      pruneDominatedDirectJourneys(candidates).map(
        (candidate) => candidate.tripRef
      )
    ).toEqual(["better"]);
  });

  test("chooses a farther stop when it reaches the destination much earlier", () => {
    const options = buildDirectJourneyOptions(stops, {
      "100": fit([departure({ tripRef: "near", arrival: 3_000 })]),
      "200": fit([departure({ tripRef: "far", arrival: 2_000 })]),
    });

    expect(options[0]).toMatchObject({
      kind: "fastest",
      stopId: "200",
      tripRef: "far",
    });
  });

  test("adds a meaningful less-walking option within the near-optimal arrival band", () => {
    const options = buildDirectJourneyOptions(stops, {
      "100": fit([departure({ tripRef: "walk-less", arrival: 2_240 })]),
      "200": fit([departure({ tripRef: "fast", arrival: 2_000 })]),
    });

    expect(options.map((option) => option.kind)).toEqual([
      "fastest",
      "less-walking",
    ]);
    expect(options[1]).toMatchObject({
      stopId: "100",
      tripRef: "walk-less",
    });
  });

  test("does not invent a less-walking label for a trivial distance saving", () => {
    const closeStops = [
      { id: "100", name: "A", distanceMeters: 200 },
      { id: "200", name: "B", distanceMeters: 150 },
    ];
    const options = buildDirectJourneyOptions(closeStops, {
      "100": fit([departure({ tripRef: "fast", arrival: 2_000 })]),
      "200": fit([departure({ tripRef: "almost-same-walk", arrival: 2_120 })]),
    });

    expect(options.map((option) => option.kind)).toEqual(["fastest"]);
  });

  test("adds an easier-to-catch option when the arrival penalty stays small", () => {
    const options = buildDirectJourneyOptions(stops, {
      "100": fit([
        departure({
          tripRef: "tight-fast",
          arrival: 2_000,
          catchability: "tight",
          catchMarginSec: 20,
        }),
      ]),
      "300": fit([
        departure({
          tripRef: "safe",
          arrival: 2_180,
          catchability: "comfortable",
          catchMarginSec: 300,
        }),
      ]),
    });

    expect(options.map((option) => option.kind)).toEqual([
      "fastest",
      "easier-to-catch",
    ]);
    expect(options[1].tripRef).toBe("safe");
  });

  test("returns at most three distinct options", () => {
    const options = buildDirectJourneyOptions(stops, {
      "100": fit([
        departure({
          tripRef: "less-walk",
          arrival: 2_180,
          catchability: "comfortable",
          catchMarginSec: 240,
        }),
      ]),
      "200": fit([
        departure({
          tripRef: "fast",
          arrival: 2_000,
          catchability: "tight",
          catchMarginSec: 20,
        }),
      ]),
      "300": fit([
        departure({
          tripRef: "easy",
          arrival: 2_120,
          catchability: "comfortable",
          catchMarginSec: 400,
        }),
      ]),
    });

    expect(options.length).toBeLessThanOrEqual(3);
    expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
  });
});
