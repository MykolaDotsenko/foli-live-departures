import { describe, expect, test } from "vitest";
import {
  analyzeTripFit,
  resolveBoardingOccurrence,
} from "./destinationTripFit";

function row(stopId, stopSequence, arrivalTime, departureTime, extra = {}) {
  return {
    stopId,
    stopSequence,
    arrivalTime,
    departureTime,
    pickupType: 0,
    dropOffType: 0,
    timepoint: 1,
    shapeDistTraveled: null,
    ...extra,
  };
}

describe("destination trip fit", () => {
  test("matches only a downstream destination", () => {
    const fit = analyzeTripFit({
      stopTimes: [
        row("100", 1, "10:00:00", "10:00:00"),
        row("200", 2, "10:10:00", "10:10:30"),
        row("300", 3, "10:20:00", "10:20:00"),
      ],
      boardingStopId: "100",
      destinationStopIds: ["300"],
    });

    expect(fit.compatible).toBe(true);
    expect(fit.destination.stopId).toBe("300");
    expect(fit.rideDurationSec).toBe(20 * 60);
  });

  test("rejects a destination already behind the boarding stop", () => {
    expect(
      analyzeTripFit({
        stopTimes: [
          row("300", 1, "10:00:00", "10:00:00"),
          row("100", 2, "10:10:00", "10:10:00"),
        ],
        boardingStopId: "100",
        destinationStopIds: ["300"],
      })
    ).toMatchObject({
      compatible: false,
      reason: "destination-not-downstream",
    });
  });

  test("does not guess a repeated boarding occurrence", () => {
    const times = [
      row("100", 1, "10:00:00", "10:00:00"),
      row("200", 2, "10:05:00", "10:05:00"),
      row("100", 3, "10:10:00", "10:10:00"),
      row("300", 4, "10:15:00", "10:15:00"),
    ];

    expect(resolveBoardingOccurrence(times, "100", null)).toBeNull();
    expect(resolveBoardingOccurrence(times, "100", 3)?.stopSequence).toBe(3);
  });

  test("uses the first valid approved downstream destination", () => {
    const fit = analyzeTripFit({
      stopTimes: [
        row("100", 1, "10:00:00", "10:00:00"),
        row("900", 2, "10:08:00", "10:08:00"),
        row("901", 3, "10:12:00", "10:12:00"),
      ],
      boardingStopId: "100",
      destinationStopIds: ["901", "900"],
    });

    expect(fit.destination.stopId).toBe("900");
  });

  test("does not offer a stop where drop-off is prohibited", () => {
    expect(
      analyzeTripFit({
        stopTimes: [
          row("100", 1, "10:00:00", "10:00:00"),
          row("300", 2, "10:10:00", "10:10:00", { dropOffType: 1 }),
        ],
        boardingStopId: "100",
        destinationStopIds: ["300"],
      }).compatible
    ).toBe(false);
  });
});


test("chooses the alighting stop with the best ride plus final walk time", () => {
  const fit = analyzeTripFit({
    stopTimes: [
      row("100", 1, "10:00:00", "10:00:00"),
      row("800", 2, "10:10:00", "10:10:00"),
      row("900", 3, "10:13:00", "10:13:00"),
    ],
    boardingStopId: "100",
    destinationStopIds: ["800", "900"],
    destinationStopAccess: {
      "800": { distanceMeters: 900, walkDurationSec: 900 },
      "900": { distanceMeters: 120, walkDurationSec: 120 },
    },
  });

  expect(fit.compatible).toBe(true);
  expect(fit.destination.stopId).toBe("900");
  expect(fit.rideDurationSec).toBe(13 * 60);
  expect(fit.finalWalkDurationSec).toBe(120);
  expect(fit.totalDurationSec).toBe(15 * 60);
});

test("keeps legacy stop destinations equivalent when there is no final-walk cost", () => {
  const fit = analyzeTripFit({
    stopTimes: [
      row("100", 1, "10:00:00", "10:00:00"),
      row("800", 2, "10:10:00", "10:10:00"),
      row("900", 3, "10:13:00", "10:13:00"),
    ],
    boardingStopId: "100",
    destinationStopIds: ["800", "900"],
  });

  expect(fit.destination.stopId).toBe("800");
  expect(fit.finalWalkDurationSec).toBe(0);
  expect(fit.totalDurationSec).toBe(10 * 60);
});
