import { expect, test } from "vitest";
import { parseAddressPack } from "../api/addressPack";
import { findAddresses } from "./localAddresses";

const pack = parseAddressPack({
  addressFields: ["street", "house", "lat", "lon", "city"],
  streetFields: ["street", "lat", "lon", "city"],
  addresses: [
    ["Tampereentie", "12", 60.47, 22.27, "Turku"],
    ["Tampereentie", "120", 60.48, 22.28, "Turku"],
    ["Linnankatu", "80", 60.435, 22.229, "Turku"],
    ["Hämeenkatu", "12", 60.451, 22.28, "Turku"],
  ],
  streets: [
    ["Hämeenkatu", 60.451, 22.28, "Turku"],
    ["Linnankatu", 60.445, 22.25, "Turku"],
    ["Tampereentie", 60.47, 22.27, "Turku"],
  ],
});

const titles = (rows) => rows.map((row) => row.title);

test("finds an exact address before longer house-number prefixes", () => {
  expect(titles(findAddresses(pack, "Tampereentie 12"))).toEqual([
    "Tampereentie 12",
    "Tampereentie 120",
  ]);
});

test("street-only search returns one street result instead of every house", () => {
  expect(titles(findAddresses(pack, "Tampereentie"))).toEqual(["Tampereentie"]);
});

test("long street names tolerate a small typing slip", () => {
  expect(titles(findAddresses(pack, "Tamperentie 12"))[0]).toBe("Tampereentie 12");
  expect(titles(findAddresses(pack, "Linnanktu"))).toEqual(["Linnankatu"]);
});

test("a bare house number is never treated as a destination", () => {
  expect(findAddresses(pack, "12")).toEqual([]);
});

test("normalization handles Finnish diacritics", () => {
  expect(titles(findAddresses(pack, "hameenkatu 12"))).toEqual(["Hämeenkatu 12"]);
});

test("equal address scores can be sorted nearest first without storing location", () => {
  const rows = findAddresses(pack, "Tampereentie 1", {
    origin: { lat: 60.4801, lon: 22.2801 },
  });
  expect(rows[0].title).toBe("Tampereentie 120");
  expect(rows[0].distanceMeters).toBeLessThan(rows[1].distanceMeters);
});
