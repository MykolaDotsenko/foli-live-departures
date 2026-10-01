import { expect, test } from "vitest";
import { estimatedWalkSeconds } from "./journeyWalk";

test("adds a conservative detour factor to straight-line walking distance", () => {
  expect(estimatedWalkSeconds(115)).toBe(125);
  expect(estimatedWalkSeconds(0)).toBe(0);
});

test("rejects invalid walking distances", () => {
  expect(estimatedWalkSeconds(null)).toBeNull();
  expect(estimatedWalkSeconds(-1)).toBeNull();
  expect(estimatedWalkSeconds(Number.NaN)).toBeNull();
});
