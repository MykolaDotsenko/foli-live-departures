import { expect, test } from "vitest";
import {
  compareItineraries,
  itineraryLeg,
  itineraryTransfer,
  itineraryTransferCount,
  normalizeItineraryOption,
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

test("rejects the removed legacy first/transfer/second shape", () => {
  expect(
    normalizeItineraryOption({
      id: "legacy",
      originStopId: "100",
      first: leg("a", "100", "200", 1000, 1200),
      transfer: transfer("200", "200"),
      second: leg("b", "200", "900", 1500, 2000),
      destinationStopId: "900",
      destinationArrivalAt: 2000,
      journeyArrivalAt: 2000,
    })
  ).toBeNull();
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
  const one = {
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
  };
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


test("fails closed for every malformed leg and transfer identity field", () => {
  const validFirst = leg("a", "100", "200", 1000, 1200);
  const validSecond = leg("b", "201", "900", 1500, 2000);
  const validTransfer = transfer("200", "201", 75);

  for (const broken of [
    { ...validFirst, tripRef: "" },
    { ...validFirst, boardStopId: "" },
    { ...validFirst, exitStopId: "" },
    { ...validFirst, departureAt: 0 },
    { ...validFirst, arrivalAt: null },
  ]) {
    expect(
      normalizeItineraryOption({ legs: [broken], transfers: [] })
    ).toBeNull();
  }

  for (const broken of [
    { ...validTransfer, alightStopId: "" },
    { ...validTransfer, boardStopId: "" },
    { ...validTransfer, walkingDistanceM: -1 },
    { ...validTransfer, alightStopId: "999" },
    { ...validTransfer, boardStopId: "999" },
  ]) {
    expect(
      normalizeItineraryOption({
        legs: [validFirst, validSecond],
        transfers: [broken],
      })
    ).toBeNull();
  }

  expect(normalizeItineraryOption({ legs: [], transfers: [] })).toBeNull();
  expect(
    normalizeItineraryOption({
      legs: [validFirst, validSecond],
      transfers: [],
    })
  ).toBeNull();
});

test("keeps unknown optional distances distinct from a real zero-distance value", () => {
  const normalized = normalizeItineraryOption({
    legs: [leg("direct", "100", "900", 1000, 1800)],
    transfers: [],
    originDistanceMeters: null,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: undefined,
    reliability: "unexpected",
  });

  expect(normalized).toMatchObject({
    originStopId: "100",
    originStopName: "100",
    destinationStopId: "900",
    destinationArrivalAt: 1800,
    journeyArrivalAt: 1800,
    originDistanceMeters: 0,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    totalWalkingDistanceM: 0,
    reliability: "medium",
  });
  expect(normalized.id).toBe("direct:100:900");

  const zeroWalk = normalizeItineraryOption({
    legs: [leg("direct", "100", "900", 1000, 1800)],
    transfers: [],
    finalWalkDistanceM: 0,
    finalWalkSecEstimate: 0,
    reliability: "high",
  });
  expect(zeroWalk.finalWalkDistanceM).toBe(0);
  expect(zeroWalk.finalWalkSecEstimate).toBe(0);
  expect(zeroWalk.reliability).toBe("high");
});

test("access helpers fail closed without inventing legs", () => {
  const direct = normalizeItineraryOption({
    legs: [leg("direct", "100", "900", 1000, 1800)],
    transfers: [],
  });

  expect(itineraryTransferCount(null)).toBe(0);
  expect(itineraryLeg(null, 0)).toBeNull();
  expect(itineraryTransfer(null, 0)).toBeNull();
  expect(itineraryLeg(direct, 0.5)).toBeNull();
  expect(itineraryTransfer(direct, 0.5)).toBeNull();
  expect(itineraryLeg(direct, 4)).toBeNull();
  expect(itineraryTransfer(direct, 0)).toBeNull();
});

test("comparison handles invalid inputs and deterministic walking/departure tie breakers", () => {
  const base = normalizeItineraryOption({
    id: "base",
    legs: [leg("direct", "100", "900", 1000, 1800)],
    transfers: [],
    totalWalkingDistanceM: 100,
  });
  expect(compareItineraries(null, null)).toBe(0);
  expect(compareItineraries(null, base)).toBe(1);
  expect(compareItineraries(base, null)).toBe(-1);

  const moreWalking = { ...base, id: "walk", totalWalkingDistanceM: 200 };
  expect(compareItineraries(base, moreWalking)).toBeLessThan(0);

  const laterDeparture = {
    ...base,
    id: "later",
    legs: [{ ...base.legs[0], departureAt: 1100 }],
  };
  expect(compareItineraries(base, laterDeparture)).toBeLessThan(0);

  const laterArrival = {
    ...base,
    id: "arrival",
    destinationArrivalAt: 2000,
    journeyArrivalAt: 2000,
    legs: [{ ...base.legs[0], arrivalAt: 2000 }],
  };
  expect(compareItineraries(base, laterArrival, -1)).toBeLessThan(0);
});
