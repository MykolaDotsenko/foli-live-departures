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

const PHOTON_URL = "https://photon.komoot.io/api";

function photonFeature(overrides = {}) {
  return {
    geometry: {
      type: "Point",
      coordinates: [22.2666, 60.4518],
    },
    properties: {
      name: "Prisma",
      street: "Kalevantie",
      housenumber: "41",
      postcode: "20520",
      city: "Turku",
      country: "Suomi",
      countrycode: "FI",
      osm_type: "N",
      osm_id: 123,
    },
    ...overrides,
  };
}

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

test("uses Photon only after explicit search and normalizes GeoJSON", async () => {
  http.get.mockResolvedValueOnce({
    data: {
      type: "FeatureCollection",
      features: [photonFeature()],
    },
  });

  const results = await searchPlaces("  Prisma   Turku  ", {
    language: "fi",
  });

  expect(results).toEqual([
    {
      id: "osm:node:123",
      label: "Prisma",
      secondaryLabel: "Kalevantie 41, Turku, 20520, Suomi",
      lat: 60.4518,
      lon: 22.2666,
    },
  ]);

  expect(http.get).toHaveBeenCalledTimes(1);
  const [url, config] = http.get.mock.calls[0];
  expect(url).toBe(PHOTON_URL);
  expect(config.timeout).toBe(7_000);
  expect(config.params).toEqual({
    q: "Prisma Turku",
    limit: 5,
    lang: "fi",
    countrycode: "FI",
    bbox: "21.2,59.9,23.4,61",
    lat: 60.4518,
    lon: 22.2666,
    zoom: 10,
  });
});

test("builds a readable address label when Photon has no place name", async () => {
  http.get.mockResolvedValueOnce({
    data: {
      features: [
        photonFeature({
          properties: {
            street: "Yliopistonkatu",
            housenumber: "20",
            postcode: "20100",
            city: "Turku",
            country: "Suomi",
            osm_type: "W",
            osm_id: 99,
          },
        }),
      ],
    },
  });

  await expect(searchPlaces("Yliopistonkatu 20")).resolves.toEqual([
    {
      id: "osm:way:99",
      label: "Yliopistonkatu 20",
      secondaryLabel: "Turku, 20100, Suomi",
      lat: 60.4518,
      lon: 22.2666,
    },
  ]);
});

test("caches the final result in memory for the current tab", async () => {
  http.get.mockResolvedValueOnce({
    data: { features: [photonFeature()] },
  });

  await searchPlaces("Turun linna", { language: "en" });
  await searchPlaces("Turun   linna", { language: "en" });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("caches a confirmed no-result response", async () => {
  http.get.mockResolvedValueOnce({ data: { features: [] } });

  await searchPlaces("Definitely nowhere", { language: "en" });
  await searchPlaces("Definitely   nowhere", { language: "en" });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("drops malformed Photon rows rather than inventing a place", async () => {
  http.get.mockResolvedValueOnce({
    data: {
      features: [
        photonFeature({
          geometry: { coordinates: ["bad", 60.45] },
        }),
      ],
    },
  });

  await expect(searchPlaces("Broken result")).resolves.toEqual([]);
});

test("caller cancellation never starts a provider request", async () => {
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

test("transport cancellation is propagated as an AbortError", async () => {
  http.get.mockRejectedValueOnce({ code: "ERR_CANCELED" });

  await expect(searchPlaces("Cancelled in flight")).rejects.toMatchObject({
    name: "AbortError",
    message: "Place search cancelled.",
  });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("provider failure becomes an explicit unavailable error", async () => {
  http.get.mockRejectedValueOnce({ response: { status: 503 } });

  await expect(searchPlaces("Provider down")).rejects.toMatchObject({
    name: "PlaceSearchUnavailableError",
    message: "Place search unavailable.",
  });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("deduplicates repeated Photon representations of the same OSM object", async () => {
  http.get.mockResolvedValueOnce({
    data: {
      features: [
        photonFeature(),
        photonFeature({
          properties: {
            ...photonFeature().properties,
            name: "Prisma duplicate",
          },
        }),
      ],
    },
  });

  const results = await searchPlaces("Prisma duplicate");
  expect(results).toHaveLength(1);
});
