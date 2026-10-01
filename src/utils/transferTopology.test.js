import { expect, test } from "vitest";
import {
  downstreamTransferOccurrences,
  transferBoardingCandidates,
} from "./transferTopology";

function row(stopId, stopSequence, time, overrides = {}) {
  return {
    stopId,
    stopSequence,
    arrivalTime: time,
    departureTime: time,
    pickupType: 0,
    dropOffType: 0,
    timepoint: 1,
    shapeDistTraveled: null,
    ...overrides,
  };
}

test("preserves repeated downstream stop occurrences on loop trips", () => {
  const result = downstreamTransferOccurrences({
    stopTimes: [
      row("A", 1, "23:50:00"),
      row("B", 2, "24:00:00"),
      row("A", 3, "24:10:00"),
      row("C", 4, "24:20:00"),
    ],
    boardingStopId: "A",
    boardingSequence: 1,
  });

  expect(result).toEqual([
    { stopId: "B", stopSequence: 2, rideDurationSec: 600 },
    { stopId: "A", stopSequence: 3, rideDurationSec: 1_200 },
    { stopId: "C", stopSequence: 4, rideDurationSec: 1_800 },
  ]);
});

test("skips no-drop-off occurrences", () => {
  const result = downstreamTransferOccurrences({
    stopTimes: [
      row("A", 1, "10:00:00"),
      row("B", 2, "10:05:00", { dropOffType: 1 }),
      row("C", 3, "10:10:00"),
    ],
    boardingStopId: "A",
  });

  expect(result.map((item) => item.stopId)).toEqual(["C"]);
});

test("fails closed when a repeated boarding stop cannot be anchored", () => {
  const result = downstreamTransferOccurrences({
    stopTimes: [
      row("A", 1, "10:00:00"),
      row("B", 2, "10:10:00"),
      row("A", 3, "10:20:00"),
    ],
    boardingStopId: "A",
  });

  expect(result).toEqual([]);
});

test("respects a strict occurrence budget", () => {
  const result = downstreamTransferOccurrences({
    stopTimes: [
      row("A", 1, "10:00:00"),
      row("B", 2, "10:05:00"),
      row("C", 3, "10:10:00"),
      row("D", 4, "10:15:00"),
    ],
    boardingStopId: "A",
    maxOccurrences: 2,
  });

  expect(result).toHaveLength(2);
  expect(result.at(-1)?.stopId).toBe("C");
});


test("keeps the same stop first and adds only nearby transfer platforms", () => {
  const result = transferBoardingCandidates({
    alightStopId: "A",
    stops: [
      { id: "A", name: "Hub A", lat: 60.4518, lon: 22.2666 },
      { id: "B", name: "Hub B", lat: 60.4521, lon: 22.2670 },
      { id: "C", name: "Far", lat: 60.46, lon: 22.28 },
    ],
    maxWalkM: 220,
  });

  expect(result[0]).toMatchObject({
    stopId: "A",
    walkingDistanceM: 0,
    sameStop: true,
  });
  expect(result.map((item) => item.stopId)).toEqual(["A", "B"]);
  expect(result[1].walkingDistanceM).toBeGreaterThan(0);
});

test("does not invent a cross-stop transfer without coordinates", () => {
  expect(
    transferBoardingCandidates({
      alightStopId: "A",
      stops: [{ id: "A", name: "Hub A" }, { id: "B", name: "Hub B" }],
    })
  ).toEqual([
    {
      stopId: "A",
      stopName: "Hub A",
      walkingDistanceM: 0,
      sameStop: true,
    },
  ]);
});


test("fails closed for missing boarding occurrence, invalid boarding time and zero budget", () => {
  expect(
    downstreamTransferOccurrences({
      stopTimes: [row("B", 2, "10:05:00")],
      boardingStopId: "A",
    })
  ).toEqual([]);

  expect(
    downstreamTransferOccurrences({
      stopTimes: [
        row("A", 1, null, { arrivalTime: null, departureTime: null }),
        row("B", 2, "10:05:00"),
      ],
      boardingStopId: "A",
      boardingSequence: 1,
    })
  ).toEqual([]);

  expect(
    downstreamTransferOccurrences({
      stopTimes: [
        row("A", 1, "10:00:00"),
        row("B", 2, "10:05:00"),
      ],
      boardingStopId: "A",
      boardingSequence: 1,
      maxOccurrences: 0,
    })
  ).toEqual([]);
});

test("uses arrival/departure fallbacks and filters malformed downstream occurrences", () => {
  const result = downstreamTransferOccurrences({
    stopTimes: [
      row("A", 1, "10:00:00", {
        departureTime: null,
        arrivalTime: "10:00:00",
      }),
      row("B", 2, "10:05:00", {
        arrivalTime: null,
        departureTime: "10:05:00",
      }),
      row("", 3, "10:06:00"),
      row("C", 4, null, {
        arrivalTime: null,
        departureTime: null,
      }),
      row("D", 5, "09:59:00"),
    ],
    boardingStopId: "A",
    boardingSequence: 1,
    maxOccurrences: 99,
  });

  expect(result).toEqual([
    { stopId: "B", stopSequence: 2, rideDurationSec: 300 },
  ]);
});

test("transfer platform discovery handles missing ids, fallback names and strict bounds", () => {
  expect(
    transferBoardingCandidates({
      alightStopId: "",
      stops: [],
    })
  ).toEqual([]);

  expect(
    transferBoardingCandidates({
      alightStopId: "A",
      stops: [],
    })
  ).toEqual([
    {
      stopId: "A",
      stopName: "A",
      walkingDistanceM: 0,
      sameStop: true,
    },
  ]);

  const result = transferBoardingCandidates({
    alightStopId: "A",
    stops: [
      { id: "A", name: "", lat: 60.4518, lon: 22.2666 },
      { id: "bad-lat", name: "Bad", lat: "x", lon: 22.2667 },
      { id: "bad-lon", name: "Bad", lat: 60.4519, lon: "x" },
      { id: "B", name: "", lat: 60.4519, lon: 22.2667 },
      { id: "C", name: "C", lat: 60.4520, lon: 22.2668 },
    ],
    maxWalkM: -5,
    maxStops: 0,
  });

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    stopId: "A",
    stopName: "A",
    sameStop: true,
  });
});

test("sorts multiple nearby platforms and honors the candidate count limit", () => {
  const result = transferBoardingCandidates({
    alightStopId: "A",
    stops: [
      { id: "A", name: "A", lat: 60.4518, lon: 22.2666 },
      { id: "farther", name: "Farther", lat: 60.4522, lon: 22.2672 },
      { id: "nearer", name: "Nearer", lat: 60.4519, lon: 22.2667 },
    ],
    maxWalkM: 220,
    maxStops: 2,
  });

  expect(result.map((item) => item.stopId)).toEqual(["A", "nearer"]);
});
