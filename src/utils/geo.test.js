import { expect, test } from "vitest";
import {
  directionBetween,
  distanceInMeters,
  findNearestStops,
  formatAccuracy,
  formatDistance,
  hasCoordinates,
  isInsideMultiPolygon,
} from "./geo";
import { resetLanguageForTests } from "../i18n";

test("calculates realistic short WGS84 distances", () => {
  const distance = distanceInMeters(
    { lat: 60.4518, lon: 22.2666 },
    { lat: 60.4527, lon: 22.2666 }
  );

  expect(distance).toBeGreaterThan(95);
  expect(distance).toBeLessThan(105);
});

test("orders nearby stops by straight-line distance", () => {
  const stops = [
    { id: "4", name: "Farther", lat: 60.455, lon: 22.2666 },
    { id: "164", name: "Nearest", lat: 60.4519, lon: 22.2666 },
    { id: "32", name: "Middle", lat: 60.453, lon: 22.2666 },
    { id: "99", name: "No coordinates" },
  ];

  const nearby = findNearestStops(
    stops,
    { lat: 60.4518, lon: 22.2666 },
    3
  );

  expect(nearby.map((stop) => stop.id)).toEqual(["164", "32", "4"]);
  expect(nearby.every((stop) => Number.isFinite(stop.distanceMeters))).toBe(
    true
  );
});

test("rejects null, blank and out-of-range coordinates", () => {
  expect(hasCoordinates({ lat: null, lon: null })).toBe(false);
  expect(hasCoordinates({ lat: "", lon: 22.2 })).toBe(false);
  expect(hasCoordinates({ lat: 120, lon: 22.2 })).toBe(false);
  expect(
    distanceInMeters(
      { lat: null, lon: null },
      { lat: 60.4518, lon: 22.2666 }
    )
  ).toBeNull();
});

test("formats distance without implying false precision", () => {
  expect(formatDistance(3)).toBe("<10 m");
  expect(formatDistance(84)).toBe("80 m");
  expect(formatDistance(1_420)).toBe("1.4 km");
  expect(formatDistance(12_400)).toBe("12 km");
});

test("rounds a distance up to the next unit instead of past it", () => {
  expect(formatDistance(996)).toBe("1.0 km");
  expect(formatDistance(9_950)).toBe("9.9 km");
  expect(formatDistance(9_960)).toBe("10 km");
  expect(formatDistance(1_150)).toBe("1.1 km");
});

test("writes a Finnish decimal comma without relying on the phone's locale data", () => {
  resetLanguageForTests("fi");
  try {
    expect(formatDistance(1_420)).toBe("1,4 km");
    expect(formatDistance(84)).toBe("80 m");
    expect(formatDistance(12_400)).toBe("12 km");
  } finally {
    resetLanguageForTests("en");
  }
});

// Swedish and Ukrainian showed "2.0 km" with an English point, and
// Ukrainian Latin "m" beside its own "хв".
test("writes Swedish and Ukrainian distances as those languages do", () => {
  try {
    resetLanguageForTests("sv");
    expect(formatDistance(1_420)).toBe("1,4 km");
    expect(formatDistance(84)).toBe("80 m");
    resetLanguageForTests("uk");
    expect(formatDistance(1_420)).toBe("1,4 км");
    expect(formatDistance(84)).toBe("80 м");
    expect(formatDistance(3)).toBe("<10 м");
    expect(formatAccuracy(6)).toBe("6 м");
  } finally {
    resetLanguageForTests("en");
  }
});

test("gives a small GPS accuracy in whole metres", () => {
  expect(formatAccuracy(5.6)).toBe("6 m");
  expect(formatAccuracy(0.2)).toBe("1 m");
  expect(formatAccuracy(9.4)).toBe("9 m");
  expect(formatAccuracy(9.6)).toBe("10 m");
  expect(formatAccuracy(25)).toBe("30 m");
  expect(formatAccuracy(null)).toBe("");
});


test("checks service-area multipolygons locally and respects holes", () => {
  const geometry = {
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
        [
          [22.4, 60.4],
          [22.6, 60.4],
          [22.6, 60.6],
          [22.4, 60.6],
          [22.4, 60.4],
        ],
      ],
    ],
  };

  expect(isInsideMultiPolygon({ lat: 60.2, lon: 22.2 }, geometry)).toBe(true);
  expect(isInsideMultiPolygon({ lat: 60.5, lon: 22.5 }, geometry)).toBe(false);
  expect(isInsideMultiPolygon({ lat: 62, lon: 24 }, geometry)).toBe(false);
  expect(isInsideMultiPolygon({ lat: null, lon: 22.2 }, geometry)).toBeNull();
});
test("directionBetween returns a stable eight-way compass bucket", () => {
  const origin = { lat: 60.45, lon: 22.26 };
  expect(directionBetween(origin, { lat: 60.46, lon: 22.26 })).toBe("north");
  expect(directionBetween(origin, { lat: 60.45, lon: 22.27 })).toBe("east");
  expect(directionBetween(origin, { lat: 60.44, lon: 22.26 })).toBe("south");
  expect(directionBetween(origin, { lat: 60.45, lon: 22.25 })).toBe("west");
  expect(directionBetween(origin, null)).toBeNull();
});
