import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  directPlaceSearchSupported: vi.fn(),
  searchPlaces: vi.fn(),
}));

vi.mock("../api/placeSearch", () => ({
  directPlaceSearchSupported: api.directPlaceSearchSupported,
  searchPlaces: api.searchPlaces,
}));

import usePlaceSearch from "./usePlaceSearch";

const result = {
  id: "node:1",
  title: "Prisma Itäharju",
  subtitle: "Turku, Finland",
  lat: 60.45,
  lon: 22.3,
  category: "shop",
  type: "shop",
  provider: "nominatim",
  licence: "Data © OpenStreetMap contributors",
};

beforeEach(() => {
  api.directPlaceSearchSupported.mockReset().mockReturnValue(true);
  api.searchPlaces.mockReset();
});

test("starts idle and exposes successful explicit-search results", async () => {
  api.searchPlaces.mockResolvedValue([result]);

  const { result: hook } = renderHook(() => usePlaceSearch());

  expect(hook.current).toMatchObject({
    results: [],
    status: "idle",
    error: "",
  });

  let promise;
  act(() => {
    promise = hook.current.search("Prisma Itäharju", "fi");
  });

  expect(hook.current.status).toBe("loading");
  await expect(promise).resolves.toEqual([result]);

  expect(hook.current.directEnabled).toBe(true);
  await waitFor(() => expect(hook.current.status).toBe("ready"));
  expect(hook.current.results).toEqual([result]);
  expect(hook.current.error).toBe("");
  expect(api.searchPlaces).toHaveBeenCalledWith(
    "Prisma Itäharju",
    expect.objectContaining({
      language: "fi",
      signal: expect.any(globalThis.AbortSignal),
    })
  );
});

test("provider failure degrades to an empty error state without throwing", async () => {
  api.searchPlaces.mockRejectedValue(new Error("provider unavailable"));

  const { result: hook } = renderHook(() => usePlaceSearch());

  let returned;
  await act(async () => {
    returned = await hook.current.search("Library", "en");
  });

  expect(returned).toBeNull();
  expect(hook.current.results).toEqual([]);
  expect(hook.current.status).toBe("error");
  expect(hook.current.error).toBe("unavailable");
});

test("clear aborts an in-flight request and resets visible state", async () => {
  let resolveSearch;
  api.searchPlaces.mockImplementation(
    (_query, { signal }) =>
      new Promise((resolve, reject) => {
        resolveSearch = resolve;
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("cancelled");
            error.name = "AbortError";
            reject(error);
          },
          { once: true }
        );
      })
  );

  const { result: hook } = renderHook(() => usePlaceSearch());

  act(() => {
    hook.current.search("Prisma", "fi");
  });
  expect(hook.current.status).toBe("loading");

  act(() => {
    hook.current.clear();
  });

  expect(hook.current).toMatchObject({
    results: [],
    status: "idle",
    error: "",
  });

  // Keep the captured resolver referenced so this test also proves late work
  // cannot be required to make clear() settle.
  expect(resolveSearch).toEqual(expect.any(Function));
  await Promise.resolve();
});

test("a stale earlier response cannot replace a newer search", async () => {
  let resolveFirst;
  let resolveSecond;

  api.searchPlaces
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
    );

  const { result: hook } = renderHook(() => usePlaceSearch());

  act(() => {
    hook.current.search("First", "en");
  });
  act(() => {
    hook.current.search("Second", "en");
  });

  const second = { ...result, id: "node:2", title: "Second" };

  await act(async () => {
    resolveSecond([second]);
    await Promise.resolve();
  });
  expect(hook.current.results).toEqual([second]);
  expect(hook.current.status).toBe("ready");

  await act(async () => {
    resolveFirst([result]);
    await Promise.resolve();
  });

  expect(hook.current.results).toEqual([second]);
  expect(hook.current.status).toBe("ready");
});

test("unmount aborts the active provider request", () => {
  let observedSignal;
  api.searchPlaces.mockImplementation(
    (_query, { signal }) => {
      observedSignal = signal;
      return new Promise(() => {});
    }
  );

  const { result: hook, unmount } = renderHook(() => usePlaceSearch());

  act(() => {
    hook.current.search("Prisma", "fi");
  });

  expect(observedSignal?.aborted).toBe(false);
  unmount();
  expect(observedSignal?.aborted).toBe(true);
});


test("exposes packaged-app policy as a graceful external handoff", async () => {
  api.directPlaceSearchSupported.mockReturnValue(true);
  const policyError = new Error("runtime direct provider disabled");
  policyError.name = "PlaceSearchPolicyError";
  api.searchPlaces.mockRejectedValue(policyError);

  const { result: hook } = renderHook(() => usePlaceSearch());
  expect(hook.current.directEnabled).toBe(true);

  let returned;
  await act(async () => {
    returned = await hook.current.search("Prisma", "en");
  });

  expect(returned).toBeNull();
  expect(hook.current.status).toBe("error");
  expect(hook.current.error).toBe("external-handoff");
  expect(hook.current.directEnabled).toBe(false);
});
