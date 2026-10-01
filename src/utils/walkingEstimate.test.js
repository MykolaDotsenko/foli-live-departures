import { expect, test } from "vitest";
import { approximateWalkSeconds } from "./walkingEstimate";

test("keeps straight-line walking estimates conservative", () => {
  expect(approximateWalkSeconds(120)).toBe(125);
  expect(approximateWalkSeconds(0)).toBe(0);
});

test("rejects missing and invalid walking distances", () => {
  expect(approximateWalkSeconds(null)).toBeNull();
  expect(approximateWalkSeconds(-1)).toBeNull();
  expect(approximateWalkSeconds(Number.NaN)).toBeNull();
});
