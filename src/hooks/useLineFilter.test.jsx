import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import useLineFilter, { normalizeLines } from "./useLineFilter";

const STORAGE_KEY = "foli-line-filter-v1";

beforeEach(() => {
  localStorage.clear();
});

test("normalizes followed lines before they can reach persistence or filtering", () => {
  expect(
    normalizeLines([" 1 ", "1", "", null, "32", "1234567890123"])
  ).toEqual(["1", "32"]);
});

test("recovers from malformed stored filters as an empty filter", () => {
  localStorage.setItem(STORAGE_KEY, "{not-json");

  const { result } = renderHook(() => useLineFilter("164"));

  expect(result.current[0]).toEqual([]);
});

test("persists followed lines per stop and restores them on a later mount", () => {
  const first = renderHook(() => useLineFilter("164"));

  act(() => first.result.current[1](["1", "32"]));
  expect(first.result.current[0]).toEqual(["1", "32"]);
  first.unmount();

  const second = renderHook(() => useLineFilter("164"));
  expect(second.result.current[0]).toEqual(["1", "32"]);
});

test("switching stops never leaks the previous stop's filter", () => {
  const { result, rerender } = renderHook(
    ({ stopId }) => useLineFilter(stopId),
    { initialProps: { stopId: "164" } }
  );

  act(() => result.current[1](["1"]));
  rerender({ stopId: "32" });
  expect(result.current[0]).toEqual([]);

  act(() => result.current[1](["9"]));
  rerender({ stopId: "164" });
  expect(result.current[0]).toEqual(["1"]);
});

test("clearing a filter removes that stop from storage", () => {
  const { result } = renderHook(() => useLineFilter("164"));

  act(() => result.current[1](["1"]));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveProperty("164");

  act(() => result.current[1]([]));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).not.toHaveProperty("164");
});

test("a blocked storage write does not stop the current board from filtering", () => {
  const setItem = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("storage blocked");
    });

  const { result } = renderHook(() => useLineFilter("164"));

  act(() => result.current[1](["1"]));

  expect(result.current[0]).toEqual(["1"]);
  setItem.mockRestore();
});

test("keeps at most the twenty most recently saved stop filters", () => {
  let now = 1_000;
  const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now++);
  const { result, rerender } = renderHook(
    ({ stopId }) => useLineFilter(stopId),
    { initialProps: { stopId: "1" } }
  );

  for (let id = 1; id <= 21; id += 1) {
    rerender({ stopId: String(id) });
    act(() => result.current[1]([`L${id}`]));
  }

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(Object.keys(stored)).toHaveLength(20);
  expect(stored).not.toHaveProperty("1");
  expect(stored).toHaveProperty("21");

  dateNow.mockRestore();
});
