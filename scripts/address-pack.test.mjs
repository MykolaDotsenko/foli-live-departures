import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import {
  ADDRESS_FIELDS,
  STREET_FIELDS,
  addressPack,
  addressPackProblems,
  addressRows,
} from "./address-pack.mjs";

const elements = [
  {
    type: "node",
    id: 1,
    lat: 60.45,
    lon: 22.26,
    tags: { "addr:street": "Tampereentie", "addr:housenumber": "12", "addr:city": "Turku" },
  },
  {
    type: "way",
    id: 2,
    center: { lat: 60.46, lon: 22.27 },
    tags: { highway: "residential", name: "Tampereentie" },
  },
  {
    type: "way",
    id: 3,
    center: { lat: 60.44, lon: 22.25 },
    tags: { highway: "residential", name: "Linnankatu" },
  },
];

test("compacts real addresses and deduplicates road segments", () => {
  const rows = addressRows([...elements, elements[1]]);
  assert.deepEqual(rows.addresses, [["Tampereentie", "12", 60.45, 22.26, "Turku"]]);
  assert.deepEqual(rows.streets, [
    ["Linnankatu", 60.44, 22.25, ""],
    ["Tampereentie", 60.46, 22.27, ""],
  ]);
});

test("pack carries ODbL metadata and verifier contracts", () => {
  const rows = {
    addresses: Array.from({ length: 5_000 }, (_, i) => [
      "Testikatu",
      String(i + 1),
      60.45,
      22.26,
      "Turku",
    ]),
    streets: Array.from({ length: 400 }, (_, i) => [
      `Katu ${i}`,
      60.45,
      22.26,
      "",
    ]),
  };
  const pack = addressPack(rows, "2026-10-04T00:00:00Z");
  assert.deepEqual(pack.addressFields, ADDRESS_FIELDS);
  assert.deepEqual(pack.streetFields, STREET_FIELDS);
  assert.equal(pack.license, "ODbL-1.0");
  const body = JSON.stringify(pack);
  assert.deepEqual(addressPackProblems(pack, Buffer.byteLength(body)), []);
});
