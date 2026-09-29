import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import useClockTick from "./useClockTick";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("clamps an overly fast interval to one second", () => {
  const { result } = renderHook(() => useClockTick(100));
  const initial = result.current;

  act(() => vi.advanceTimersByTime(999));
  expect(result.current).toBe(initial);

  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(initial + 1_000);
});

test("does not create clock renders while the tab is hidden", () => {
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  const { result } = renderHook(() => useClockTick(1_000));
  const initial = result.current;

  act(() => vi.advanceTimersByTime(5_000));

  expect(result.current).toBe(initial);
  visibility.mockRestore();
});

test("catches the clock up immediately when a hidden tab becomes visible", () => {
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  const { result } = renderHook(() => useClockTick(60_000));
  const initial = result.current;

  act(() => vi.advanceTimersByTime(12_345));
  expect(result.current).toBe(initial);

  visibility.mockReturnValue("visible");
  act(() => {
    document.dispatchEvent(new globalThis.Event("visibilitychange"));
  });

  expect(result.current).toBe(initial + 12_345);
  visibility.mockRestore();
});

test("removes timers and visibility listeners on unmount", () => {
  const remove = vi.spyOn(document, "removeEventListener");
  const clear = vi.spyOn(window, "clearInterval");
  const { unmount } = renderHook(() => useClockTick(1_000));

  unmount();

  expect(remove).toHaveBeenCalledWith(
    "visibilitychange",
    expect.any(Function)
  );
  expect(clear).toHaveBeenCalledTimes(1);
});
