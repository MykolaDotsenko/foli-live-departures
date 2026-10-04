import { afterEach, expect, test, vi } from "vitest";
import { loadPlacePack, parsePlacePack, resetPlacePackForTests } from "./placePack";

const FIELDS = ["id", "name", "lat", "lon", "street", "city", "nameSv"];

afterEach(() => {
  resetPlacePackForTests();
  vi.unstubAllGlobals();
});

test("reads compact rows into searchable places", () => {
  const [place] = parsePlacePack({
    fields: FIELDS,
    places: [["n1", "Turun yliopisto", 60.455, 22.285, "Yliopistonmäki", "Turku", "Åbo universitet"]],
  });
  expect(place).toMatchObject({
    id: "n1",
    name: "Turun yliopisto",
    street: "Yliopistonmäki",
    city: "Turku",
    nameSv: "Åbo universitet",
  });
  expect(place.nameWords).toEqual(["turun", "yliopisto", "abo", "universitet"]);
  expect(place.otherWords).toEqual(["yliopistonmaki", "turku"]);
});

test("a pack in another shape is not read at all", () => {
  expect(parsePlacePack({ fields: ["id", "name"], places: [["n1", "X"]] })).toEqual([]);
  expect(parsePlacePack(null)).toEqual([]);
  expect(
    parsePlacePack({ fields: FIELDS, places: [["n1", "No position"], ["n2", "Ok", 60.4, 22.2]] })
  ).toHaveLength(1);
});

test("loads once, and tries again after a failed load", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      ok: true,
      json: async () => ({ fields: FIELDS, places: [["n1", "Lidl", 60.45, 22.29]] }),
    });
  vi.stubGlobal("fetch", fetch);

  expect(await loadPlacePack()).toEqual([]);
  expect(await loadPlacePack()).toHaveLength(1);
  expect(await loadPlacePack()).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toMatch(/places\/foli-places\.json$/);
});
