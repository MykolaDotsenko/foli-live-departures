import { describe, expect, test } from "vitest";
import {
  canSearchTransferRecovery,
  departureMatchesFailedTransferRun,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "./transferRecovery";

function baseItinerary() {
  return {
    id: "selected-transfer",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 0,
    legs: [
      {
        tripRef: "first-run",
        lineRef: "1",
        boardStopId: "100",
        boardStopSequence: 1,
        exitStopId: "500",
        exitStopSequence: 5,
        departureAt: 1_800,
        arrivalAt: 2_200,
        aimedDepartureAt: 1_800,
        originAimedDepartureAt: 1_700,
        liveState: "schedule",
      },
      {
        tripRef: "failed-run",
        lineRef: "7",
        boardStopId: "501",
        boardStopSequence: 1,
        exitStopId: "900",
        exitStopSequence: 8,
        departureAt: 2_700,
        arrivalAt: 3_300,
        aimedDepartureAt: 2_700,
        originAimedDepartureAt: 2_400,
        liveState: "schedule",
      },
    ],
    transfers: [
      {
        alightStopId: "500",
        alightStopSequence: 5,
        boardStopId: "501",
        boardStopName: "Hub B",
        walkingDistanceM: 75,
        feasibility: {
          state: "comfortable",
          recommendable: true,
          incomingArrivalAt: 2_200,
          outgoingDepartureAt: 2_700,
          walkingDistanceM: 75,
          requiredSec: 120,
          availableSec: 500,
          slackSec: 380,
        },
      },
    ],
    destinationStopId: "900",
    destinationArrivalAt: 3_300,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    journeyArrivalAt: 3_300,
    totalWalkingDistanceM: 75,
    reliability: "medium",
  };
}

function journey(overrides = {}) {
  return {
    id: "selected-transfer",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    activeLegIndex: 1,
    stopId: "501",
    atStopConfirmedAt: null,
    itinerary: baseItinerary(),
    ...overrides,
  };
}


const stops = [
  { id: "500", name: "Hub A", lat: 60.45, lon: 22.26 },
  { id: "501", name: "Hub B", lat: 60.4503, lon: 22.2603 },
  { id: "700", name: "Far", lat: 60.48, lon: 22.3 },
];

describe("transfer recovery search boundary", () => {
  test("activates only after authoritative transfer arrival moved recovery into leg 2", () => {
    expect(canSearchTransferRecovery(journey())).toBe(true);
    expect(canSearchTransferRecovery(journey({ activeLegIndex: 0 }))).toBe(false);
    expect(canSearchTransferRecovery(journey({ phase: "waiting" }))).toBe(false);
    expect(canSearchTransferRecovery(null)).toBe(false);
  });

  test("builds same-stop first plus bounded nearby-platform origins", () => {
    const origins = transferRecoveryOriginStops(journey(), stops);

    expect(origins[0]).toMatchObject({
      id: "500",
      name: "Hub A",
      distanceMeters: 0,
    });
    expect(origins.map((item) => item.id)).toContain("501");
    expect(origins.map((item) => item.id)).not.toContain("700");
    expect(origins[1].distanceMeters).toBeGreaterThan(0);
  });

  test("falls back to the exact transfer stop when catalogue coordinates are missing", () => {
    expect(
      transferRecoveryOriginStops(journey(), [{ id: "500", name: "Hub A" }])
    ).toEqual([
      expect.objectContaining({
        id: "500",
        name: "Hub A",
        distanceMeters: 0,
      }),
    ]);
  });

  test("uses the explicitly confirmed boarding stop after the passenger has walked there", () => {
    const origins = transferRecoveryOriginStops(
      journey({ atStopConfirmedAt: 2_200_000 }),
      stops
    );

    expect(origins[0]).toMatchObject({
      id: "501",
      name: "Hub B",
      distanceMeters: 0,
    });
  });
});

describe("failed second-run exclusion", () => {
  test("excludes the failed concrete run but not another run on the same line", () => {
    expect(
      departureMatchesFailedTransferRun(
        {
          tripRef: "failed-run",
          originAimedDepartureAt: 2_400,
          lineRef: "7",
        },
        journey()
      )
    ).toBe(true);

    expect(
      departureMatchesFailedTransferRun(
        {
          tripRef: "replacement-run",
          originAimedDepartureAt: 2_400,
          lineRef: "7",
        },
        journey()
      )
    ).toBe(false);
  });

  test("uses origin planned time when both sides expose it", () => {
    expect(
      departureMatchesFailedTransferRun(
        {
          tripRef: "failed-run",
          originAimedDepartureAt: 2_460,
        },
        journey()
      )
    ).toBe(false);
  });

  test("removes a failed run before option ranking can select it", () => {
    const failed = {
      tripRef: "failed-run",
      originAimedDepartureAt: 2_400,
      departureAt: 2_700,
    };
    const replacement = {
      tripRef: "replacement-run",
      originAimedDepartureAt: 2_500,
      departureAt: 2_800,
    };

    const filtered = withoutFailedTransferRun(
      {
        "500": {
          stopId: "500",
          status: "good",
          best: failed,
          departures: [failed, replacement],
          additionalCount: 1,
          checkedAt: 1,
        },
      },
      journey()
    );

    expect(filtered["500"].departures).toEqual([replacement]);
    expect(filtered["500"].best).toBe(replacement);
  });
});


describe("transfer recovery fail-closed fallbacks", () => {
  test("requires a concrete transfer plan and recovery anchor", () => {
    expect(
      canSearchTransferRecovery({
        phase: "recovery",
        activeLegIndex: 1,
        itinerary: null,
      })
    ).toBe(false);

    expect(
      transferRecoveryOriginStops(
        journey({
          itinerary: {
            ...baseItinerary(),
            transfers: [
              {
                ...baseItinerary().transfers[0],
                alightStopId: "",
              },
            ],
          },
        }),
        stops
      )
    ).toEqual([]);
  });

  test("treats a non-array stop catalogue conservatively but keeps the exact authoritative stop", () => {
    const origins = transferRecoveryOriginStops(journey(), null);

    expect(origins).toEqual([
      {
        id: "500",
        name: "500",
        distanceMeters: 0,
      },
    ]);
  });

  test("ignores a non-numeric confirmed stop and keeps the authoritative alighting stop", () => {
    const origins = transferRecoveryOriginStops(
      journey({
        stopId: "platform-x",
        atStopConfirmedAt: 2_200_000,
      }),
      stops
    );

    expect(origins[0]).toMatchObject({
      id: "500",
      distanceMeters: 0,
    });
  });

  test("failed-run matching stays conservative when optional origin anchors are missing", () => {
    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "failed-run", originAimedDepartureAt: null },
        journey()
      )
    ).toBe(true);

    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "failed-run", originAimedDepartureAt: 2_400 },
        journey({
          itinerary: {
            ...baseItinerary(),
            legs: [
              baseItinerary().legs[0],
              {
                ...baseItinerary().legs[1],
                originAimedDepartureAt: null,
              },
            ],
          },
        })
      )
    ).toBe(true);

    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "failed-run", originAimedDepartureAt: 2_430 },
        journey()
      )
    ).toBe(true);

    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "failed-run", originAimedDepartureAt: 2_431 },
        journey()
      )
    ).toBe(false);

    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "anything" },
        { phase: "recovery", activeLegIndex: 1, itinerary: null }
      )
    ).toBe(false);
  });

  test("fit filtering handles best-only, empty and null fit maps without resurrecting the failed run", () => {
    const failed = {
      tripRef: "failed-run",
      originAimedDepartureAt: 2_400,
      departureAt: 2_700,
    };
    const replacement = {
      tripRef: "replacement-run",
      originAimedDepartureAt: 2_500,
      departureAt: 2_800,
    };

    expect(withoutFailedTransferRun(null, journey())).toEqual({});

    const bestOnly = withoutFailedTransferRun(
      {
        "500": {
          stopId: "500",
          best: replacement,
          departures: null,
        },
      },
      journey()
    );
    expect(bestOnly["500"].departures).toEqual([replacement]);
    expect(bestOnly["500"].best).toBe(replacement);

    const failedOnly = withoutFailedTransferRun(
      {
        "500": {
          stopId: "500",
          best: failed,
          departures: null,
        },
        "501": {
          stopId: "501",
          best: null,
          departures: null,
        },
      },
      journey()
    );
    expect(failedOnly["500"].departures).toEqual([]);
    expect(failedOnly["500"].best).toBeNull();
    expect(failedOnly["501"].departures).toEqual([]);
    expect(failedOnly["501"].best).toBeNull();
  });
});


test("missing candidate departure identity never matches a failed transfer run", () => {
  expect(departureMatchesFailedTransferRun(null, journey())).toBe(false);
  expect(
    departureMatchesFailedTransferRun(
      { tripRef: "" },
      journey()
    )
  ).toBe(false);
});
