import { expect, test } from "vitest";
import { findStopMatches, normalizeStopQuery } from "./stopSearch";

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
