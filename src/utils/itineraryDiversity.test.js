import { expect, test } from "vitest";
import { selectDiverseItineraries } from "./itineraryDiversity";

function option(id, origin, lines, transfers = []) {
  return {
    id,
    originStopId: origin,
    legs: lines.map((lineRef) => ({ lineRef })),
    transfers: transfers.map(([alightStopId, boardStopId]) => ({
      alightStopId,
      boardStopId,
    })),
  };
}

test("prefers distinct route shapes while preserving ranked order", () => {
  const a1 = option("a1", "100", ["1", "7"], [["500", "500"]]);
  const a2 = option("a2", "100", ["1", "7"], [["500", "500"]]);
  const b = option("b", "100", ["1", "18"], [["600", "600"]]);
  const c = option("c", "200", ["7", "18"], [["700", "701"]]);

  expect(selectDiverseItineraries([a1, a2, b, c], 3).map((x) => x.id)).toEqual([
    "a1",
    "b",
    "c",
  ]);
});

test("fills with later departures when only one route shape exists", () => {
  const rows = [
    option("a1", "100", ["1", "7"], [["500", "500"]]),
    option("a2", "100", ["1", "7"], [["500", "500"]]),
    option("a3", "100", ["1", "7"], [["500", "500"]]),
  ];

  expect(selectDiverseItineraries(rows, 3).map((x) => x.id)).toEqual([
    "a1",
    "a2",
    "a3",
  ]);
});

test("treats a different boarding origin or transfer platform as meaningful diversity", () => {
  const rows = [
    option("a", "100", ["1", "7"], [["500", "500"]]),
    option("b", "101", ["1", "7"], [["500", "500"]]),
    option("c", "100", ["1", "7"], [["500", "501"]]),
  ];

  expect(selectDiverseItineraries(rows, 3)).toEqual(rows);
});

test("fails closed for invalid input and zero limits", () => {
  expect(selectDiverseItineraries(null, 3)).toEqual([]);
  expect(selectDiverseItineraries([], 3)).toEqual([]);
  expect(selectDiverseItineraries([option("a", "1", ["1"])], 0)).toEqual([]);
});
