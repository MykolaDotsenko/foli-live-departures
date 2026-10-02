import { expect, test } from "vitest";
import {
  compareItineraries,
  itineraryLeg,
  itineraryTransfer,
  itineraryTransferCount,
  normalizeItineraryOption,
  withLegacyTransferAliases,
} from "./itinerary";

function leg(id, board, exit, departureAt, arrivalAt) {
  return {
    tripRef: id,
    lineRef: id,
    boardStopId: board,
    boardStopSequence: 1,
    exitStopId: exit,
    exitStopSequence: 2,
    departureAt,
    arrivalAt,
    aimedDepartureAt: departureAt,
    originAimedDepartureAt: departureAt - 60,
    liveState: "schedule",
  };
}

function transfer(alight, board, walk = 0) {
  return {
    alightStopId: alight,
    alightStopSequence: 2,
    boardStopId: board,
    boardStopName: board,
    walkingDistanceM: walk,
    feasibility: {
      state: "comfortable",
      recommendable: true,
      incomingArrivalAt: null,
      outgoingDepartureAt: null,
      walkingDistanceM: walk,
      requiredSec: 60,
      availableSec: 300,
      slackSec: 240,
    },
  };
}

test("normalizes a three-leg itinerary without special-case fields", () => {
  const option = normalizeItineraryOption({
    id: "three",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 80,
    legs: [
      leg("a", "100", "200", 1000, 1200),
      leg("b", "200", "300", 1500, 1700),
      leg("c", "301", "900", 2000, 2400),
    ],
    transfers: [transfer("200", "200"), transfer("300", "301", 90)],
    destinationStopId: "900",
    destinationArrivalAt: 2400,
    journeyArrivalAt: 2500,
    finalWalkDistanceM: 50,
    finalWalkSecEstimate: 100,
    totalWalkingDistanceM: 220,
    reliability: "medium",
  });

  expect(option?.legs).toHaveLength(3);
  expect(option?.transfers).toHaveLength(2);
  expect(itineraryTransferCount(option)).toBe(2);
  expect(itineraryLeg(option, 2)?.tripRef).toBe("c");
  expect(itineraryTransfer(option, 1)?.boardStopId).toBe("301");
});

test("normalizes the legacy first/transfer/second shape", () => {
  const first = leg("a", "100", "200", 1000, 1200);
  const second = leg("b", "200", "900", 1500, 2000);
  const normalized = normalizeItineraryOption({
    id: "legacy",
    originStopId: "100",
    first,
    transfer: transfer("200", "200"),
    second,
    destinationStopId: "900",
    destinationArrivalAt: 2000,
    journeyArrivalAt: 2000,
    totalWalkingDistanceM: 0,
  });

  expect(normalized?.legs.map((item) => item.tripRef)).toEqual(["a", "b"]);
  const aliases = withLegacyTransferAliases(normalized);
  expect(aliases.first?.tripRef).toBe("a");
  expect(aliases.second?.tripRef).toBe("b");
});

test("fails closed on disconnected or overlong itinerary shapes", () => {
  expect(
    normalizeItineraryOption({
      legs: [
        leg("a", "100", "200", 1000, 1200),
        leg("b", "201", "900", 1500, 2000),
      ],
      transfers: [transfer("200", "999")],
    })
  ).toBeNull();

  expect(
    normalizeItineraryOption({
      legs: [
        leg("a", "1", "2", 1, 2),
        leg("b", "2", "3", 3, 4),
        leg("c", "3", "4", 5, 6),
        leg("d", "4", "5", 7, 8),
      ],
      transfers: [transfer("2", "2"), transfer("3", "3"), transfer("4", "4")],
    })
  ).toBeNull();
});

test("prefers fewer transfers inside the near-equivalent arrival band", () => {
  const one = withLegacyTransferAliases({
    id: "one",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 0,
    legs: [leg("a", "100", "200", 1000, 1200), leg("b", "200", "900", 1500, 2100)],
    transfers: [transfer("200", "200")],
    destinationStopId: "900",
    destinationArrivalAt: 2100,
    journeyArrivalAt: 2100,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    totalWalkingDistanceM: 0,
    reliability: "medium",
  });
  const two = {
    ...one,
    id: "two",
    legs: [
      leg("a", "100", "200", 1000, 1200),
      leg("b", "200", "300", 1400, 1600),
      leg("c", "300", "900", 1800, 2050),
    ],
    transfers: [transfer("200", "200"), transfer("300", "300")],
    journeyArrivalAt: 2050,
    destinationArrivalAt: 2050,
  };

  expect(compareItineraries(one, two)).toBeLessThan(0);
  expect(compareItineraries(two, one)).toBeGreaterThan(0);

  const muchEarlier = { ...two, journeyArrivalAt: 1900, destinationArrivalAt: 1900 };
  expect(compareItineraries(muchEarlier, one)).toBeLessThan(0);
});
