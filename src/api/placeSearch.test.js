import { afterEach, beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./httpClient", () => ({
  default: http,
}));

import {
  resetPlaceSearchForTests,
  searchPlaces,
} from "./placeSearch";

beforeEach(() => {
  vi.useRealTimers();
  http.get.mockReset();
  resetPlaceSearchForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetPlaceSearchForTests();
});

test("does not call the provider for a too-short explicit query", async () => {
  await expect(searchPlaces("ab")).resolves.toEqual([]);
  expect(http.get).not.toHaveBeenCalled();
});

test("sends one bounded explicit search and normalizes the result", async () => {
  http.get.mockResolvedValue({
    data: [
      {
        place_id: 1,
        osm_type: "node",
        osm_id: 123,
        lat: "60.4518",
        lon: "22.2666",
        name: "Prisma",
        display_name: "Prisma, Turku, Varsinais-Suomi, Suomi",
      },
    ],
  });

  const results = await searchPlaces("  Prisma   Turku  ", {
    language: "fi",
  });

  expect(results).toEqual([
    {
      id: "osm:node:123",
      label: "Prisma",
      secondaryLabel: "Turku, Varsinais-Suomi, Suomi",
      lat: 60.4518,
      lon: 22.2666,
    },
  ]);

  expect(http.get).toHaveBeenCalledTimes(1);
  const [url, config] = http.get.mock.calls[0];
  expect(url).toBe("https://nominatim.openstreetmap.org/search");
  expect(config.timeout).toBe(7_000);
  expect(config.params).toEqual({
    q: "Prisma Turku",
    format: "jsonv2",
    limit: 5,
    countrycodes: "fi",
    layer: "address,poi",
    "accept-language": "fi,en",
    viewbox: "21.2,61,23.4,59.9",
    bounded: 1,
  });
});

test("caches identical searches for the current session", async () => {
  http.get.mockResolvedValue({ data: [] });

  await searchPlaces("Turun linna", { language: "en" });
  await searchPlaces("Turun   linna", { language: "en" });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("enforces at least one second between uncached provider requests", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  http.get.mockResolvedValue({ data: [] });

  await searchPlaces("First place");
  const second = searchPlaces("Second place");

  expect(http.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_099);
  expect(http.get).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(http.get).toHaveBeenCalledTimes(2);
});

test("drops malformed provider rows instead of creating invalid destinations", async () => {
  http.get.mockResolvedValue({
    data: [
      { lat: "bad", lon: "22.2", display_name: "Broken" },
      { lat: "60.45", lon: "22.2", display_name: "" },
    ],
  });

  await expect(searchPlaces("Broken place")).resolves.toEqual([]);
});

test("maps provider HTTP failure without inventing a result", async () => {
  http.get.mockRejectedValue({ response: { status: 429 } });

  await expect(searchPlaces("Busy place")).rejects.toThrow(
    "Place search failed (429)."
  );
});

test("maps provider timeout distinctly", async () => {
  http.get.mockRejectedValue({ code: "ECONNABORTED" });

  await expect(searchPlaces("Provider timeout")).rejects.toMatchObject({
    name: "PlaceSearchTimeoutError",
    message: "Place search timed out.",
  });
});

test("keeps caller cancellation distinct from provider timeout", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    searchPlaces("Cancelled request", { signal: controller.signal })
  ).rejects.toMatchObject({
    name: "AbortError",
    message: "Place search cancelled.",
  });
  expect(http.get).not.toHaveBeenCalled();
});

test("maps transport cancellation to AbortError", async () => {
  http.get.mockRejectedValue({ code: "ERR_CANCELED" });

  await expect(searchPlaces("Cancelled in flight")).rejects.toMatchObject({
    name: "AbortError",
    message: "Place search cancelled.",
  });
});

test("serializes concurrent uncached searches to stay within public rate limits", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  http.get.mockResolvedValue({ data: [] });

  const first = searchPlaces("First concurrent");
  const second = searchPlaces("Second concurrent");

  await vi.advanceTimersByTimeAsync(0);
  await first;
  expect(http.get).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1_099);
  expect(http.get).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(http.get).toHaveBeenCalledTimes(2);
});
