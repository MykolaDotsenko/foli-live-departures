import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  searchPlaces: vi.fn(),
  placeSearchViewbox: vi.fn(() => "22,61,23,60"),
}));

vi.mock("../api/placeSearch", () => ({
  searchPlaces: api.searchPlaces,
  placeSearchViewbox: api.placeSearchViewbox,
}));

import usePlaceSearch from "./usePlaceSearch";

beforeEach(() => {
  api.searchPlaces.mockReset().mockResolvedValue([]);
  api.placeSearchViewbox.mockReset().mockReturnValue("22,61,23,60");
});

test("does nothing until explicit search is called", () => {
  const { result } = renderHook(() =>
    usePlaceSearch({
      stops: [{ id: "1", lat: 60.45, lon: 22.26 }],
      language: "en",
    })
  );

  expect(result.current.state).toBe("idle");
  expect(api.searchPlaces).not.toHaveBeenCalled();
});

test("passes language and stop-derived bounds to the provider", async () => {
  api.searchPlaces.mockResolvedValue([
    {
      id: "osm:node:1",
      label: "Prisma",
      secondaryLabel: "Turku",
      lat: 60.45,
      lon: 22.26,
      category: "shop",
      provider: "nominatim",
    },
  ]);

  const stops = [{ id: "1", lat: 60.45, lon: 22.26 }];
  const { result } = renderHook(() =>
    usePlaceSearch({ stops, language: "fi" })
  );

  let found;
  await act(async () => {
    found = await result.current.search("Prisma");
  });

  expect(api.placeSearchViewbox).toHaveBeenCalledWith(stops);
  expect(api.searchPlaces).toHaveBeenCalledWith(
    "Prisma",
    expect.objectContaining({
      language: "fi",
      viewbox: "22,61,23,60",
      signal: expect.any(AbortSignal),
    })
  );
  expect(found).toHaveLength(1);
  expect(result.current.state).toBe("ready");
});

test("distinguishes provider failure from a valid empty result", async () => {
  api.searchPlaces.mockRejectedValue(new Error("provider down"));

  const { result } = renderHook(() =>
    usePlaceSearch({ stops: [], language: "en" })
  );

  let found;
  await act(async () => {
    found = await result.current.search("Prisma");
  });

  expect(found).toBeNull();
  expect(result.current.state).toBe("error");
  expect(result.current.results).toEqual([]);
});

test("clear aborts active work and returns the hook to idle", async () => {
  let resolveSearch;
  api.searchPlaces.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
  );

  const { result } = renderHook(() =>
    usePlaceSearch({ stops: [], language: "en" })
  );

  act(() => {
    result.current.search("Prisma");
  });

  await waitFor(() => expect(result.current.state).toBe("loading"));

  act(() => {
    result.current.clear();
  });

  expect(result.current.state).toBe("idle");
  expect(result.current.results).toEqual([]);

  resolveSearch([]);
});
