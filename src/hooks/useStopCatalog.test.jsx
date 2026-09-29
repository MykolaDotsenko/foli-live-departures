import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import {
  fetchStopCatalog,
  fetchStopCoordinates,
} from "../api/foliApi";
import useStopCatalog from "./useStopCatalog";

vi.mock("../api/foliApi", () => ({
  fetchStopCatalog: vi.fn(),
  fetchStopCoordinates: vi.fn(),
}));

const CACHE_KEY = "foli-stop-catalog-v2";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(fetchStopCatalog).mockReset();
  vi.mocked(fetchStopCoordinates).mockReset();
});

test("treats a future-dated cache as stale and refreshes it", async () => {
  const now = Date.now();
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: now + 24 * 60 * 60 * 1000,
      stops: [
        {
          id: "164",
          name: "Future cached name",
          lat: 60.4518,
          lon: 22.2666,
        },
      ],
    })
  );

  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );
  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Kauppatori" },
  ]);

  const { result } = renderHook(() => useStopCatalog());

  expect(result.current.catalogStatus).toBe("stale");
  await waitFor(() => expect(result.current.catalogStatus).toBe("ready"));
  expect(fetchStopCatalog).toHaveBeenCalledTimes(1);
  expect(result.current.stops[0].name).toBe("Kauppatori");
});

test("uses a fresh coordinate-complete cache without unnecessary provider requests", () => {
  const savedAt = Date.now();
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt,
      stops: [
        {
          id: "164",
          name: "Kauppatori",
          lat: 60.4518,
          lon: 22.2666,
        },
      ],
    })
  );

  const { result } = renderHook(() => useStopCatalog());

  expect(result.current.stops).toEqual([
    expect.objectContaining({ id: "164", name: "Kauppatori" }),
  ]);
  expect(result.current.catalogStatus).toBe("ready");
  expect(result.current.coordinatesStatus).toBe("ready");
  expect(result.current.catalogSavedAt).toBe(savedAt);
  expect(fetchStopCatalog).not.toHaveBeenCalled();
  expect(fetchStopCoordinates).not.toHaveBeenCalled();
});

test("refreshes a stale cache and exposes the new catalogue version only after success", async () => {
  const staleSavedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: staleSavedAt,
      stops: [{ id: "164", name: "Old market" }],
    })
  );

  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );
  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Kauppatori" },
  ]);

  const { result } = renderHook(() => useStopCatalog());

  expect(result.current.catalogStatus).toBe("stale");

  await waitFor(() => {
    expect(result.current.catalogStatus).toBe("ready");
  });

  expect(result.current.catalogSavedAt).toBeGreaterThan(staleSavedAt);
  expect(result.current.stops).toEqual([
    {
      id: "164",
      name: "Kauppatori",
      lat: 60.4518,
      lon: 22.2666,
    },
  ]);
});

test("keeps stale stop search usable when catalogue refresh fails", async () => {
  const staleSavedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: staleSavedAt,
      stops: [
        {
          id: "164",
          name: "Cached Kauppatori",
          lat: 60.4518,
          lon: 22.2666,
        },
      ],
    })
  );

  vi.mocked(fetchStopCatalog).mockRejectedValue(
    new Error("catalogue temporarily unavailable")
  );
  vi.mocked(fetchStopCoordinates).mockRejectedValue(
    new Error("coordinates temporarily unavailable")
  );

  const { result } = renderHook(() => useStopCatalog());

  await waitFor(() => {
    expect(result.current.catalogStatus).toBe("stale");
  });

  expect(result.current.stops).toEqual([
    expect.objectContaining({
      id: "164",
      name: "Cached Kauppatori",
    }),
  ]);
  expect(result.current.catalogSavedAt).toBe(staleSavedAt);
  expect(result.current.coordinatesStatus).toBe("ready");
});

test("recovers coordinates when connectivity returns without re-requesting a healthy catalogue", async () => {
  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Kauppatori" },
  ]);
  vi.mocked(fetchStopCoordinates)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Map([["164", { lat: 60.4518, lon: 22.2666 }]]));

  const { result } = renderHook(() => useStopCatalog());

  await waitFor(() => {
    expect(result.current.coordinatesStatus).toBe("unavailable");
  });
  await waitFor(() => {
    expect(result.current.catalogStatus).toBe("ready");
  });
  expect(fetchStopCatalog).toHaveBeenCalledTimes(1);

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await waitFor(() => {
    expect(result.current.coordinatesStatus).toBe("ready");
  });
  expect(result.current.stops).toEqual([
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  ]);

  // The failed resource recovered on its own; the healthy one was not redone.
  expect(fetchStopCoordinates).toHaveBeenCalledTimes(2);
  expect(fetchStopCatalog).toHaveBeenCalledTimes(1);
});

test("recovers the catalogue when connectivity returns", async () => {
  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );
  vi.mocked(fetchStopCatalog)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([{ id: "164", name: "Kauppatori" }]);

  const { result } = renderHook(() => useStopCatalog());

  await waitFor(() => {
    expect(result.current.catalogStatus).toBe("unavailable");
  });

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await waitFor(() => {
    expect(result.current.catalogStatus).toBe("ready");
  });
  expect(result.current.stops).toEqual([
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  ]);
  expect(fetchStopCatalog).toHaveBeenCalledTimes(2);
});

// One bad entry in the saved catalogue took the whole app to its error
// screen, and a reload read the same entry back: nothing could recover it.
test("skips saved stops that are not stops instead of crashing on them", () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: Date.now(),
      stops: [
        null,
        "Kauppatori",
        { id: 164 },
        { id: "32" },
        { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
      ],
    })
  );

  const { result } = renderHook(() => useStopCatalog());

  expect(result.current.stops).toEqual([
    expect.objectContaining({ id: "164", name: "Kauppatori" }),
  ]);
});

// Emptied by that check but still stamped fresh, the catalogue was never
// asked for again, and name search stayed off for a day.
test("fetches the catalogue again when nothing saved in it was a stop", async () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ savedAt: Date.now(), stops: [null, { id: 164 }] })
  );
  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Kauppatori" },
  ]);
  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );

  const { result } = renderHook(() => useStopCatalog());

  await waitFor(() => expect(result.current.catalogStatus).toBe("ready"));
  expect(fetchStopCatalog).toHaveBeenCalledTimes(1);
  expect(result.current.stops).toEqual([
    expect.objectContaining({ id: "164", name: "Kauppatori" }),
  ]);
});


test("refreshes a cache that becomes stale during a long-lived session", async () => {
  const start = Date.UTC(2026, 8, 29, 9, 0, 0);
  let now = start;
  const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: start,
      stops: [
        {
          id: "164",
          name: "Kauppatori",
          lat: 60.4518,
          lon: 22.2666,
        },
      ],
    })
  );

  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Kauppatori updated" },
  ]);
  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );

  const { result, rerender } = renderHook(() => useStopCatalog());

  expect(result.current.catalogStatus).toBe("ready");
  expect(fetchStopCatalog).not.toHaveBeenCalled();

  now = start + 24 * 60 * 60 * 1000 + 1;
  rerender();

  await waitFor(() => expect(fetchStopCatalog).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(result.current.stops[0].name).toBe("Kauppatori updated")
  );

  dateNow.mockRestore();
});


test("refreshes catalogue and coordinates after a first network load ages past the TTL", async () => {
  const start = Date.UTC(2026, 8, 29, 10, 0, 0);
  let now = start;
  const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);

  vi.mocked(fetchStopCatalog)
    .mockResolvedValueOnce([{ id: "164", name: "Kauppatori v1" }])
    .mockResolvedValueOnce([{ id: "164", name: "Kauppatori v2" }]);
  vi.mocked(fetchStopCoordinates)
    .mockResolvedValueOnce(
      new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
    )
    .mockResolvedValueOnce(
      new Map([["164", { lat: 60.4519, lon: 22.2667 }]])
    );

  const { result, rerender } = renderHook(() => useStopCatalog());

  await waitFor(() => expect(result.current.catalogStatus).toBe("ready"));
  await waitFor(() => expect(result.current.coordinatesStatus).toBe("ready"));
  expect(fetchStopCatalog).toHaveBeenCalledTimes(1);
  expect(fetchStopCoordinates).toHaveBeenCalledTimes(1);
  expect(result.current.stops).toEqual([
    {
      id: "164",
      name: "Kauppatori v1",
      lat: 60.4518,
      lon: 22.2666,
    },
  ]);

  now = start + 24 * 60 * 60 * 1000 + 1;
  rerender();

  await waitFor(() => expect(fetchStopCatalog).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(fetchStopCoordinates).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(result.current.stops).toEqual([
      {
        id: "164",
        name: "Kauppatori v2",
        lat: 60.4519,
        lon: 22.2667,
      },
    ])
  );

  dateNow.mockRestore();
});


test("refreshes legacy cached coordinates once without re-fetching a fresh catalogue", async () => {
  const now = Date.now();
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: now,
      // Legacy v2 cache: coordinates exist, but there is no independent
      // coordinatesSavedAt yet.
      stops: [
        {
          id: "164",
          name: "Kauppatori",
          lat: 60.4517,
          lon: 22.2665,
        },
      ],
    })
  );

  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );

  const { result } = renderHook(() => useStopCatalog());

  await waitFor(() => expect(fetchStopCoordinates).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(result.current.stops[0]).toEqual(
      expect.objectContaining({ lat: 60.4518, lon: 22.2666 })
    )
  );

  expect(fetchStopCatalog).not.toHaveBeenCalled();

  const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
  expect(stored.coordinatesSavedAt).toBeGreaterThan(0);
});

test("a successful catalogue refresh never disguises stale coordinates as fresh", async () => {
  const start = Date.UTC(2026, 8, 29, 10, 0, 0);
  const staleAt = start - 2 * 24 * 60 * 60 * 1000;
  const dateNow = vi.spyOn(Date, "now").mockReturnValue(start);

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: staleAt,
      coordinatesSavedAt: staleAt,
      stops: [
        {
          id: "164",
          name: "Old Kauppatori",
          lat: 60.4517,
          lon: 22.2665,
        },
      ],
    })
  );

  vi.mocked(fetchStopCatalog).mockResolvedValue([
    { id: "164", name: "Fresh Kauppatori" },
  ]);
  vi.mocked(fetchStopCoordinates).mockRejectedValue(
    new Error("coordinates unavailable")
  );

  const first = renderHook(() => useStopCatalog());

  await waitFor(() => expect(first.result.current.catalogStatus).toBe("ready"));
  await waitFor(() => expect(fetchStopCoordinates).toHaveBeenCalledTimes(1));

  const storedAfterCatalogue = JSON.parse(localStorage.getItem(CACHE_KEY));
  expect(storedAfterCatalogue.savedAt).toBe(start);
  expect(storedAfterCatalogue.coordinatesSavedAt).toBe(staleAt);
  expect(storedAfterCatalogue.stops[0]).toEqual(
    expect.objectContaining({
      name: "Fresh Kauppatori",
      lat: 60.4517,
      lon: 22.2665,
    })
  );

  first.unmount();
  vi.mocked(fetchStopCatalog).mockClear();
  vi.mocked(fetchStopCoordinates).mockClear();
  vi.mocked(fetchStopCoordinates).mockResolvedValue(
    new Map([["164", { lat: 60.4518, lon: 22.2666 }]])
  );

  const reopened = renderHook(() => useStopCatalog());

  await waitFor(() => expect(fetchStopCoordinates).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(reopened.result.current.stops[0]).toEqual(
      expect.objectContaining({ lat: 60.4518, lon: 22.2666 })
    )
  );

  // The catalogue itself was genuinely fresh, so only the failed resource
  // is retried after reload.
  expect(fetchStopCatalog).not.toHaveBeenCalled();

  dateNow.mockRestore();
});
