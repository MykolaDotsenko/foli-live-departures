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
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

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

function nominatimRow(overrides = {}) {
  return {
    place_id: 1,
    osm_type: "node",
    osm_id: 456,
    lat: "60.4518",
    lon: "22.2666",
    name: "Prisma",
    display_name: "Prisma, Kalevantie 41, Turku, Suomi",
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

test("does not call any provider for a too-short explicit query", async () => {
  await expect(searchPlaces("ab")).resolves.toEqual([]);
  expect(http.get).not.toHaveBeenCalled();
});

test("uses Photon first and normalizes GeoJSON place results", async () => {
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

test("falls back to rate-limited Nominatim when Photon returns no useful match", async () => {
  http.get
    .mockResolvedValueOnce({ data: { features: [] } })
    .mockResolvedValueOnce({ data: [nominatimRow()] });

  const results = await searchPlaces("Prisma Turku", {
    language: "en",
  });

  expect(results[0]).toMatchObject({
    id: "osm:node:456",
    label: "Prisma",
    lat: 60.4518,
    lon: 22.2666,
  });

  expect(http.get).toHaveBeenCalledTimes(2);
  const [url, config] = http.get.mock.calls[1];
  expect(url).toBe(NOMINATIM_URL);
  expect(config.params).toEqual({
    q: "Prisma Turku",
    format: "jsonv2",
    limit: 5,
    countrycodes: "fi",
    layer: "address,poi",
    "accept-language": "en,fi",
    viewbox: "21.2,61,23.4,59.9",
    bounded: 1,
  });
});

test("falls back when Photon is unavailable", async () => {
  http.get
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValueOnce({ data: [nominatimRow()] });

  await expect(searchPlaces("Prisma")).resolves.toHaveLength(1);
  expect(http.get.mock.calls.map(([url]) => url)).toEqual([
    PHOTON_URL,
    NOMINATIM_URL,
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

test("caches a confirmed no-result fallback response too", async () => {
  http.get
    .mockResolvedValueOnce({ data: { features: [] } })
    .mockResolvedValueOnce({ data: [] });

  await searchPlaces("Definitely nowhere", { language: "en" });
  await searchPlaces("Definitely   nowhere", { language: "en" });

  expect(http.get).toHaveBeenCalledTimes(2);
});

test("serializes Nominatim fallbacks to stay inside the public rate limit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

  http.get.mockImplementation(async (url) => {
    if (url === PHOTON_URL) return { data: { features: [] } };
    return { data: [] };
  });

  const first = searchPlaces("First fallback");
  const second = searchPlaces("Second fallback");

  await vi.advanceTimersByTimeAsync(0);
  await first;

  const fallbackCalls = () =>
    http.get.mock.calls.filter(([url]) => url === NOMINATIM_URL).length;

  expect(fallbackCalls()).toBe(1);

  await vi.advanceTimersByTimeAsync(1_099);
  expect(fallbackCalls()).toBe(1);

  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(fallbackCalls()).toBe(2);
});

test("drops malformed Photon rows and can still use the fallback", async () => {
  http.get
    .mockResolvedValueOnce({
      data: {
        features: [
          photonFeature({
            geometry: { coordinates: ["bad", 60.45] },
          }),
        ],
      },
    })
    .mockResolvedValueOnce({ data: [nominatimRow()] });

  await expect(searchPlaces("Broken primary")).resolves.toHaveLength(1);
});

test("caller cancellation never starts a fallback request", async () => {
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

test("transport cancellation from Photon is propagated without fallback", async () => {
  http.get.mockRejectedValueOnce({ code: "ERR_CANCELED" });

  await expect(searchPlaces("Cancelled in flight")).rejects.toMatchObject({
    name: "AbortError",
    message: "Place search cancelled.",
  });

  expect(http.get).toHaveBeenCalledTimes(1);
});

test("reports unavailable only after both providers fail", async () => {
  http.get
    .mockRejectedValueOnce({ code: "ECONNABORTED" })
    .mockRejectedValueOnce({ response: { status: 429 } });

  await expect(searchPlaces("Both providers down")).rejects.toMatchObject({
    name: "PlaceSearchUnavailableError",
    message: "Place search unavailable.",
  });

  expect(http.get).toHaveBeenCalledTimes(2);
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
