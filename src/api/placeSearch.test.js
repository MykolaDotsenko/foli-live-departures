import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  resetPlaceSearchForTests,
  searchPlaces,
} from "./placeSearch";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetPlaceSearchForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetPlaceSearchForTests();
});

test("does not call the provider for a too-short explicit query", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  await expect(searchPlaces("ab")).resolves.toEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("sends one bounded explicit search and normalizes the result", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [
      {
        place_id: 1,
        osm_type: "node",
        osm_id: 123,
        lat: "60.4518",
        lon: "22.2666",
        name: "Prisma",
        display_name: "Prisma, Turku, Varsinais-Suomi, Suomi",
        addresstype: "shop",
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

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [requestUrl, options] = fetchSpy.mock.calls[0];
  const url = new globalThis.URL(String(requestUrl));

  expect(url.origin).toBe("https://nominatim.openstreetmap.org");
  expect(url.searchParams.get("q")).toBe("Prisma Turku");
  expect(url.searchParams.get("countrycodes")).toBe("fi");
  expect(url.searchParams.get("layer")).toBe("address,poi");
  expect(url.searchParams.get("bounded")).toBe("1");
  expect(url.searchParams.get("viewbox")).toBe("21.2,61,23.4,59.9");
  expect(url.searchParams.get("accept-language")).toBe("fi,en");
  expect(options.headers).toEqual({ Accept: "application/json" });
  expect(options.referrerPolicy).toBe("strict-origin-when-cross-origin");
});

test("caches identical searches for the current session", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  });

  await searchPlaces("Turun linna", {
    language: "en",
  });
  await searchPlaces("Turun   linna", {
    language: "en",
  });

  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("enforces at least one second between uncached provider requests", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  });

  await searchPlaces("First place");

  const second = searchPlaces("Second place");

  expect(fetchSpy).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1_099);
  expect(fetchSpy).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("drops malformed provider rows instead of creating invalid destinations", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [
      { lat: "bad", lon: "22.2", display_name: "Broken" },
      { lat: "60.45", lon: "22.2", display_name: "" },
    ],
  });

  await expect(searchPlaces("Broken place")).resolves.toEqual([]);
});

test("surfaces provider HTTP failure without falling back to a fake result", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    status: 429,
  });

  await expect(searchPlaces("Busy place")).rejects.toThrow(
    "Place search failed (429)."
  );
});


test("serializes concurrent uncached searches to stay within public rate limits", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  });

  const first = searchPlaces("First concurrent");
  const second = searchPlaces("Second concurrent");

  await vi.advanceTimersByTimeAsync(0);
  await first;
  expect(fetchSpy).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1_099);
  expect(fetchSpy).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
