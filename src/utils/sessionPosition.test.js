import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  forgetPositionForTests,
  recentPosition,
  rememberPosition,
} from "./sessionPosition";

beforeEach(() => {
  forgetPositionForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});

afterEach(() => {
  forgetPositionForTests();
  vi.useRealTimers();
});

test("keeps a passenger-approved position only in memory with its accuracy", () => {
  rememberPosition({ lat: 60.4518, lon: 22.2666, accuracy: 18.4 });

  expect(recentPosition()).toEqual({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: 18.4,
  });
});

test("treats missing or invalid accuracy as unknown instead of inventing precision", () => {
  rememberPosition({ lat: 60.4518, lon: 22.2666 });
  expect(recentPosition()).toEqual({
    lat: 60.4518,
    lon: 22.2666,
    accuracy: null,
  });

  rememberPosition({ lat: 60.4518, lon: 22.2666, accuracy: "bad" });
  expect(recentPosition()?.accuracy).toBeNull();
});

test("expires the remembered position after fifteen minutes", () => {
  rememberPosition({ lat: 60.4518, lon: 22.2666, accuracy: 20 });

  vi.advanceTimersByTime(15 * 60 * 1000);
  expect(recentPosition()).not.toBeNull();

  vi.advanceTimersByTime(1);
  expect(recentPosition()).toBeNull();
});

test("ignores invalid coordinates", () => {
  rememberPosition({ lat: 120, lon: 22.2666, accuracy: 10 });
  expect(recentPosition()).toBeNull();
});
