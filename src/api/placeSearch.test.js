import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetPlaceSearchForTests, searchPlaces } from "./placeSearch";

beforeEach(() => {
  resetPlaceSearchForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function runtimeConfigResponse() {
  return {
    ok: true,
    json: async () => ({
      geocoder: {
        enabled: true,
        provider: "nominatim",
        baseUrl: "https://nominatim.openstreetmap.org",
        countryCodes: ["fi"],
        viewbox: "21.95,60.65,22.65,60.20",
        resultLimit: 6,
      },
    }),
  };
}

function placeResponse() {
  return {
    ok: true,
    json: async () => [
      {
        osm_type: "node",
        osm_id: 123,
        name: "Prisma Test",
        display_name: "Prisma Test, Turku, Finland",
        lat: "60.451",
        lon: "22.267",
        type: "supermarket",
      },
      {
        osm_type: "node",
        osm_id: 999,
        display_name: "Broken",
        lat: "bad",
        lon: "22.2",
      },
    ],
  };
}

test("does not call the network for a too-short query", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await expect(searchPlaces("ab")).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("searches only after explicit invocation and normalizes provider results", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(runtimeConfigResponse())
    .mockResolvedValueOnce(placeResponse());
  vi.stubGlobal("fetch", fetchMock);

  const results = await searchPlaces("  Prisma   Test  ", {
    language: "en,fi",
  });

  expect(results).toEqual([
    {
      id: "nominatim:node:123",
      label: "Prisma Test",
      description: "Prisma Test, Turku, Finland",
      lat: 60.451,
      lon: 22.267,
      category: "supermarket",
      source: "nominatim",
    },
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const searchUrl = new URL(fetchMock.mock.calls[1][0].toString());
  expect(searchUrl.origin).toBe("https://nominatim.openstreetmap.org");
  expect(searchUrl.searchParams.get("q")).toBe("Prisma Test");
  expect(searchUrl.searchParams.get("countrycodes")).toBe("fi");
  expect(searchUrl.searchParams.get("bounded")).toBe("0");
});

test("reuses session cache for the same normalized query", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(runtimeConfigResponse())
    .mockResolvedValueOnce(placeResponse());
  vi.stubGlobal("fetch", fetchMock);

  const first = await searchPlaces("Prisma Test");
  const second = await searchPlaces("prisma   test");

  expect(second).toEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("fails closed when runtime config disables external search", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        geocoder: { enabled: false },
      }),
    })
  );

  await expect(searchPlaces("Prisma Test")).rejects.toMatchObject({
    code: "GEOCODER_DISABLED",
  });
});
