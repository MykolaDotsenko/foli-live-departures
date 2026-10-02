import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import useJourneyPlanSettings from "./useJourneyPlanSettings";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("starts with a valid leave-now balanced plan", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  expect(result.current).toMatchObject({
    timeConstraint: { mode: "leave-now", targetTimeSec: null },
    timeLocalValue: "",
    timeValid: true,
    preference: "balanced",
  });
});

test("leave-at seeds a rounded future Turku wall time and keeps it stable", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  act(() => result.current.setTimeMode("leave-at"));

  expect(result.current.timeConstraint.mode).toBe("leave-at");
  expect(result.current.timeLocalValue).toBe("2026-02-01T12:30");
  expect(result.current.timeConstraint.targetTimeSec).toBe(
    Date.parse("2026-02-01T10:30:00Z") / 1000
  );
  expect(result.current.timeValid).toBe(true);

  const seeded = result.current.timeLocalValue;
  act(() => result.current.setTimeMode("arrive-by"));
  expect(result.current.timeLocalValue).toBe(seeded);
});

test("arrive-by defaults one hour ahead and uses the later fall-back occurrence", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  act(() => result.current.setTimeMode("arrive-by"));
  expect(result.current.timeLocalValue).toBe("2026-02-01T13:00");

  act(() => result.current.setTimeLocalValue("2026-10-25T03:30"));
  expect(result.current.timeConstraint).toEqual({
    mode: "arrive-by",
    targetTimeSec: Date.parse("2026-10-25T01:30:00Z") / 1000,
  });
});

test("non-existent spring-forward wall time is invalid fail closed", () => {
  vi.setSystemTime(new Date("2026-03-28T12:00:00Z"));
  const { result } = renderHook(() => useJourneyPlanSettings());

  act(() => result.current.setTimeMode("leave-at"));
  act(() => result.current.setTimeLocalValue("2026-03-29T03:30"));

  expect(result.current.timeConstraint).toEqual({
    mode: "leave-at",
    targetTimeSec: null,
  });
  expect(result.current.timeValid).toBe(false);
});

test("past custom time is invalid while leave-now always remains valid", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  act(() => result.current.setTimeMode("leave-at"));
  act(() => result.current.setTimeLocalValue("2026-02-01T11:00"));
  expect(result.current.timeValid).toBe(false);

  act(() => result.current.setTimeMode("leave-now"));
  expect(result.current.timeConstraint).toEqual({
    mode: "leave-now",
    targetTimeSec: null,
  });
  expect(result.current.timeValid).toBe(true);
});

test("unknown time mode falls back to leave-now", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());
  act(() => result.current.setTimeMode("teleport"));

  expect(result.current.timeConstraint).toEqual({
    mode: "leave-now",
    targetTimeSec: null,
  });
});

test("accepts every supported routing preference and normalizes unknown values", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  for (const preference of [
    "fewer-transfers",
    "less-walking",
    "more-buffer",
    "balanced",
  ]) {
    act(() => result.current.setPreference(preference));
    expect(result.current.preference).toBe(preference);
  }

  act(() => result.current.setPreference("fastest-at-any-cost"));
  expect(result.current.preference).toBe("balanced");
});

test("custom local value is string-normalized including empty values", () => {
  const { result } = renderHook(() => useJourneyPlanSettings());

  act(() => result.current.setTimeLocalValue(12345));
  expect(result.current.timeLocalValue).toBe("12345");

  act(() => result.current.setTimeLocalValue(null));
  expect(result.current.timeLocalValue).toBe("");
});
