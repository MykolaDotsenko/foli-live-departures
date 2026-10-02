import { beforeEach, describe, expect, test } from "vitest";
import {
  applyPreparedLocalStateImport,
  BACKUP_KIND,
  BACKUP_VERSION,
  createLocalStateBackup,
  LOCAL_STATE_KEYS,
  MAX_BACKUP_BYTES,
  prepareLocalStateImport,
  serializeLocalStateBackup,
} from "./localStateBackup";

function seed(key, value) {
  localStorage.setItem(
    key,
    typeof value === "string" ? value : JSON.stringify(value)
  );
}

beforeEach(() => {
  localStorage.clear();
});

test("export contains only explicit portable state and never transient/private state", () => {
  seed(LOCAL_STATE_KEYS.places, [
    {
      id: "home",
      label: "Home",
      stops: [{ id: "123", name: "Kauppatori" }],
      primaryStopId: "123",
      updatedAt: 1000,
      validatedAt: 999,
      needsReview: true,
    },
  ]);
  seed(LOCAL_STATE_KEYS.savedStops, {
    favorites: [{ id: "456", name: "Puistokatu" }],
    recents: [
      { id: "999", name: "Private recent sentinel", viewedAt: 123456 },
    ],
  });
  seed(LOCAL_STATE_KEYS.lineFilters, {
    123: { lines: ["1", "32"], savedAt: 2000 },
  });
  seed(LOCAL_STATE_KEYS.language, "fi");
  seed(LOCAL_STATE_KEYS.theme, "dark");

  seed("foli-active-ride-v1", {
    latitude: 60.4518,
    longitude: 22.2666,
    destination: "SECRET-RIDE-SENTINEL",
  });
  seed("foli-active-journey-v1", {
    destination: "SECRET-JOURNEY-SENTINEL",
  });

  const backup = createLocalStateBackup({ now: 3000 });
  const serialized = JSON.stringify(backup);

  expect(backup.kind).toBe(BACKUP_KIND);
  expect(backup.version).toBe(BACKUP_VERSION);
  expect(backup.data.places).toEqual([
    {
      id: "home",
      stops: [{ id: "123", name: "Kauppatori" }],
      primaryStopId: "123",
      updatedAt: 1000,
    },
  ]);
  expect(backup.data.favorites).toEqual([
    { id: "456", name: "Puistokatu" },
  ]);
  expect(backup.data.lineFilters).toEqual([
    { stopId: "123", lines: ["1", "32"], savedAt: 2000 },
  ]);
  expect(backup.data.preferences).toEqual({
    language: "fi",
    theme: "dark",
  });
  expect(serialized).not.toContain("Private recent sentinel");
  expect(serialized).not.toContain("latitude");
  expect(serialized).not.toContain("longitude");
  expect(serialized).not.toContain("SECRET-RIDE-SENTINEL");
  expect(serialized).not.toContain("SECRET-JOURNEY-SENTINEL");
});

test("older imported places and filters never overwrite newer current data", () => {
  seed(LOCAL_STATE_KEYS.places, [
    {
      id: "home",
      label: "Home",
      stops: [{ id: "111", name: "Current Home" }],
      primaryStopId: "111",
      updatedAt: 5000,
    },
  ]);
  seed(LOCAL_STATE_KEYS.lineFilters, {
    111: { lines: ["32"], savedAt: 5000 },
  });
  seed(LOCAL_STATE_KEYS.savedStops, {
    favorites: [{ id: "10", name: "Current favourite" }],
    recents: [{ id: "777", name: "Keep recent", viewedAt: 5000 }],
  });
  seed(LOCAL_STATE_KEYS.language, "fi");
  seed(LOCAL_STATE_KEYS.theme, "dark");

  const prepared = prepareLocalStateImport(
    JSON.stringify({
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      data: {
        places: [
          {
            id: "home",
            stops: [{ id: "222", name: "Older Home" }],
            primaryStopId: "222",
            updatedAt: 1000,
          },
          {
            id: "work",
            stops: [{ id: "333", name: "New Work" }],
            primaryStopId: "333",
            updatedAt: 1000,
          },
        ],
        favorites: [
          { id: "10", name: "Imported duplicate" },
          { id: "20", name: "Imported new" },
        ],
        lineFilters: [
          { stopId: "111", lines: ["1"], savedAt: 1000 },
          { stopId: "222", lines: ["2"], savedAt: 2000 },
        ],
        preferences: { language: "en", theme: "light" },
      },
    })
  );

  expect(prepared.preview).toMatchObject({
    placesAdded: 1,
    placesUpdated: 0,
    placesKept: 1,
    favoritesAdded: 1,
    lineFiltersAdded: 1,
    lineFiltersUpdated: 0,
    lineFiltersKept: 1,
    languageWillImport: false,
    themeWillImport: false,
  });

  applyPreparedLocalStateImport(prepared);

  const places = JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.places));
  expect(places.find((place) => place.id === "home").primaryStopId).toBe("111");
  expect(places.find((place) => place.id === "work").primaryStopId).toBe("333");

  const savedStops = JSON.parse(
    localStorage.getItem(LOCAL_STATE_KEYS.savedStops)
  );
  expect(savedStops.favorites.map((stop) => stop.id)).toEqual(["10", "20"]);
  expect(savedStops.recents).toEqual([
    { id: "777", name: "Keep recent", viewedAt: 5000 },
  ]);

  expect(
    JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.lineFilters))
  ).toEqual({
    111: { lines: ["32"], savedAt: 5000 },
    222: { lines: ["2"], savedAt: 2000 },
  });
  expect(localStorage.getItem(LOCAL_STATE_KEYS.language)).toBe("fi");
  expect(localStorage.getItem(LOCAL_STATE_KEYS.theme)).toBe("dark");
});

test("newer imported values merge into empty or older state without deleting unrelated data", () => {
  seed(LOCAL_STATE_KEYS.places, [
    {
      id: "home",
      label: "Home",
      stops: [{ id: "111", name: "Old Home" }],
      primaryStopId: "111",
      updatedAt: 1000,
    },
  ]);
  seed(LOCAL_STATE_KEYS.savedStops, {
    favorites: [],
    recents: [{ id: "777", name: "Local recent", viewedAt: 5000 }],
  });

  const prepared = prepareLocalStateImport(
    JSON.stringify({
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      data: {
        places: [
          {
            id: "home",
            stops: [{ id: "222", name: "New Home" }],
            primaryStopId: "222",
            updatedAt: 6000,
          },
        ],
        favorites: [{ id: "20", name: "Favourite" }],
        lineFilters: [{ stopId: "222", lines: ["2"], savedAt: 6000 }],
        preferences: { language: "fi", theme: "dark" },
      },
    })
  );

  expect(prepared.preview).toMatchObject({
    placesUpdated: 1,
    favoritesAdded: 1,
    lineFiltersAdded: 1,
    languageWillImport: true,
    themeWillImport: true,
  });

  applyPreparedLocalStateImport(prepared);

  expect(
    JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.places))[0].primaryStopId
  ).toBe("222");
  expect(localStorage.getItem(LOCAL_STATE_KEYS.language)).toBe("fi");
  expect(localStorage.getItem(LOCAL_STATE_KEYS.theme)).toBe("dark");
  expect(
    JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.savedStops)).recents[0].id
  ).toBe("777");
});

describe("validation", () => {
  test.each([
    ["", "backup-empty"],
    ["{", "backup-invalid-json"],
    [JSON.stringify({ version: 1 }), "backup-wrong-kind"],
    [
      JSON.stringify({ kind: BACKUP_KIND, version: 99, data: {} }),
      "backup-unsupported-version",
    ],
  ])("fails closed for invalid backup", (text, code) => {
    expect(() => prepareLocalStateImport(text)).toThrow(code);
  });

  test("rejects oversized imports before parsing", () => {
    const text = "x".repeat(MAX_BACKUP_BYTES + 1);
    expect(() => prepareLocalStateImport(text)).toThrow("backup-too-large");
  });

  test("normalizes malformed entries instead of letting them poison storage", () => {
    const prepared = prepareLocalStateImport(
      JSON.stringify({
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        data: {
          places: [
            { id: "unknown", stops: [{ id: "1", name: "No" }] },
            {
              id: "school",
              stops: [
                { id: "123", name: "  School\u0000 Stop  " },
                { id: "not-a-stop", name: "Bad" },
              ],
              primaryStopId: "not-a-stop",
              updatedAt: Date.now() + 999999,
            },
          ],
          favorites: [
            { id: "123", name: "One" },
            { id: "123", name: "Duplicate" },
            { id: "bad", name: "Bad" },
          ],
          lineFilters: [
            { stopId: "123", lines: [" 1 ", "", "x".repeat(30)] },
          ],
          preferences: { language: "xx", theme: "neon" },
        },
      })
    );

    expect(prepared.incoming.places).toHaveLength(1);
    expect(prepared.incoming.places[0]).toMatchObject({
      id: "school",
      primaryStopId: "123",
      stops: [{ id: "123", name: "School Stop" }],
    });
    expect(prepared.incoming.favorites).toEqual([{ id: "123", name: "One" }]);
    expect(prepared.incoming.lineFilters[0].lines).toEqual(["1"]);
    expect(prepared.incoming.language).toBeNull();
    expect(prepared.incoming.theme).toBeNull();
  });
});

test("serializer produces a stable inspectable JSON document", () => {
  seed(LOCAL_STATE_KEYS.savedStops, {
    favorites: [{ id: "10", name: "Kauppatori" }],
    recents: [],
  });
  const parsed = JSON.parse(
    serializeLocalStateBackup({ now: Date.parse("2026-10-02T00:00:00Z") })
  );

  expect(parsed.exportedAt).toBe("2026-10-02T00:00:00.000Z");
  expect(parsed.data.favorites).toEqual([{ id: "10", name: "Kauppatori" }]);
});


test("a full destination never loses current favourites or filters during merge", () => {
  seed(LOCAL_STATE_KEYS.savedStops, {
    favorites: Array.from({ length: 50 }, (_, index) => ({
      id: String(index + 1),
      name: `Current ${index + 1}`,
    })),
    recents: [],
  });
  seed(
    LOCAL_STATE_KEYS.lineFilters,
    Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        String(index + 1),
        { lines: [`L${index + 1}`], savedAt: 10_000 + index },
      ])
    )
  );

  const prepared = prepareLocalStateImport(
    JSON.stringify({
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      data: {
        favorites: [{ id: "999", name: "Imported extra" }],
        lineFilters: [
          { stopId: "999", lines: ["99"], savedAt: 99_999 },
        ],
      },
    })
  );

  expect(prepared.preview).toMatchObject({
    favoritesAdded: 0,
    favoritesSkipped: 1,
    lineFiltersAdded: 0,
    lineFiltersSkipped: 1,
  });

  applyPreparedLocalStateImport(prepared);

  const saved = JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.savedStops));
  const filters = JSON.parse(localStorage.getItem(LOCAL_STATE_KEYS.lineFilters));
  expect(saved.favorites).toHaveLength(50);
  expect(saved.favorites.some((stop) => stop.id === "999")).toBe(false);
  expect(Object.keys(filters)).toHaveLength(20);
  expect(filters).not.toHaveProperty("999");
});

test("apply rolls back already-written keys when a later storage write fails", () => {
  const state = new Map([
    [LOCAL_STATE_KEYS.places, JSON.stringify([])],
    [
      LOCAL_STATE_KEYS.savedStops,
      JSON.stringify({
        favorites: [{ id: "10", name: "Keep me" }],
        recents: [{ id: "11", name: "Recent", viewedAt: 1000 }],
      }),
    ],
    [LOCAL_STATE_KEYS.lineFilters, JSON.stringify({})],
  ]);
  let failed = false;
  const storage = {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      if (key === LOCAL_STATE_KEYS.savedStops && !failed) {
        failed = true;
        throw new Error("quota");
      }
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
  };

  const prepared = prepareLocalStateImport(
    JSON.stringify({
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      data: {
        places: [
          {
            id: "home",
            stops: [{ id: "164", name: "Kauppatori" }],
            primaryStopId: "164",
            updatedAt: 2000,
          },
        ],
        favorites: [{ id: "20", name: "New" }],
      },
    }),
    { storage }
  );

  expect(() =>
    applyPreparedLocalStateImport(prepared, { storage, target: new EventTarget() })
  ).toThrow("backup-apply-failed");

  expect(JSON.parse(state.get(LOCAL_STATE_KEYS.places))).toEqual([]);
  expect(JSON.parse(state.get(LOCAL_STATE_KEYS.savedStops))).toEqual({
    favorites: [{ id: "10", name: "Keep me" }],
    recents: [{ id: "11", name: "Recent", viewedAt: 1000 }],
  });
  expect(JSON.parse(state.get(LOCAL_STATE_KEYS.lineFilters))).toEqual({});
});
