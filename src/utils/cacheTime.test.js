import { expect, test } from "vitest";
import {
  normalizedPastTimestamp,
  timestampIsFresh,
} from "./cacheTime";

test("accepts a past timestamp and rejects invalid or future values", () => {
  expect(normalizedPastTimestamp(900, 1_000)).toBe(900);
  expect(normalizedPastTimestamp(1_001, 1_000)).toBe(0);
  expect(normalizedPastTimestamp(Number.POSITIVE_INFINITY, 1_000)).toBe(0);
  expect(normalizedPastTimestamp("not-a-time", 1_000)).toBe(0);
});

test("only treats timestamps from the current clock timeline as fresh", () => {
  expect(timestampIsFresh(900, 200, 1_000)).toBe(true);
  expect(timestampIsFresh(700, 200, 1_000)).toBe(false);
  expect(timestampIsFresh(1_001, 200, 1_000)).toBe(false);
});
