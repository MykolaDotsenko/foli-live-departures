import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import useSavedStops, { stopToReopen } from "./useSavedStops";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

beforeEach(() => {
  localStorage.clear();
});

test("keeps favorites and recent stops local-first", () => {
  const { result } = renderHook(() => useSavedStops());

  act(() => {
    result.current.rememberRecent({ id: "164", name: "Kauppatori" });
    result.current.toggleFavorite({ id: "164", name: "Kauppatori" });
  });

  expect(result.current.recents).toEqual([
    { id: "164", name: "Kauppatori", viewedAt: expect.any(Number) },
  ]);
  expect(result.current.favoriteIds.has("164")).toBe(true);
});

test("deduplicates recents and keeps the newest stop first", () => {
  const { result } = renderHook(() => useSavedStops());

  act(() => {
    result.current.rememberRecent({ id: "164", name: "Kauppatori" });
    result.current.rememberRecent({ id: "4", name: "Turun linna" });
    result.current.rememberRecent({ id: "164", name: "Kauppatori" });
  });

  expect(result.current.recents.map((stop) => stop.id)).toEqual(["164", "4"]);
});

// An earlier version stored "Stop 164" for a stop it could not name, which
// then stayed English in the Finnish interface.
test("reads a stored stand-in name as no name at all", () => {
  localStorage.setItem(
    "foli-saved-stops-v1",
    JSON.stringify({ favorites: [{ id: "164", name: "Stop 164" }], recents: [] })
  );

  const { result } = renderHook(() => useSavedStops());

  expect(result.current.favorites).toEqual([{ id: "164", name: "" }]);
});

function store(state) {
  localStorage.setItem("foli-saved-stops-v1", JSON.stringify(state));
}

const HOUR = 60 * 60 * 1000;

// A bare address, which is what the home-screen icon opens, starts where a
// daily passenger left off instead of with an empty search.
test("reopens the stop looked at in the last 12 hours, or else the first favourite", () => {
  const now = Date.parse("2026-09-26T07:30:00Z");
  store({
    favorites: [{ id: "4", name: "Turun linna" }, { id: "32", name: "Puistokatu" }],
    recents: [{ id: "164", name: "Kauppatori", viewedAt: now - 2 * HOUR }],
  });
  expect(stopToReopen(now)).toBe("164");

  expect(stopToReopen(now + 11 * HOUR)).toBe("4");
});

test("does not reopen a recent stop whose timestamp is in the future", () => {
  const now = Date.parse("2026-09-26T07:30:00Z");
  store({
    favorites: [{ id: "4", name: "Turun linna" }],
    recents: [{ id: "164", name: "Kauppatori", viewedAt: now + HOUR }],
  });

  expect(stopToReopen(now)).toBe("4");
});

test("a first visit, or a recent stop from before timestamps, reopens nothing", () => {
  expect(stopToReopen()).toBe("");

  store({ favorites: [], recents: [{ id: "164", name: "Kauppatori" }] });
  expect(stopToReopen()).toBe("");

  localStorage.setItem("foli-saved-stops-v1", "{not json");
  expect(stopToReopen()).toBe("");
});

test("a stop looked at now is the one to reopen", () => {
  const { result } = renderHook(() => useSavedStops());

  act(() => {
    result.current.rememberRecent({ id: "4", name: "Turun linna" });
    result.current.rememberRecent({ id: "164", name: "Kauppatori" });
  });

  expect(stopToReopen()).toBe("164");
});

// Open in two tabs, a favourite starred in one was wiped out by the other
// writing its older copy back the next time it opened a stop.
test("takes in a favourite saved in another tab before writing its own change", () => {
  const { result } = renderHook(() => useSavedStops());

  // The other tab stars Puistokatu.
  const otherTab = JSON.stringify({
    favorites: [{ id: "32", name: "Puistokatu" }],
    recents: [],
  });
  localStorage.setItem("foli-saved-stops-v1", otherTab);
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-saved-stops-v1",
        newValue: otherTab,
      })
    );
  });

  act(() => {
    result.current.rememberRecent({ id: "164", name: "Kauppatori" });
  });

  expect(result.current.favoriteIds.has("32")).toBe(true);
  expect(
    JSON.parse(localStorage.getItem("foli-saved-stops-v1")).favorites
  ).toEqual([{ id: "32", name: "Puistokatu" }]);
});


test("refreshes favourites immediately after a same-tab backup import", () => {
  const { result } = renderHook(() => useSavedStops());

  localStorage.setItem(
    "foli-saved-stops-v1",
    JSON.stringify({
      favorites: [{ id: "32", name: "Puistokatu" }],
      recents: [],
    })
  );

  act(() => {
    window.dispatchEvent(new Event(LOCAL_STATE_IMPORTED_EVENT));
  });

  expect(result.current.favorites).toEqual([
    { id: "32", name: "Puistokatu" },
  ]);
});
