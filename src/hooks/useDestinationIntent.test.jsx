import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import useDestinationIntent, {
  destinationFromPlace,
  destinationFromStop,
} from "./useDestinationIntent";

test("builds a public-stop destination without persisting private data", () => {
  expect(destinationFromStop({ id: "164", name: "Kauppatori" })).toEqual({
    id: "stop:164",
    kind: "public-stop",
    label: "Kauppatori",
    primaryStopId: "164",
    acceptableStopIds: ["164"],
  });
  expect(destinationFromStop({ id: "not-a-stop", name: "No" })).toBeNull();
});

test("keeps primary and approved backup stops for a saved place", () => {
  expect(
    destinationFromPlace({
      id: "home",
      label: "Home",
      stops: [{ id: "100" }, { id: "101" }, { id: "100" }],
      primaryStopId: "101",
    })
  ).toEqual({
    id: "place:home",
    kind: "saved-place",
    label: "Home",
    primaryStopId: "101",
    acceptableStopIds: ["100", "101"],
  });

  expect(destinationFromPlace({ id: "home", label: "Home", stops: [] })).toBeNull();
});

test("lets the passenger choose and clear destination explicitly", () => {
  const { result } = renderHook(() => useDestinationIntent());

  expect(result.current.destination).toBeNull();

  act(() => {
    result.current.chooseStop({ id: "4", name: "Turun linna" });
  });
  expect(result.current.destination).toMatchObject({
    id: "stop:4",
    label: "Turun linna",
  });

  act(() => {
    result.current.choosePlace({
      id: "home",
      label: "Home",
      stops: [{ id: "900" }],
      primaryStopId: "900",
    });
  });
  expect(result.current.destination).toMatchObject({
    id: "place:home",
    primaryStopId: "900",
  });

  act(() => result.current.clearDestination());
  expect(result.current.destination).toBeNull();
});


test("builds a geocoded destination without persisting it", () => {
  const { result } = renderHook(() => useDestinationIntent());

  let prepared;
  act(() => {
    prepared = result.current.chooseGeocodedPlace(
      {
        id: "osm:node:123",
        label: "Prisma",
        secondaryLabel: "Turku",
        lat: 60.4518,
        lon: 22.2666,
          },
      [
        { id: "100", name: "Near", lat: 60.4519, lon: 22.2666 },
        { id: "200", name: "Backup", lat: 60.453, lon: 22.2666 },
      ],
      null
    );
  });

  expect(prepared.ok).toBe(true);
  expect(result.current.destination).toMatchObject({
    id: "geo:osm:node:123",
    kind: "geocoded-place",
    label: "Prisma",
    primaryStopId: "100",
    acceptableStopIds: ["100", "200"],
  });
});

test("keeps the current destination when a geocoded place is unusable", () => {
  const { result } = renderHook(() => useDestinationIntent());

  act(() => {
    result.current.chooseStop({ id: "4", name: "Turun linna" });
  });

  let prepared;
  act(() => {
    prepared = result.current.chooseGeocodedPlace(
      {
        id: "osm:node:999",
        label: "Far away",
        secondaryLabel: "",
        lat: 62,
        lon: 24,
        },
      [{ id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 }],
      {
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
      }
    );
  });

  expect(prepared.reason).toBe("outside-service-area");
  expect(result.current.destination).toMatchObject({
    id: "stop:4",
    kind: "public-stop",
  });
});
