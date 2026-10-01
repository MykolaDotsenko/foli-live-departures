import { expect, test } from "vitest";
import {
  completedFinalWalk,
  finalWalkFromRideSelection,
} from "./finalWalk";

const destination = {
  id: "external:nominatim:node:123",
  kind: "external-place",
  label: "Prisma Itäharju",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
  lat: 60.45,
  lon: 22.30,
  finalWalkDistanceByStop: { "900": 180 },
  source: "osm-nominatim",
};

const journey = {
  id: "journey-1",
  destinationId: destination.id,
  destinationKind: "external-place",
  destinationLabel: destination.label,
  optionLabel: "fastest",
  stopId: "100",
  stopName: "Boarding stop",
  distanceMeters: 120,
  tripRef: "trip-1",
  lineRef: "18",
  destinationStopId: "900",
  departureAt: 2_000,
  aimedDepartureAt: 1_980,
  originAimedDepartureAt: 1_500,
  destinationArrivalAt: 2_900,
  journeyArrivalAt: 3_100,
  finalWalkDistanceM: 175,
  finalWalkSecEstimate: 190,
  liveState: "live",
  phase: "waiting",
  recoveryReason: null,
  selectedAt: 1_900_000,
  atStopConfirmedAt: 1_950_000,
  lastSeenAt: 1_990_000,
};

function rideConfig(overrides = {}) {
  return {
    tripRef: "trip-1",
    originAimedDepartureTime: 1_500,
    targetStop: { id: "900", name: "Destination stop" },
    ...overrides,
  };
}

test("captures final walk only for the same selected concrete ride", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig(),
    })
  ).toEqual({
    destinationId: destination.id,
    destinationLabel: "Prisma Itäharju",
    lat: 60.45,
    lon: 22.30,
    fromStopId: "900",
    fromStopName: "Destination stop",
    distanceMeters: 175,
  });

  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig({ tripRef: "other-trip" }),
    })
  ).toBeNull();

  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig({ originAimedDepartureTime: 1_700 }),
    })
  ).toBeNull();

  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig({
        targetStop: { id: "901", name: "Wrong stop" },
      }),
    })
  ).toBeNull();
});

test("does not create a final walk for stop or saved-place destinations", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination: {
        ...destination,
        kind: "public-stop",
      },
      rideConfig: rideConfig(),
    })
  ).toBeNull();
});

test("releases final walk only after Ride Mode reaches NOW at the same stop", () => {
  const pending = finalWalkFromRideSelection({
    journey,
    destination,
    rideConfig: rideConfig(),
  });

  expect(
    completedFinalWalk(pending, {
      stage: "next",
      targetStop: { id: "900" },
    })
  ).toBeNull();

  expect(
    completedFinalWalk(pending, {
      stage: "now",
      targetStop: { id: "901" },
    })
  ).toBeNull();

  expect(
    completedFinalWalk(pending, {
      stage: "now",
      targetStop: { id: "900" },
    })
  ).toBe(pending);
});

test("falls back to destination stop distance when selected journey lacks it", () => {
  const pending = finalWalkFromRideSelection({
    journey: { ...journey, finalWalkDistanceM: null },
    destination,
    rideConfig: rideConfig(),
  });

  expect(pending?.distanceMeters).toBe(180);
});


test("rejects invalid final destination coordinates", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination: { ...destination, lat: 999 },
      rideConfig: rideConfig(),
    })
  ).toBeNull();
});


test("never creates final walking guidance from transfer leg 1", () => {
  expect(
    finalWalkFromRideSelection({
      journey: {
        ...journey,
        optionLabel: "transfer",
        transferLeg: 1,
        transferPlan: {
          second: { tripRef: "trip-2" },
        },
      },
      destination,
      rideConfig: rideConfig(),
    })
  ).toBeNull();
});
