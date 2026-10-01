import { expect, test } from "vitest";
import { selectDirectJourneyOptions } from "./directJourneyOptions";

function departure({
  tripRef,
  arrival,
  catchability = "comfortable",
  lineRef = "18",
  departureAt = 1_500,
}) {
  return {
    tripRef,
    lineRef,
    destinationStopId: "900",
    departureAt,
    destinationArrivalAt: arrival,
    catchability,
    liveState: "live",
    rideDurationSec: 600,
  };
}

test("shows fastest and a genuinely lower-walking alternative", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "far", name: "Far stop", distanceMeters: 300 },
      { id: "near", name: "Near stop", distanceMeters: 70 },
    ],
    fitsByStop: {
      far: {
        status: "good",
        best: departure({ tripRef: "fast", arrival: 2_000 }),
        departures: [departure({ tripRef: "fast", arrival: 2_000 })],
      },
      near: {
        status: "good",
        best: departure({ tripRef: "walk", arrival: 2_300 }),
        departures: [departure({ tripRef: "walk", arrival: 2_300 })],
      },
    },
  });

  expect(options.map((item) => item.label)).toEqual([
    "fastest",
    "less-walking",
  ]);
  expect(options[0].stopId).toBe("far");
  expect(options[1].stopId).toBe("near");
  expect(options[1].walkingDeltaMeters).toBe(-230);
  expect(options[1].arrivalDeltaSec).toBe(300);
});

test("does not show a less-walking option when the walking saving is trivial", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "a", distanceMeters: 200 },
      { id: "b", distanceMeters: 140 },
    ],
    fitsByStop: {
      a: {
        status: "good",
        best: departure({ tripRef: "a", arrival: 2_000 }),
        departures: [departure({ tripRef: "a", arrival: 2_000 })],
      },
      b: {
        status: "good",
        best: departure({ tripRef: "b", arrival: 2_100 }),
        departures: [departure({ tripRef: "b", arrival: 2_100 })],
      },
    },
  });

  expect(options).toHaveLength(1);
  expect(options[0].label).toBe("fastest");
});

test("adds an easier-to-catch option when the fastest trip is tight", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "a", distanceMeters: 90 },
      { id: "b", distanceMeters: 220 },
    ],
    fitsByStop: {
      a: {
        status: "tight",
        best: departure({
          tripRef: "tight",
          arrival: 2_000,
          catchability: "tight",
        }),
        departures: [
          departure({
            tripRef: "tight",
            arrival: 2_000,
            catchability: "tight",
          }),
        ],
      },
      b: {
        status: "good",
        best: departure({
          tripRef: "safe",
          arrival: 2_240,
          catchability: "comfortable",
        }),
        departures: [
          departure({
            tripRef: "safe",
            arrival: 2_240,
            catchability: "comfortable",
          }),
        ],
      },
    },
  });

  expect(options.map((item) => item.label)).toContain("easier-to-catch");
  expect(
    options.find((item) => item.label === "easier-to-catch")?.stopId
  ).toBe("b");
});

test("uses additional compatible departures, not only each stop's best", () => {
  const options = selectDirectJourneyOptions({
    stops: [{ id: "same", distanceMeters: 150 }],
    fitsByStop: {
      same: {
        status: "tight",
        best: departure({
          tripRef: "tight",
          arrival: 2_000,
          catchability: "tight",
        }),
        departures: [
          departure({
            tripRef: "tight",
            arrival: 2_000,
            catchability: "tight",
          }),
          departure({
            tripRef: "safe",
            arrival: 2_300,
            catchability: "comfortable",
            departureAt: 1_750,
          }),
        ],
      },
    },
  });

  expect(options).toHaveLength(2);
  expect(options[1].label).toBe("easier-to-catch");
  expect(options[1].departure.tripRef).toBe("safe");
});

test("never surfaces an uncatchable or unknown-arrival option", () => {
  const options = selectDirectJourneyOptions({
    stops: [{ id: "a", distanceMeters: 50 }],
    fitsByStop: {
      a: {
        status: "too-late",
        best: null,
        departures: [
          departure({
            tripRef: "late",
            arrival: 2_000,
            catchability: "too-late",
          }),
          departure({ tripRef: "unknown", arrival: null }),
        ],
      },
    },
  });

  expect(options).toEqual([]);
});


test("withholds an option when catchability is unknown", () => {
  const options = selectDirectJourneyOptions({
    stops: [{ id: "a", distanceMeters: 100 }],
    fitsByStop: {
      a: {
        status: "uncertain",
        best: departure({
          tripRef: "uncertain",
          arrival: 2_000,
          catchability: "unknown",
        }),
        departures: [
          departure({
            tripRef: "uncertain",
            arrival: 2_000,
            catchability: "unknown",
          }),
        ],
      },
    },
  });

  expect(options).toEqual([]);
});


test("ranks an external place by full door-arrival rather than bus-stop arrival", () => {
  const earlyBusLongWalk = {
    ...departure({ tripRef: "early-bus", arrival: 2_000 }),
    finalWalkDistanceM: 900,
    journeyArrivalAt: 2_950,
  };
  const laterBusShortWalk = {
    ...departure({ tripRef: "later-bus", arrival: 2_150 }),
    finalWalkDistanceM: 80,
    journeyArrivalAt: 2_240,
  };

  const options = selectDirectJourneyOptions({
    stops: [
      { id: "a", name: "Board A", distanceMeters: 120 },
      { id: "b", name: "Board B", distanceMeters: 180 },
    ],
    fitsByStop: {
      a: {
        status: "good",
        best: earlyBusLongWalk,
        departures: [earlyBusLongWalk],
      },
      b: {
        status: "good",
        best: laterBusShortWalk,
        departures: [laterBusShortWalk],
      },
    },
  });

  expect(options[0].label).toBe("fastest");
  expect(options[0].departure.tripRef).toBe("later-bus");
});


test("uses boarding plus final walk when labelling a place option as less walking", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "fast", distanceMeters: 50 },
      { id: "balanced", distanceMeters: 300 },
    ],
    fitsByStop: {
      fast: {
        status: "good",
        best: departure({ tripRef: "fast", arrival: 2_000 }),
        departures: [
          {
            ...departure({ tripRef: "fast", arrival: 2_000 }),
            finalWalkDistanceM: 600,
            journeyArrivalAt: 2_625,
          },
        ],
      },
      balanced: {
        status: "good",
        best: departure({ tripRef: "balanced", arrival: 2_180 }),
        departures: [
          {
            ...departure({ tripRef: "balanced", arrival: 2_180 }),
            finalWalkDistanceM: 50,
            journeyArrivalAt: 2_240,
          },
        ],
      },
    },
  });

  // The balanced option walks 300 + 50 = 350 m versus 50 + 600 = 650 m.
  expect(options.some((item) => item.label === "less-walking")).toBe(true);
  const lessWalking = options.find((item) => item.label === "less-walking");
  expect(lessWalking?.stopId).toBe("fast");
});
