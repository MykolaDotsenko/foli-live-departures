import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_PLACE_COUNT,
  overpassQuery,
  placePack,
  placePackProblems,
  placeRows,
} from "./place-pack.mjs";

test("the query covers the six Föli municipalities", () => {
  const query = overpassQuery();
  for (const name of ["Turku", "Kaarina", "Raisio", "Naantali", "Lieto", "Rusko"]) {
    assert.match(query, new RegExp(`area\\["name"="${name}"\\]`));
  }
  assert.match(query, /out center tags;/);
});

test("elements become compact rows, one per place", () => {
  const rows = placeRows([
    { type: "node", id: 1, lat: 60.4489, lon: 22.2925, tags: { name: "Lidl  Kupittaa", shop: "supermarket" } },
    // The same shop as its building, with an address: kept instead.
    {
      type: "way",
      id: 2,
      center: { lat: 60.44893, lon: 22.29251 },
      tags: { name: "Lidl Kupittaa", "addr:street": "Uudenmaankatu", "addr:housenumber": "18", "addr:city": "Turku" },
    },
    { type: "node", id: 3, lat: 60.455, lon: 22.285, tags: { name: "Turun yliopisto", "name:sv": "Åbo universitet" } },
    { type: "node", id: 4, lat: 60.45, lon: 22.3, tags: { name: "Private gym", access: "private" } },
    { type: "node", id: 5, lat: 60.45, lon: 22.3, tags: { shop: "supermarket" } },
  ]);
  assert.deepEqual(rows, [
    ["w2", "Lidl Kupittaa", 60.44893, 22.29251, "Uudenmaankatu 18", "Turku"],
    ["n3", "Turun yliopisto", 60.455, 22.285, "", "", "Åbo universitet"],
  ]);
});

test("a pack too small, unlicensed or outside the area is not fit to ship", () => {
  const row = (index) => [`n${index}`, `Place ${index}`, 60.45, 22.27];
  const enough = Array.from({ length: MIN_PLACE_COUNT }, (_, index) => row(index));
  assert.deepEqual(placePackProblems(placePack(enough, "2026-10-04T00:00:00Z"), 10_000), []);

  assert.match(
    placePackProblems(placePack(enough.slice(0, 3), "2026-10-04T00:00:00Z"), 100).join(" "),
    /at least/
  );
  assert.match(
    placePackProblems({ ...placePack(enough, "2026-10-04T00:00:00Z"), license: "" }, 100).join(" "),
    /ODbL/
  );
  assert.match(
    placePackProblems(placePack([...enough, ["n999", "Helsinki", 60.17, 24.94]], "2026-10-04T00:00:00Z"), 100).join(" "),
    /outside the Föli area/
  );
  assert.match(
    placePackProblems(placePack(enough, "2026-10-04T00:00:00Z"), 500_000).join(" "),
    /budget/
  );
});
