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


test("lets the passenger choose an external place without saving it", () => {
  const { result } = renderHook(() => useDestinationIntent());

  let selected = null;
  act(() => {
    selected = result.current.chooseExternalPlace(
      {
        id: "nominatim:node:123",
        label: "Prisma Test",
        lat: 60.45,
        lon: 22.26,
        source: "nominatim",
      },
      [
        { id: "100", name: "Near", lat: 60.451, lon: 22.26 },
        { id: "200", name: "Second", lat: 60.454, lon: 22.26 },
        { id: "300", name: "Third", lat: 60.457, lon: 22.26 },
      ]
    );
  });

  expect(selected).toMatchObject({
    kind: "external-place",
    label: "Prisma Test",
    source: "nominatim",
  });
  expect(result.current.destination).toEqual(selected);
});
