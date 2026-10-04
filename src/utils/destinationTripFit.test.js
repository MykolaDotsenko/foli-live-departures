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


test("chooses a later downstream stop when final-walk cost makes it better", () => {
  const fit = analyzeTripFit({
    stopTimes: [
      row("100", 1, "10:00:00", "10:00:00"),
      row("900", 2, "10:08:00", "10:08:00"),
      row("901", 3, "10:12:00", "10:12:00"),
    ],
    boardingStopId: "100",
    destinationStopIds: ["900", "901"],
    destinationExtraSecByStop: {
      "900": 10 * 60,
      "901": 30,
    },
  });

  expect(fit.compatible).toBe(true);
  expect(fit.destination.stopId).toBe("901");
  expect(fit.rideDurationSec).toBe(12 * 60);
});

test("keeps first downstream semantics when no destination cost map is supplied", () => {
  const fit = analyzeTripFit({
    stopTimes: [
      row("100", 1, "10:00:00", "10:00:00"),
      row("900", 2, "10:08:00", "10:08:00"),
      row("901", 3, "10:12:00", "10:12:00"),
    ],
    boardingStopId: "100",
    destinationStopIds: ["900", "901"],
  });

  expect(fit.destination.stopId).toBe("900");
  expect(fit.rideDurationSec).toBe(8 * 60);
});

// A loop that starts and ends at one stop has one boarding visit there and
// one arrival, and the stop board lists both under the same trip. Matched to
// the start, the arrival became a ride that never happens: "line 7 at 13:57,
// arrive 14:11" was the bus ending its loop.
describe("a loop that starts and ends at the same stop", () => {
  const loop = [
    row("164", 1, "13:30:00", "13:30:00", { dropOffType: 1 }),
    row("310", 2, "13:35:00", "13:35:00"),
    row("320", 3, "13:40:00", "13:40:00"),
    row("321", 4, "13:44:00", "13:44:00"),
    row("310", 5, "13:50:00", "13:50:00"),
    row("164", 6, "13:58:00", "13:58:00", { pickupType: 1 }),
  ];
  // 13:30 and 13:58 in Turku on 4 October 2026 (UTC+3).
  const start = Date.UTC(2026, 9, 4, 10, 30) / 1000;
  const end = Date.UTC(2026, 9, 4, 10, 58) / 1000;

  test("its arrival at the end is not a boarding", () => {
    // A terminus arrival has no aimed departure.
    expect(resolveBoardingOccurrence(loop, "164", null, null)).toBeNull();
    expect(resolveBoardingOccurrence(loop, "164", null, end)).toBeNull();
    expect(
      analyzeTripFit({
        stopTimes: loop,
        boardingStopId: "164",
        boardingAimedDepartureEpochSec: null,
        destinationStopIds: ["321"],
      }).compatible
    ).toBe(false);
  });

  test("its departure at the start still is", () => {
    expect(resolveBoardingOccurrence(loop, "164", null, start)?.stopSequence).toBe(1);
    expect(
      analyzeTripFit({
        stopTimes: loop,
        boardingStopId: "164",
        boardingAimedDepartureEpochSec: start,
        destinationStopIds: ["321"],
      })
    ).toMatchObject({ compatible: true, rideDurationSec: 14 * 60 });
  });
});
