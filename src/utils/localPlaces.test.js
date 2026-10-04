import { expect, test } from "vitest";
import { parsePlacePack } from "../api/placePack";
import { findPlaces } from "./localPlaces";

const pack = parsePlacePack({
  fields: ["id", "name", "lat", "lon", "street", "city", "nameSv"],
  places: [
    ["n1", "Lidl Kupittaa", 60.4489, 22.2925, "Uudenmaankatu 18", "Turku"],
    ["n2", "Lidl Runosmäki", 60.4905, 22.2580, "Runosmäentie 4", "Turku"],
    ["w3", "Lidl Raisio", 60.4870, 22.1690, "Kauppiaskatu 2", "Raisio"],
    ["w4", "Prisma Itäharju", 60.4500, 22.3170, "Skarppakullantie 2", "Turku"],
    ["w5", "Prisma Länsikeskus", 60.4630, 22.2160, "Tampereentie 2", "Turku"],
    ["n6", "Turun yliopisto", 60.4550, 22.2850, "Yliopistonmäki", "Turku", "Åbo universitet"],
    ["n7", "Turun kaupunginkirjasto", 60.4500, 22.2700, "Linnankatu 2", "Turku"],
  ],
});
const kauppatori = { lat: 60.4518, lon: 22.2666 };
const runosmaki = { lat: 60.489, lon: 22.253 };
const names = (places) => places.map((place) => place.name);

test("every Lidl, nearest first from where the passenger is", () => {
  expect(names(findPlaces(pack, "Lidl", { origin: runosmaki }))).toEqual([
    "Lidl Runosmäki",
    "Lidl Raisio",
    "Lidl Kupittaa",
  ]);
  const fromCentre = findPlaces(pack, "lidl", { origin: kauppatori });
  expect(fromCentre[0].name).toBe("Lidl Kupittaa");
  expect(fromCentre[0].distanceMeters).toBeGreaterThan(1_000);
  expect(fromCentre[0].distanceMeters).toBeLessThan(2_000);
});

test("without a location every match is still listed, by name", () => {
  const places = findPlaces(pack, "lid");
  expect(names(places)).toEqual(["Lidl Kupittaa", "Lidl Raisio", "Lidl Runosmäki"]);
  expect(places.every((place) => place.distanceMeters === null)).toBe(true);
});

// "Prisma tamperentie": the street narrows the Prismas down, through a
// typing slip in it.
test("a street narrows a name down, through a typo", () => {
  expect(names(findPlaces(pack, "Prisma Tampereentie"))).toEqual(["Prisma Länsikeskus"]);
  expect(names(findPlaces(pack, "prisma tamperentie"))).toEqual(["Prisma Länsikeskus"]);
  // A street that matches nothing still offers the Prismas.
  expect(names(findPlaces(pack, "Prisma Hämeenkatu", { origin: kauppatori }))).toEqual([
    "Prisma Itäharju",
    "Prisma Länsikeskus",
  ]);
});

test("a place is found by its name, never by its town or street alone", () => {
  // Every place here is in Turku; "Turku" names none of them.
  expect(findPlaces(pack, "Turku")).toEqual([]);
  expect(findPlaces(pack, "Tampereentie")).toEqual([]);
  expect(names(findPlaces(pack, "Raisio"))).toEqual(["Lidl Raisio"]);
  expect(names(findPlaces(pack, "turun"))).toEqual([
    "Turun kaupunginkirjasto",
    "Turun yliopisto",
  ]);
});

test("accents, Swedish names and short queries", () => {
  expect(names(findPlaces(pack, "itaharju"))).toEqual(["Prisma Itäharju"]);
  expect(names(findPlaces(pack, "åbo universitet"))).toEqual(["Turun yliopisto"]);
  expect(findPlaces(pack, "l")).toEqual([]);
  expect(findPlaces(pack, "Lidl", { limit: 2 })).toHaveLength(2);
});
