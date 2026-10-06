import { afterEach, expect, test, vi } from "vitest";
import {
  forgetPositionForTests,
  recentPosition,
  rememberPosition,
} from "./sessionPosition";

afterEach(() => {
  forgetPositionForTests();
  vi.useRealTimers();
});

test("keeps accuracy with an explicitly requested session-only fix", () => {
  rememberPosition({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: 18,
  });

  expect(recentPosition()).toEqual({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: 18,
  });
});

test("keeps unknown accuracy explicit instead of inventing precision", () => {
  rememberPosition({
    lat: 60.4518,
    lon: 22.2666,
  });

  expect(recentPosition()).toEqual({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: null,
  });
});

test("forgets an old in-memory fix", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));

  rememberPosition({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: 12,
  });

  vi.advanceTimersByTime(15 * 60 * 1000 + 1);

  expect(recentPosition()).toBeNull();
});
