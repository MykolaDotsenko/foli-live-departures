import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import useSavedPlaces, { placeLabel } from "./useSavedPlaces";
import { resetLanguageForTests } from "../i18n";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  resetLanguageForTests("en");
});

// A place saved in one language must read correctly in the other, and code
// that tells Home by its stored label must keep working.
test("stores a place saved in Finnish exactly as in English, and names it in either", () => {
  resetLanguageForTests("fi");
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "home",
      primaryStopId: "164",
      stops: [{ id: "164", name: "Kauppatori" }, { id: "999", name: "" }],
    });
  });

  const [stored] = JSON.parse(localStorage.getItem("foli-my-places-v1"));
  expect(stored.label).toBe("Home");
  // A nameless stop is stored without a stand-in, so no language is baked
  // into it: the screen calls it "Pysäkki 999" or "Stop 999".
  expect(stored.stops).toEqual([
    { id: "164", name: "Kauppatori" },
    { id: "999", name: "" },
  ]);
  expect(placeLabel(result.current.byId.get("home"))).toBe("Koti");

  resetLanguageForTests("en");
  const reopened = renderHook(() => useSavedPlaces()).result.current;
  expect(reopened.byId.get("home").label).toBe("Home");
  expect(placeLabel(reopened.byId.get("home"))).toBe("Home");
});

test("names each place by its id, whatever label it carries", () => {
  resetLanguageForTests("fi");

  expect(placeLabel({ id: "school", label: "School" })).toBe("Koulu");
  expect(placeLabel({ id: "work", label: "anything" })).toBe("Työ");
  expect(placeLabel({ id: "unknown", label: "Cabin" })).toBe("Cabin");
  expect(placeLabel(null)).toBe("");
});

test("stores only public safe-stop identity and never private setup coordinates", () => {
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "home",
      primaryStopId: "164",
      stops: [
        {
          id: "164",
          name: "Kauppatori",
          lat: 60.4518,
          lon: 22.2666,
          distanceMeters: 18,
        },
        {
          id: "32",
          name: "Puistokatu",
          lat: 60.4488,
          lon: 22.255,
        },
      ],
    });
  });

  expect(result.current.byId.get("home")).toEqual(
    expect.objectContaining({
      id: "home",
      label: "Home",
      primaryStopId: "164",
      stops: [
        { id: "164", name: "Kauppatori" },
        { id: "32", name: "Puistokatu" },
      ],
    })
  );

  const stored = localStorage.getItem("foli-my-places-v1");
  expect(stored).not.toContain("60.4518");
  expect(stored).not.toContain("22.2666");
  expect(stored).not.toContain("distanceMeters");
  expect(stored).not.toContain("address");
});

test("can change the primary safe stop and remove a place", () => {
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "school",
      primaryStopId: "100",
      stops: [
        { id: "100", name: "School east" },
        { id: "101", name: "School west" },
      ],
    });
  });

  act(() => {
    result.current.setPrimaryStop("school", "101");
  });

  expect(result.current.byId.get("school").primaryStopId).toBe("101");

  act(() => {
    result.current.removePlace("school");
  });

  expect(result.current.byId.has("school")).toBe(false);
});


test("revalidates saved stops against a fresh public catalogue without storing coordinates", () => {
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "home",
      primaryStopId: "164",
      stops: [
        { id: "164", name: "Old market name" },
        { id: "999", name: "Removed stop" },
      ],
    });
  });

  act(() => {
    result.current.revalidatePlaces(
      [
        { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
        { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
      ],
      1_700_000_000_000
    );
  });

  const home = result.current.byId.get("home");
  expect(home.stops[0]).toEqual({ id: "164", name: "Kauppatori" });
  expect(home.stops[1]).toEqual({ id: "999", name: "Removed stop" });
  expect(home.needsReview).toBe(true);
  expect(home.validatedAt).toBeGreaterThan(0);

  const stored = localStorage.getItem("foli-my-places-v1");
  expect(stored).not.toContain("60.4518");
  expect(stored).not.toContain("22.2666");
});

test("clears a place's review state once every saved stop exists again", () => {
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "work",
      primaryStopId: "100",
      stops: [{ id: "100", name: "Work stop" }],
    });
    result.current.revalidatePlaces(
      [{ id: "101", name: "Other stop" }],
      1_700_000_000_000
    );
  });

  expect(result.current.byId.get("work").needsReview).toBe(true);

  act(() => {
    result.current.revalidatePlaces(
      [{ id: "100", name: "Work stop renamed" }],
      1_700_000_100_000
    );
  });

  expect(result.current.byId.get("work").needsReview).toBe(false);
  expect(result.current.byId.get("work").stops[0].name).toBe("Work stop renamed");
});


test("future stored validation timestamps cannot block catalogue revalidation", () => {
  const now = Date.now();
  localStorage.setItem(
    "foli-my-places-v1",
    JSON.stringify([
      {
        id: "home",
        label: "Home",
        stops: [{ id: "164", name: "Old name" }],
        primaryStopId: "164",
        updatedAt: now + 60_000,
        validatedAt: now + 60_000,
      },
    ])
  );

  const { result } = renderHook(() => useSavedPlaces());

  expect(result.current.byId.get("home").validatedAt).toBe(0);

  act(() => {
    result.current.revalidatePlaces(
      [{ id: "164", name: "Kauppatori" }],
      now
    );
  });

  expect(result.current.byId.get("home")).toEqual(
    expect.objectContaining({
      validatedAt: now,
      stops: [{ id: "164", name: "Kauppatori" }],
    })
  );
});

test("validates a place saved after the catalogue was already loaded", () => {
  const { result } = renderHook(() => useSavedPlaces());

  act(() => {
    result.current.savePlace({
      id: "home",
      primaryStopId: "999",
      stops: [{ id: "999", name: "Shared old stop" }],
    });
  });

  expect(result.current.byId.get("home").validatedAt).toBe(0);

  act(() => {
    result.current.revalidatePlaces(
      [{ id: "164", name: "Kauppatori" }],
      1_700_000_000_000
    );
  });

  expect(result.current.byId.get("home")).toEqual(
    expect.objectContaining({
      needsReview: true,
      validatedAt: 1_700_000_000_000,
    })
  );
});

// School imported in one tab was erased by any Home action in another tab,
// which wrote its older list back.
test("takes in a place saved in another tab before writing its own change", () => {
  localStorage.setItem(
    "foli-my-places-v1",
    JSON.stringify([
      { id: "home", stops: [{ id: "164", name: "Kauppatori" }], primaryStopId: "164" },
    ])
  );
  const { result } = renderHook(() => useSavedPlaces());

  const otherTab = JSON.stringify([
    { id: "home", stops: [{ id: "164", name: "Kauppatori" }], primaryStopId: "164" },
    { id: "school", stops: [{ id: "4", name: "Turun linna" }], primaryStopId: "4" },
  ]);
  localStorage.setItem("foli-my-places-v1", otherTab);
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-my-places-v1",
        newValue: otherTab,
      })
    );
  });

  act(() => {
    result.current.savePlace({
      id: "home",
      stops: [
        { id: "164", name: "Kauppatori" },
        { id: "32", name: "Puistokatu" },
      ],
      primaryStopId: "164",
    });
  });

  expect(result.current.byId.has("school")).toBe(true);
  expect(
    JSON.parse(localStorage.getItem("foli-my-places-v1")).map((place) => place.id)
  ).toEqual(["school", "home"]);
});
