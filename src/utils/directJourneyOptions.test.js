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
            journeyArrivalAt: 2_400,
          },
        ],
      },
      balanced: {
        status: "good",
        best: departure({ tripRef: "balanced", arrival: 2_200 }),
        departures: [
          {
            ...departure({ tripRef: "balanced", arrival: 2_200 }),
            finalWalkDistanceM: 50,
            journeyArrivalAt: 2_500,
          },
        ],
      },
    },
  });

  // Fastest: 50 + 600 = 650 m total approximate walking.
  // Balanced: 300 + 50 = 350 m, arrives only 100 s later.
  expect(options[0].stopId).toBe("fast");
  const lessWalking = options.find((item) => item.label === "less-walking");
  expect(lessWalking?.stopId).toBe("balanced");
  expect(lessWalking?.walkingDeltaMeters).toBe(-300);
});


test("chooses the smallest total walking, not merely the closest boarding stop", () => {
  const fastest = departure({ tripRef: "fast", arrival: 2_000 });
  fastest.finalWalkDistanceM = 400;
  fastest.journeyArrivalAt = 2_400;

  const closeBoard = departure({ tripRef: "close-board", arrival: 2_100 });
  closeBoard.finalWalkDistanceM = 300;
  closeBoard.journeyArrivalAt = 2_500;

  const betterTotal = departure({ tripRef: "better-total", arrival: 2_150 });
  betterTotal.finalWalkDistanceM = 40;
  betterTotal.journeyArrivalAt = 2_520;

  const options = selectDirectJourneyOptions({
    stops: [
      { id: "fast", distanceMeters: 350 },
      { id: "close", distanceMeters: 40 },
      { id: "balanced", distanceMeters: 120 },
    ],
    fitsByStop: {
      fast: {
        status: "good",
        best: fastest,
        departures: [fastest],
      },
      close: {
        status: "good",
        best: closeBoard,
        departures: [closeBoard],
      },
      balanced: {
        status: "good",
        best: betterTotal,
        departures: [betterTotal],
      },
    },
  });

  const lessWalking = options.find(
    (item) => item.label === "less-walking"
  );

  expect(lessWalking?.stopId).toBe("balanced");
  expect(lessWalking?.walkingDeltaMeters).toBe(-590);
});

// One bus, two stops on its way: boarding 2.6 km back down the line got it
// the "Fastest" badge because it boards there earlier, though both reach
// the destination at the same moment. Equal arrival goes to less walking.
test("an earlier boarding of the same bus is not faster", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "upline", name: "Länsikeskus", distanceMeters: 2_600 },
      { id: "here", name: "Puistokatu", distanceMeters: 30 },
    ],
    fitsByStop: {
      upline: {
        status: "good",
        best: departure({ tripRef: "32", arrival: 5_000, departureAt: 3_800 }),
        departures: [
          departure({ tripRef: "32", arrival: 5_000, departureAt: 3_800 }),
        ],
      },
      here: {
        status: "good",
        best: departure({ tripRef: "32", arrival: 5_000, departureAt: 4_160 }),
        departures: [
          departure({ tripRef: "32", arrival: 5_000, departureAt: 4_160 }),
        ],
      },
    },
  });

  expect(options[0]).toMatchObject({ label: "fastest", stopId: "here" });
  expect(options.map((item) => item.stopId)).not.toContain("upline");
});

test("arrive-by still prefers the latest departure", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "upline", distanceMeters: 2_600 },
      { id: "here", distanceMeters: 30 },
    ],
    fitsByStop: {
      upline: {
        status: "good",
        best: departure({ tripRef: "a", arrival: 5_000, departureAt: 3_800 }),
        departures: [departure({ tripRef: "a", arrival: 5_000, departureAt: 3_800 })],
      },
      here: {
        status: "good",
        best: departure({ tripRef: "b", arrival: 5_000, departureAt: 4_160 }),
        departures: [departure({ tripRef: "b", arrival: 5_000, departureAt: 4_160 })],
      },
    },
    timeConstraint: { mode: "arrive-by", targetTimeSec: 6_000 },
  });

  expect(options[0]).toMatchObject({ label: "latest-departure", stopId: "here" });
});


test("the bus after the fastest is a second choice when nothing else trades off", () => {
  const first = departure({ tripRef: "first", arrival: 2_000, departureAt: 1_500 });
  const sameMinute = departure({ tripRef: "same-minute", arrival: 2_100, departureAt: 1_560 });
  const next = departure({ tripRef: "next", arrival: 2_600, departureAt: 2_100 });

  const options = selectDirectJourneyOptions({
    stops: [{ id: "a", name: "Here", distanceMeters: 80 }],
    fitsByStop: {
      a: { status: "good", best: first, departures: [first, sameMinute, next] },
    },
  });

  // A bus leaving the same minute is no second chance; the next one is.
  expect(options.map((item) => [item.label, item.departure.tripRef])).toEqual([
    ["fastest", "first"],
    ["next-bus", "next"],
  ]);
  expect(options[1].arrivalDeltaSec).toBe(600);
});

test("the same bus boarded at another stop is no second choice", () => {
  const options = selectDirectJourneyOptions({
    stops: [
      { id: "here", distanceMeters: 60 },
      { id: "down-the-line", distanceMeters: 400 },
    ],
    fitsByStop: {
      here: {
        status: "good",
        best: departure({ tripRef: "32", arrival: 3_000, departureAt: 2_000 }),
        departures: [
          departure({ tripRef: "32", arrival: 3_000, departureAt: 2_000 }),
          departure({ tripRef: "32-later", arrival: 3_900, departureAt: 2_900 }),
        ],
      },
      "down-the-line": {
        status: "good",
        best: departure({ tripRef: "32", arrival: 3_000, departureAt: 2_300 }),
        departures: [
          departure({ tripRef: "32", arrival: 3_000, departureAt: 2_300 }),
        ],
      },
    },
  });

  const backup = options.find((item) => item.label === "next-bus");
  expect(backup?.departure.tripRef).toBe("32-later");
});

test("arriving by a time, the second choice is the bus before, for margin", () => {
  const options = selectDirectJourneyOptions({
    stops: [{ id: "here", distanceMeters: 30 }],
    fitsByStop: {
      here: {
        status: "good",
        best: departure({ tripRef: "late", arrival: 5_000, departureAt: 4_160 }),
        departures: [
          departure({ tripRef: "earliest", arrival: 3_800, departureAt: 2_960 }),
          departure({ tripRef: "before", arrival: 4_400, departureAt: 3_560 }),
          departure({ tripRef: "late", arrival: 5_000, departureAt: 4_160 }),
        ],
      },
    },
    timeConstraint: { mode: "arrive-by", targetTimeSec: 6_000 },
  });

  expect(options.map((item) => [item.label, item.departure.tripRef])).toEqual([
    ["latest-departure", "late"],
    ["earlier-bus", "before"],
  ]);
  expect(options[1].arrivalDeltaSec).toBe(-600);
});


test("tomorrow's run of the same trip is a second choice, not the same bus", () => {
  // A timetable search lists a trip once per service day. The last bus
  // tonight and the same trip tomorrow share its ID, a day apart.
  const tonight = departure({ tripRef: "late-1", arrival: 2_000, departureAt: 1_500 });
  const tomorrow = departure({
    tripRef: "late-1",
    arrival: 2_000 + 86_400,
    departureAt: 1_500 + 86_400,
  });

  const options = selectDirectJourneyOptions({
    stops: [{ id: "a", distanceMeters: 90 }],
    fitsByStop: {
      a: { status: "good", best: tonight, departures: [tonight, tomorrow] },
    },
    timeConstraint: { mode: "depart-at", targetTimeSec: 1_000 },
  });

  expect(options.map((item) => item.label)).toEqual(["fastest", "next-bus"]);
  expect(options[1].departure.departureAt).toBe(1_500 + 86_400);
});
