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


test("selects an external place only when nearby Föli stops can be resolved", () => {
  const { result } = renderHook(() => useDestinationIntent());
  const external = {
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

  let prepared = null;
  act(() => {
    prepared = result.current.chooseExternalPlace(external, [
      { id: "100", name: "Near", lat: 60.4502, lon: 22.30 },
      { id: "200", name: "Backup", lat: 60.452, lon: 22.30 },
    ]);
  });

  expect(prepared).toMatchObject({ ok: true, reason: "ready" });
  expect(result.current.destination).toMatchObject({
    id: "external:nominatim:node:123",
    kind: "external-place",
    label: "Prisma Itäharju",
    primaryStopId: "100",
    acceptableStopIds: ["100", "200"],
    source: "osm-nominatim",
  });

  act(() => result.current.clearDestination());

  act(() => {
    prepared = result.current.chooseExternalPlace(external, [
      { id: "900", name: "Too far", lat: 60.48, lon: 22.30 },
    ]);
  });

  expect(prepared).toEqual({
    ok: false,
    reason: "no-nearby-stops",
    destination: null,
  });
  expect(result.current.destination).toBeNull();
});


test("destination normalization covers empty names, malformed places and primary fallback", () => {
  expect(destinationFromStop(undefined)).toBeNull();
  expect(destinationFromStop({ id: " 42 ", name: "   " })).toEqual({
    id: "stop:42",
    kind: "public-stop",
    label: "Stop 42",
    primaryStopId: "42",
    acceptableStopIds: ["42"],
  });

  expect(destinationFromPlace(undefined)).toBeNull();
  expect(
    destinationFromPlace({
      id: "work",
      label: "Work",
      stops: "not-an-array",
    })
  ).toBeNull();
  expect(
    destinationFromPlace({
      id: "",
      label: "Work",
      stops: [{ id: "100" }],
    })
  ).toBeNull();
  expect(
    destinationFromPlace({
      id: "work",
      label: "",
      stops: [{ id: "100" }],
    })
  ).toBeNull();

  expect(
    destinationFromPlace({
      id: "work",
      label: "Work",
      stops: [
        null,
        { id: "bad" },
        { id: " 100 " },
        { id: "100" },
        { id: "101" },
      ],
      primaryStopId: "999",
    })
  ).toEqual({
    id: "place:work",
    kind: "saved-place",
    label: "Work",
    primaryStopId: "100",
    acceptableStopIds: ["100", "101"],
  });
});

test("invalid stop and place choices leave the current destination unchanged", () => {
  const { result } = renderHook(() => useDestinationIntent());

  act(() => {
    result.current.chooseStop({ id: "164", name: "Kauppatori" });
  });
  const selected = result.current.destination;

  act(() => {
    result.current.chooseStop({ id: "bad", name: "Invalid" });
    result.current.choosePlace({
      id: "home",
      label: "Home",
      stops: [],
    });
  });

  expect(result.current.destination).toEqual(selected);
});
