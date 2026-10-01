import { expect, test } from "vitest";
import {
  destinationFromSearchPlace,
  destinationStopsForPoint,
} from "./placeDestination";

function stop(id, northMeters, name = `Stop ${id}`) {
  // ~111.2 km / degree latitude.
  return {
    id: String(id),
    name,
    lat: 60.4518 + northMeters / 111_200,
    lon: 22.2666,
  };
}

const point = { lat: 60.4518, lon: 22.2666 };

test("prefers nearby destination stops and caps the candidate set", () => {
  const stops = Array.from({ length: 12 }, (_, index) =>
    stop(index + 1, 100 + index * 70)
  );

  const candidates = destinationStopsForPoint(stops, point);

  expect(candidates).toHaveLength(8);
  expect(candidates.map((item) => item.id)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
  ]);
  expect(candidates.every((item) => item.distanceMeters <= 900)).toBe(true);
});

test("fills a sparse area to three stops without accepting a very long final walk", () => {
  const candidates = destinationStopsForPoint(
    [
      stop(1, 120),
      stop(2, 980),
      stop(3, 1_350),
      stop(4, 1_700),
    ],
    point
  );

  expect(candidates.map((item) => item.id)).toEqual(["1", "2", "3"]);
  expect(candidates.some((item) => item.id === "4")).toBe(false);
});

test("builds a transient place destination with per-stop egress evidence", () => {
  const destination = destinationFromSearchPlace(
    {
      id: "osm:123",
      label: "Prisma Itäharju",
      detail: "Turku, Finland",
      lat: point.lat,
      lon: point.lon,
      category: "shop",
      provider: "nominatim",
    },
    [stop(100, 100, "Near"), stop(200, 250, "Far"), stop(300, 500, "Third")]
  );

  expect(destination).toMatchObject({
    id: "place-search:osm:123",
    kind: "place",
    label: "Prisma Itäharju",
    primaryStopId: "100",
    acceptableStopIds: ["100", "200", "300"],
    lat: point.lat,
    lon: point.lon,
    placeProvider: "nominatim",
  });
  expect(destination.destinationStopDistancesM["100"]).toBeGreaterThan(90);
  expect(destination.destinationStopDistancesM["100"]).toBeLessThan(110);
  expect(destination.destinationStopWalkSeconds["100"]).toBeGreaterThan(100);
  expect(destination.destinationStopNames["200"]).toBe("Far");
});

test("fails closed when the place or local stop coverage is unusable", () => {
  expect(
    destinationFromSearchPlace(
      {
        id: "",
        label: "No",
        detail: "",
        lat: point.lat,
        lon: point.lon,
        category: "",
        provider: "nominatim",
      },
      [stop(1, 100)]
    )
  ).toBeNull();

  expect(
    destinationFromSearchPlace(
      {
        id: "far",
        label: "Far away",
        detail: "",
        lat: point.lat,
        lon: point.lon,
        category: "",
        provider: "nominatim",
      },
      [stop(1, 2_000)]
    )
  ).toBeNull();
});
