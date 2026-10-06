import { expect, test } from "vitest";
import {
  materiallyBetterDestinationFit,
  rankDestinationStops,
} from "./journeyRanking";

const stops = [
  { id: "near", distanceMeters: 80 },
  { id: "far", distanceMeters: 280 },
  { id: "other", distanceMeters: 40 },
];

function good(arrival) {
  return {
    status: "good",
    best: { destinationArrivalAt: arrival },
  };
}

test("farther stop wins when it reaches the destination materially earlier", () => {
  const ranked = rankDestinationStops(stops, {
    near: good(3_000),
    far: good(2_000),
    other: { status: "other-direction", best: null },
  });

  expect(ranked.map((stop) => stop.id)).toEqual(["far", "near", "other"]);
});

test("keeps the previous recommendation for a small realtime advantage", () => {
  const ranked = rankDestinationStops(
    stops,
    {
      near: good(2_090),
      far: good(2_000),
      other: { status: "other-direction", best: null },
    },
    ["near", "far", "other"]
  );

  expect(ranked[0].id).toBe("near");
});

test("switches when the new option is materially faster", () => {
  const ranked = rankDestinationStops(
    stops,
    {
      near: good(2_181),
      far: good(2_000),
      other: { status: "other-direction", best: null },
    },
    ["near", "far", "other"]
  );

  expect(ranked[0].id).toBe("far");
});

test("switches immediately when the old recommendation degrades", () => {
  const ranked = rankDestinationStops(
    stops,
    {
      near: { status: "too-late", best: null },
      far: good(2_300),
      other: { status: "other-direction", best: null },
    },
    ["near", "far", "other"]
  );

  expect(ranked[0].id).toBe("far");
});

test("never hides stops while stabilizing the recommendation", () => {
  const ranked = rankDestinationStops(
    stops,
    {
      near: good(2_090),
      far: good(2_000),
      other: { status: "no-direct", best: null },
    },
    ["near", "far", "other"]
  );

  expect(new Set(ranked.map((stop) => stop.id))).toEqual(
    new Set(["near", "far", "other"])
  );
});


test("ranks uncertain evidence above a known uncatchable departure", () => {
  const ranked = rankDestinationStops(
    [
      { id: "late", distanceMeters: 50 },
      { id: "unknown", distanceMeters: 200 },
    ],
    {
      late: { status: "too-late", best: null },
      unknown: { status: "uncertain", best: null },
    }
  );

  expect(ranked.map((stop) => stop.id)).toEqual(["unknown", "late"]);
});

// Standing 30 m from a stop whose next bus is tight, the passenger was told
// to walk 700 m to another stop as "Best", for a bus arriving no earlier
// than the next one from where they stood. A stop is compared on its first
// realistically catchable bus, which a tight first one does not hide.
test("a tight first bus does not hide a comfortable later one at the same stop", () => {
  const here = { id: "here", distanceMeters: 30 };
  const across = { id: "across", distanceMeters: 700 };
  const tightNow = { catchability: "tight", destinationArrivalAt: 1_000 };
  const nextOne = { catchability: "comfortable", destinationArrivalAt: 2_200 };

  const ranked = rankDestinationStops([across, here], {
    here: { status: "tight", best: tightNow, departures: [tightNow, nextOne] },
    across: {
      status: "good",
      best: { catchability: "comfortable", destinationArrivalAt: 2_200 },
      departures: [],
    },
  });

  expect(ranked.map((stop) => stop.id)).toEqual(["here", "across"]);
});

test("a tight stop with no later catchable bus still ranks below a good one", () => {
  const tightNow = { catchability: "tight", destinationArrivalAt: 1_000 };
  const ranked = rankDestinationStops(stops, {
    near: { status: "tight", best: tightNow, departures: [tightNow] },
    far: good(2_200),
    other: { status: "other-direction", best: null },
  });

  expect(ranked.map((stop) => stop.id)).toEqual(["far", "near", "other"]);
});


test("better-stop suggestion requires a material improvement", () => {
  expect(
    materiallyBetterDestinationFit(good(2_090), good(2_000))
  ).toBe(false);
  expect(
    materiallyBetterDestinationFit(good(2_121), good(2_000))
  ).toBe(true);
  expect(
    materiallyBetterDestinationFit(
      { status: "tight", best: { destinationArrivalAt: 1_900 } },
      good(2_200)
    )
  ).toBe(true);
  expect(
    materiallyBetterDestinationFit(
      good(2_000),
      { status: "tight", best: { destinationArrivalAt: 1_700 } }
    )
  ).toBe(false);
});
