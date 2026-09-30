import { expect, test } from "vitest";
import { rankDestinationStops } from "./journeyRanking";

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
