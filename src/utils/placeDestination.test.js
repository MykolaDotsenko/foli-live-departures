import { expect, test } from "vitest";
import {
  destinationFromExternalPlace,
  destinationStopsForPlace,
  prepareExternalPlaceDestination,
  estimateFinalWalkSeconds,
} from "./placeDestination";

const place = {
  id: "node:123",
  title: "Prisma Itäharju",
  subtitle: "Turku, Finland",
  lat: 60.45,
  lon: 22.30,
  category: "shop",
  type: "supermarket",
  provider: "nominatim",
  licence: "OpenStreetMap",
};

test("builds a place destination from several nearby Föli stops", () => {
  const stops = [
    { id: "100", name: "Closest", lat: 60.4502, lon: 22.30 },
    { id: "200", name: "Second", lat: 60.452, lon: 22.30 },
    { id: "300", name: "Far", lat: 60.47, lon: 22.30 },
  ];

  const destination = destinationFromExternalPlace(place, stops);

  expect(destination).toMatchObject({
    id: "external:nominatim:node:123",
    kind: "external-place",
    label: "Prisma Itäharju",
    primaryStopId: "100",
    acceptableStopIds: ["100", "200"],
    lat: 60.45,
    lon: 22.30,
    source: "osm-nominatim",
  });
  expect(destination.finalWalkDistanceByStop["100"]).toBeLessThan(50);
  expect(destination.finalWalkDistanceByStop["200"]).toBeGreaterThan(150);
});

test("refuses a place with no Föli stop within the absolute walking guardrail", () => {
  const stops = [
    { id: "900", name: "Far away", lat: 60.48, lon: 22.30 },
  ];

  expect(destinationStopsForPlace(stops, place)).toEqual([]);
  expect(destinationFromExternalPlace(place, stops)).toBeNull();
});

test("keeps a broad dense-hub candidate set ordered by final distance", () => {
  const stops = Array.from({ length: 30 }, (_, index) => ({
    id: String(index + 1),
    name: `Candidate ${index + 1}`,
    lat: 60.4501 + index * 0.00008,
    lon: 22.30,
  }));

  const candidates = destinationStopsForPlace(stops, place);

  expect(candidates).toHaveLength(24);
  expect(candidates[0].id).toBe("1");
  expect(candidates.at(-1)?.id).toBe("24");
});

test("rejects a geocoded place explicitly outside the service boundary", () => {
  const boundary = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [22.0, 60.0],
          [22.2, 60.0],
          [22.2, 60.2],
          [22.0, 60.2],
          [22.0, 60.0],
        ],
      ],
    ],
  };

  const prepared = prepareExternalPlaceDestination({
    place,
    stops: [
      { id: "100", lat: 60.4501, lon: 22.30 },
    ],
    serviceBoundary: boundary,
  });

  expect(prepared).toEqual({
    ok: false,
    reason: "outside-service-area",
    destination: null,
  });
});

test("final-walk estimate is conservative and rejects missing values", () => {
  expect(estimateFinalWalkSeconds(240)).toBe(250);
  expect(estimateFinalWalkSeconds(0)).toBe(0);
  expect(estimateFinalWalkSeconds(null)).toBeNull();
  expect(estimateFinalWalkSeconds(-1)).toBeNull();
});
