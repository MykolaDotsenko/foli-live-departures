import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  directPlaceSearchSupported,
  resetPlaceSearchForTests,
  searchPlaces,
} from "./placeSearch";

function response(json, ok = true, status = 200, headers = {}) {
  return {
    ok,
    status,
    headers: {
      get: vi.fn((name) => headers[String(name).toLowerCase()] ?? null),
    },
    json: vi.fn().mockResolvedValue(json),
  };
}

beforeEach(() => {
  resetPlaceSearchForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  resetPlaceSearchForTests();
  vi.restoreAllMocks();
});

test("does no network work for a too-short query", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await expect(searchPlaces("ab")).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("loads runtime config then performs one explicit Nominatim search", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        viewbox: [21.4, 60.8, 23.2, 60.15],
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response([
        {
          osm_type: "node",
          osm_id: 123,
          place_id: 456,
          lat: "60.45",
          lon: "22.30",
          display_name: "Prisma Itäharju, Turku, Finland",
          namedetails: { name: "Prisma Itäharju" },
          address: { shop: "Prisma Itäharju" },
          category: "shop",
          type: "supermarket",
          addresstype: "shop",
          licence: "Data © OpenStreetMap contributors",
        },
      ])
    );
  vi.stubGlobal("fetch", fetchMock);

  const results = await searchPlaces("Prisma Itäharju", {
    language: "en-GB",
  });

  expect(results).toEqual([
    {
      id: "node:123",
      title: "Prisma Itäharju",
      subtitle: "Turku, Finland",
      lat: 60.45,
      lon: 22.3,
      category: "shop",
      type: "shop",
      osmType: "node",
      boundingBox: null,
      provider: "nominatim",
      licence: "Data © OpenStreetMap contributors",
    },
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const searchUrl = new globalThis.URL(fetchMock.mock.calls[1][0]);
  expect(searchUrl.origin).toBe("https://nominatim.openstreetmap.org");
  expect(searchUrl.searchParams.get("q")).toBe("Prisma Itäharju");
  expect(searchUrl.searchParams.get("countrycodes")).toBe("fi");
  expect(searchUrl.searchParams.get("accept-language")).toBe("en-GB");
  expect(searchUrl.searchParams.get("limit")).toBe("5");
  expect(searchUrl.searchParams.get("bounded")).toBe("0");
});

test("reuses session cache instead of repeating the same place query", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response([
        {
          osm_type: "way",
          osm_id: 10,
          place_id: 20,
          lat: "60.45",
          lon: "22.30",
          display_name: "Place, Turku, Finland",
          namedetails: { name: "Place" },
          address: {},
          category: "amenity",
          type: "library",
          addresstype: "amenity",
        },
      ])
    );
  vi.stubGlobal("fetch", fetchMock);

  const first = await searchPlaces("Place");
  const second = await searchPlaces("  place  ");

  expect(second).toEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("filters malformed coordinates and respects a disabled runtime provider", async () => {
  const disabledFetch = vi.fn().mockResolvedValueOnce(
    response({
      enabled: false,
      endpoint: "https://nominatim.openstreetmap.org/search",
    })
  );
  vi.stubGlobal("fetch", disabledFetch);
  await expect(searchPlaces("Prisma")).rejects.toMatchObject({
    name: "PlaceSearchPolicyError",
  });
  expect(disabledFetch).toHaveBeenCalledTimes(1);

  resetPlaceSearchForTests();

  const invalidFetch = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response([
        { place_id: 1, lat: "999", lon: "22", display_name: "Bad" },
      ])
    );
  vi.stubGlobal("fetch", invalidFetch);

  await expect(searchPlaces("Bad place")).resolves.toEqual([]);
});


test("serializes different explicit searches instead of starting them in parallel", async () => {
  let resolveFirstSearch;
  const firstSearchResponse = new Promise((resolve) => {
    resolveFirstSearch = resolve;
  });

  const timeoutSpy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((callback) => {
      callback();
      return 1;
    });

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockImplementationOnce(() => firstSearchResponse)
    .mockResolvedValueOnce(response([]));

  vi.stubGlobal("fetch", fetchMock);

  const first = searchPlaces("First place");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const second = searchPlaces("Second place");
  await Promise.resolve();
  await Promise.resolve();

  // Config + first search only. The second query waits behind the first
  // network task instead of opening a parallel Nominatim request.
  expect(fetchMock).toHaveBeenCalledTimes(2);

  resolveFirstSearch(response([]));
  await first;
  await second;

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(timeoutSpy).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Number)
  );
  expect(
    timeoutSpy.mock.calls.some(([, delay]) => Number(delay) >= 1_000)
  ).toBe(true);
});

test("keeps cached place labels language-specific", async () => {
  vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
    callback();
    return 1;
  });

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response([
        {
          osm_type: "node",
          osm_id: 1,
          lat: "60.45",
          lon: "22.30",
          display_name: "Library, Turku, Finland",
          namedetails: { name: "Library" },
        },
      ])
    )
    .mockResolvedValueOnce(
      response([
        {
          osm_type: "node",
          osm_id: 1,
          lat: "60.45",
          lon: "22.30",
          display_name: "Kirjasto, Turku, Suomi",
          namedetails: { name: "Kirjasto" },
        },
      ])
    );

  vi.stubGlobal("fetch", fetchMock);

  const english = await searchPlaces("library", { language: "en" });
  const englishCached = await searchPlaces("LIBRARY", { language: "en" });
  const finnish = await searchPlaces("library", { language: "fi" });

  expect(englishCached).toEqual(english);
  expect(english[0]?.title).toBe("Library");
  expect(finnish[0]?.title).toBe("Kirjasto");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});


test("backs off locally after a 429 without issuing another provider request", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response(
        { message: "slow down" },
        false,
        429,
        { "retry-after": "60" }
      )
    );

  vi.stubGlobal("fetch", fetchMock);

  await expect(
    searchPlaces("First place")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });

  await expect(
    searchPlaces("Second place")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });

  // Runtime config + the first provider request only. The second explicit
  // search fails locally during cooldown and does not hammer the provider.
  expect(fetchMock).toHaveBeenCalledTimes(2);
});


test("honours Retry-After HTTP dates and falls back when the header is absent", async () => {
  const now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(now);

  const datedFetch = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response(
        { message: "slow down" },
        false,
        429,
        {
          "retry-after": new Date(now + 5_000).toUTCString(),
        }
      )
    );

  vi.stubGlobal("fetch", datedFetch);

  await expect(
    searchPlaces("Date limited place")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });
  await expect(
    searchPlaces("Still blocked")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });
  expect(datedFetch).toHaveBeenCalledTimes(2);

  resetPlaceSearchForTests();

  const fallbackFetch = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response({ message: "slow down" }, false, 429)
    );

  vi.stubGlobal("fetch", fallbackFetch);

  await expect(
    searchPlaces("Fallback limited place")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });
  await expect(
    searchPlaces("Still fallback blocked")
  ).rejects.toMatchObject({
    name: "PlaceSearchCooldownError",
  });
  expect(fallbackFetch).toHaveBeenCalledTimes(2);
});


test("fails closed for malformed or non-HTTPS runtime provider config", async () => {
  const malformedFetch = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "not a valid URL",
      })
    );

  vi.stubGlobal("fetch", malformedFetch);

  await expect(searchPlaces("Prisma")).rejects.toMatchObject({
    name: "PlaceSearchPolicyError",
  });
  expect(malformedFetch).toHaveBeenCalledTimes(1);

  resetPlaceSearchForTests();

  const insecureFetch = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "http://example.com/search",
      })
    );

  vi.stubGlobal("fetch", insecureFetch);

  await expect(searchPlaces("Prisma")).rejects.toMatchObject({
    name: "PlaceSearchPolicyError",
  });
  expect(insecureFetch).toHaveBeenCalledTimes(1);
});

test("surfaces non-rate-limit provider HTTP failures without retrying", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockResolvedValueOnce(
      response({ message: "unavailable" }, false, 503)
    );

  vi.stubGlobal("fetch", fetchMock);

  await expect(
    searchPlaces("Unavailable place")
  ).rejects.toThrow("Place search failed with HTTP 503.");

  expect(fetchMock).toHaveBeenCalledTimes(2);
});


test("cancels a queued explicit search before it starts another provider request", async () => {
  let resolveFirstSearch;
  const firstSearchResponse = new Promise((resolve) => {
    resolveFirstSearch = resolve;
  });

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        limit: 5,
      })
    )
    .mockImplementationOnce(() => firstSearchResponse);

  vi.stubGlobal("fetch", fetchMock);

  const first = searchPlaces("First queued place");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const controller = new AbortController();
  const second = searchPlaces("Second queued place", {
    signal: controller.signal,
  });
  controller.abort();

  resolveFirstSearch(response([]));
  await first;

  await expect(second).rejects.toMatchObject({
    name: "AbortError",
  });

  // Config + first provider request only. The aborted queued search never
  // starts a second provider request after the previous task finishes.
  expect(fetchMock).toHaveBeenCalledTimes(2);
});


test("fails closed without network in a packaged native runtime", async () => {
  const previous = globalThis.Capacitor;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(globalThis, "Capacitor", {
    configurable: true,
    value: { isNativePlatform: () => true },
  });

  try {
    expect(directPlaceSearchSupported()).toBe(false);
    await expect(searchPlaces("Prisma Itäharju")).rejects.toMatchObject({
      name: "PlaceSearchPolicyError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) {
      delete globalThis.Capacitor;
    } else {
      Object.defineProperty(globalThis, "Capacitor", {
        configurable: true,
        value: previous,
      });
    }
  }
});

test("runtime config cannot expand the provider trust boundary to another origin", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    response({
      enabled: true,
      endpoint: "https://example.com/search",
      countrycodes: "fi",
      limit: 5,
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(searchPlaces("Prisma Itäharju")).rejects.toMatchObject({
    name: "PlaceSearchPolicyError",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
