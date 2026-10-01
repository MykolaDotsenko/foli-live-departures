import { expect, test } from "vitest";
import {
  destinationStopCandidates,
  prepareGeocodedDestination,
} from "./placeDestination";

const stops = [
  { id: "100", name: "Nearest", lat: 60.4519, lon: 22.2666 },
  { id: "200", name: "Second", lat: 60.4530, lon: 22.2666 },
  { id: "300", name: "Farther", lat: 60.4550, lon: 22.2666 },
  { id: "999", name: "Very far", lat: 60.48, lon: 22.2666 },
];

const place = {
  id: "osm:node:1",
  label: "Example shop",
  secondaryLabel: "Turku, Finland",
  lat: 60.4518,
  lon: 22.2666,
  category: "shop",
  provider: "nominatim",
};

test("keeps a bounded adaptive set of destination stops", () => {
  const candidates = destinationStopCandidates(stops, place);

  expect(candidates.map((stop) => stop.id)).toEqual(["100", "200", "300"]);
  expect(candidates.every((stop) => stop.distanceMeters <= 500)).toBe(true);
});

test("builds a geocoded destination with stop walking distances", () => {
  const result = prepareGeocodedDestination({
    place,
    stops,
    serviceBoundary: null,
  });

  expect(result.ok).toBe(true);
  expect(result.destination).toMatchObject({
    id: "geo:osm:node:1",
    kind: "geocoded-place",
    label: "Example shop",
    primaryStopId: "100",
    acceptableStopIds: ["100", "200", "300"],
    lat: 60.4518,
    lon: 22.2666,
  });
  expect(result.destination.destinationStopDistances["100"]).toBeLessThan(20);
});

test("rejects a place outside the known service boundary", () => {
  const result = prepareGeocodedDestination({
    place: { ...place, lat: 62, lon: 24 },
    stops,
    serviceBoundary: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [22, 60],
            [23, 60],
            [23, 61],
            [22, 61],
            [22, 60],
          ],
        ],
      ],
    },
  });

  expect(result).toEqual({
    ok: false,
    reason: "outside-service-area",
    destination: null,
  });
});

test("fails closed when no public stop is realistically near the place", () => {
  const result = prepareGeocodedDestination({
    place: { ...place, lat: 60.49 },
    stops: [{ id: "100", name: "Far", lat: 60.4518, lon: 22.2666 }],
  });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("no-nearby-stops");
});
