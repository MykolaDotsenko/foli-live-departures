import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchRouteCatalog } from "../api/foliApi";
import useRouteCatalog from "./useRouteCatalog";

vi.mock("../api/foliApi", () => ({
  fetchRouteCatalog: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchRouteCatalog).mockReset();
  vi.mocked(fetchRouteCatalog).mockReturnValue(new Promise(() => {}));
});

test("skips saved routes that are not routes instead of crashing on them", () => {
  localStorage.setItem(
    "foli-route-catalog-v1",
    JSON.stringify({
      savedAt: Date.now(),
      routes: [null, 7, { shortName: "7" }, { id: "1", shortName: "1" }],
    })
  );

  const { result } = renderHook(() => useRouteCatalog());

  expect(result.current).toEqual([{ id: "1", shortName: "1" }]);
});

test("asks for the routes again when nothing saved in them was a route", async () => {
  localStorage.setItem(
    "foli-route-catalog-v1",
    JSON.stringify({ savedAt: Date.now(), routes: [null, 7] })
  );
  vi.mocked(fetchRouteCatalog).mockResolvedValue([{ id: "1", shortName: "1" }]);

  const { result } = renderHook(() => useRouteCatalog());

  await waitFor(() => expect(result.current).toEqual([{ id: "1", shortName: "1" }]));
  expect(fetchRouteCatalog).toHaveBeenCalledTimes(1);
});

test("refreshes a future-dated route cache instead of trusting it indefinitely", async () => {
  localStorage.setItem(
    "foli-route-catalog-v1",
    JSON.stringify({
      savedAt: Date.now() + 24 * 60 * 60 * 1000,
      routes: [{ id: "old", shortName: "1" }],
    })
  );
  vi.mocked(fetchRouteCatalog).mockResolvedValue([
    { id: "fresh", shortName: "1" },
  ]);

  const { result } = renderHook(() => useRouteCatalog());

  await waitFor(() => {
    expect(result.current).toEqual([{ id: "fresh", shortName: "1" }]);
  });
  expect(fetchRouteCatalog).toHaveBeenCalledTimes(1);
});
