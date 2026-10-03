import { expect, test } from "vitest";
import { findSimilarStops, findStopMatches, normalizeStopQuery } from "./stopSearch";

test("normalizes case and accents", () => {
  expect(normalizeStopQuery("  ÅBO  ")).toBe("abo");
});

test("keeps every exact duplicate stop name beyond the normal limit", () => {
  const stops = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1),
    name: "Kauppatori",
  }));

  expect(findStopMatches(stops, "kauppatori", 6)).toHaveLength(8);
});

const turku = [
  { id: "164", name: "Kauppatori" },
  { id: "166", name: "Kauppatori" },
  { id: "300", name: "Kupittaa" },
  { id: "310", name: "Ylioppilaskylä" },
  { id: "4", name: "Turun linna" },
  { id: "500", name: "Varissuo" },
  { id: "1500", name: "Itäharju" },
];

// A typing slip found nothing at all: "Kauppatroi" left the list empty.
test("offers stops one or two typing slips away", () => {
  expect(findSimilarStops(turku, "Kauppatroi").map((stop) => stop.id)).toEqual(["164", "166"]);
  expect(findSimilarStops(turku, "Kupitaa").map((stop) => stop.id)).toEqual(["300"]);
  expect(findSimilarStops(turku, "Varisuo").map((stop) => stop.id)).toEqual(["500"]);
  expect(findSimilarStops(turku, "ylioppilaskila").map((stop) => stop.id)).toEqual(["310"]);
  // A slip in one word of a longer name.
  expect(findSimilarStops(turku, "linan").map((stop) => stop.id)).toEqual(["4"]);
});

test("does not guess from short queries, numbers or names far off", () => {
  expect(findSimilarStops(turku, "kup")).toEqual([]);
  expect(findSimilarStops(turku, "1650")).toEqual([]);
  expect(findSimilarStops(turku, "Hirvensalo")).toEqual([]);
  expect(findSimilarStops(turku, "")).toEqual([]);
});

test("keeps exact matching first: nothing changes where a name matches as typed", () => {
  expect(findStopMatches(turku, "kaup").map((stop) => stop.id)).toEqual(["164", "166"]);
  expect(findStopMatches(turku, "Kauppatroi")).toEqual([]);
});
