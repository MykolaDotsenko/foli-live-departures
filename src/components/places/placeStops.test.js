import { expect, test } from "vitest";
import { primaryStopOf, resolvePlaceStops } from "./placeStops";

const place = {
  id: "home",
  primaryStopId: "32",
  stops: [
    { id: "164", name: "Kauppatori" },
    { id: "32", name: "Puistokatu" },
    { id: "999", name: "Gone" },
  ],
};

// The live stop list wins where it knows the stop, so the route link gets
// coordinates; a stop Föli no longer lists keeps what the place saved.
test("fills saved stops in from the live stop list, keeping the saved order", () => {
  const live = [
    { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
    { id: "164", name: "Kauppatori (T1)", lat: 60.4518, lon: 22.2666 },
  ];

  expect(resolvePlaceStops(place, live)).toEqual([
    { id: "164", name: "Kauppatori (T1)", lat: 60.4518, lon: 22.2666 },
    { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
    { id: "999", name: "Gone" },
  ]);
});

test("sends a passenger to the main stop, or the first one if it is missing", () => {
  const resolved = resolvePlaceStops(place, []);

  expect(primaryStopOf(resolved, "32").id).toBe("32");
  expect(primaryStopOf(resolved, "nope").id).toBe("164");
});
