import { expect, test } from "vitest";
import {
  completedFinalWalk,
  finalWalkFromRideSelection,
} from "./finalWalk";

const destination = {
  id: "geo:osm:node:123",
  kind: "geocoded-place",
  label: "Prisma Itäharju",
  primaryStopId: "900",
  acceptableStopIds: ["900", "901"],
  lat: 60.4518,
  lon: 22.2666,
  destinationStopDistances: {
    "900": 140,
    "901": 280,
  },
};

const journey = {
  id: "journey-1",
  destinationId: destination.id,
  destinationKind: "geocoded-place",
  destinationLabel: destination.label,
  optionLabel: "fastest",
  stopId: "100",
  stopName: "Kauppatori",
  distanceMeters: 120,
  tripRef: "trip-18",
  lineRef: "18",
  destinationStopId: "900",
  departureAt: 2_000,
  aimedDepartureAt: 1_980,
  originAimedDepartureAt: 1_500,
  destinationArrivalAt: 2_900,
  finalWalkDistanceM: 140,
  finalWalkDurationSec: 146,
  finalArrivalAt: 3_046,
  liveState: "live",
  phase: "waiting",
  recoveryReason: null,
  selectedAt: 1_000_000,
  atStopConfirmedAt: 1_010_000,
  lastSeenAt: 1_020_000,
};

function rideConfig(overrides = {}) {
  return {
    tripRef: "trip-18",
    originAimedDepartureTime: 1_500,
    targetStop: { id: "900", name: "Prisma stop" },
    ...overrides,
  };
}

test("arms final walk only for the selected geocoded journey trip", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig(),
    })
  ).toEqual({
    destinationId: destination.id,
    destinationLabel: "Prisma Itäharju",
    lat: 60.4518,
    lon: 22.2666,
    fromStopId: "900",
    fromStopName: "Prisma stop",
    distanceMeters: 140,
  });
});

test("does not arm final walk for a different trip or exit stop", () => {
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
      rideConfig: rideConfig({
        targetStop: { id: "901", name: "Other stop" },
      }),
    })
  ).toBeNull();
});

test("does not arm final walk for a different repeated run origin", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination,
      rideConfig: rideConfig({ originAimedDepartureTime: 1_700 }),
    })
  ).toBeNull();
});

test("never arms final walk for stop-only or saved-place destinations", () => {
  expect(
    finalWalkFromRideSelection({
      journey,
      destination: {
        ...destination,
        id: "stop:900",
        kind: "public-stop",
      },
      rideConfig: rideConfig(),
    })
  ).toBeNull();

  expect(
    finalWalkFromRideSelection({
      journey,
      destination: {
        ...destination,
        id: "place:home",
        kind: "saved-place",
      },
      rideConfig: rideConfig(),
    })
  ).toBeNull();
});

test("completes final walk only after Get off now at the selected stop", () => {
  const pending = finalWalkFromRideSelection({
    journey,
    destination,
    rideConfig: rideConfig(),
  });

  expect(
    completedFinalWalk(pending, {
      stage: "now",
      targetStop: { id: "900" },
    })
  ).toBe(pending);

  expect(
    completedFinalWalk(pending, {
      stage: "soon",
      targetStop: { id: "900" },
    })
  ).toBeNull();

  expect(
    completedFinalWalk(pending, {
      stage: "now",
      targetStop: { id: "901" },
    })
  ).toBeNull();
});
