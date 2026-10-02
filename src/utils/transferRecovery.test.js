import { describe, expect, test } from "vitest";
import {
  canSearchTransferRecovery,
  departureMatchesFailedTransferRun,
  failedRecoveryLeg,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "./transferRecovery";

function leg(tripRef, boardStopId, exitStopId, originAimedDepartureAt) {
  return {
    tripRef,
    lineRef: "7",
    boardStopId,
    boardStopSequence: 1,
    exitStopId,
    exitStopSequence: 2,
    departureAt: originAimedDepartureAt + 60,
    arrivalAt: originAimedDepartureAt + 600,
    aimedDepartureAt: originAimedDepartureAt + 60,
    originAimedDepartureAt,
    liveState: "schedule",
  };
}

function journey(overrides = {}) {
  const first = leg("first-run", "100", "500", 1_800);
  const failed = leg("failed-run", "501", "900", 2_400);
  const base = {
    id: "selected-transfer",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    activeLegIndex: 1,
    stopId: "501",
    atStopConfirmedAt: null,
    itinerary: {
      id: "itinerary",
      originStopId: "100",
      originStopName: "Origin",
      originDistanceMeters: 0,
      legs: [first, failed],
      transfers: [
        {
          alightStopId: "500",
          alightStopSequence: 8,
          boardStopId: "501",
          boardStopName: "Hub B",
          walkingDistanceM: 35,
          feasibility: { state: "comfortable", recommendable: true },
        },
      ],
      destinationStopId: "900",
      destinationArrivalAt: 3_000,
      finalWalkDistanceM: 0,
      finalWalkSecEstimate: 0,
      journeyArrivalAt: 3_000,
      totalWalkingDistanceM: 35,
      reliability: "medium",
    },
    futureLegRevalidations: {
      1: {
        providerState: "cancelled",
        decision: "cancelled",
        departureAt: null,
        feasibility: null,
        missingSinceMs: null,
      },
    },
  };
  return { ...base, ...overrides };
}

const stops = [
  { id: "500", name: "Hub A", lat: 60.45, lon: 22.26 },
  { id: "501", name: "Hub B", lat: 60.4503, lon: 22.2603 },
  { id: "700", name: "Far", lat: 60.48, lon: 22.3 },
];

describe("generic transfer recovery boundary", () => {
  test("activates only after the passenger reaches a safe transfer boundary", () => {
    expect(canSearchTransferRecovery(journey())).toBe(true);
    expect(
      canSearchTransferRecovery(journey({ activeLegIndex: 0 }))
    ).toBe(false);
    expect(
      canSearchTransferRecovery(journey({ phase: "walking-to-stop" }))
    ).toBe(false);
    expect(canSearchTransferRecovery(journey({ itinerary: null }))).toBe(false);
    expect(canSearchTransferRecovery(null)).toBe(false);
  });

  test("uses the failed current committed leg when it has strong failure evidence", () => {
    expect(failedRecoveryLeg(journey())).toMatchObject({
      tripRef: "failed-run",
      boardStopId: "501",
      originAimedDepartureAt: 2_400,
    });
  });

  test("finds a failed farther leg without pretending the current leg failed", () => {
    const second = leg("second-run", "501", "700", 2_400);
    const third = leg("failed-third", "701", "900", 3_200);
    const selected = journey({
      activeLegIndex: 1,
      itinerary: {
        ...journey().itinerary,
        legs: [journey().itinerary.legs[0], second, third],
        transfers: [
          journey().itinerary.transfers[0],
          {
            alightStopId: "700",
            alightStopSequence: 9,
            boardStopId: "701",
            boardStopName: "Hub C",
            walkingDistanceM: 25,
            feasibility: { state: "comfortable", recommendable: true },
          },
        ],
      },
      futureLegRevalidations: {
        2: {
          providerState: "cancelled",
          decision: "cancelled",
          departureAt: null,
          feasibility: null,
          missingSinceMs: null,
        },
      },
    });

    expect(failedRecoveryLeg(selected)).toMatchObject({
      tripRef: "failed-third",
      boardStopId: "701",
    });
  });

  test("builds same-stop first plus bounded nearby-platform origins from the authoritative alighting point", () => {
    const origins = transferRecoveryOriginStops(journey(), stops);
    expect(origins[0]).toMatchObject({
      id: "500",
      name: "Hub A",
      distanceMeters: 0,
    });
    expect(origins.map((item) => item.id)).toContain("501");
    expect(origins.map((item) => item.id)).not.toContain("700");
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

  test("falls back to the exact authoritative stop without catalogue coordinates", () => {
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
});

describe("failed concrete-run exclusion", () => {
  test("excludes the failed run but not another run on the same line", () => {
    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "failed-run", originAimedDepartureAt: 2_400 },
        journey()
      )
    ).toBe(true);
    expect(
      departureMatchesFailedTransferRun(
        { tripRef: "replacement-run", originAimedDepartureAt: 2_400 },
        journey()
      )
    ).toBe(false);
  });

  test("uses origin planned time as an occurrence discriminator", () => {
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
  });

  test("removes failed departures before ranking while preserving alternatives", () => {
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

  test("handles null/best-only fits fail closed", () => {
    expect(withoutFailedTransferRun(null, journey())).toEqual({});

    const failedOnly = withoutFailedTransferRun(
      {
        "500": {
          stopId: "500",
          best: {
            tripRef: "failed-run",
            originAimedDepartureAt: 2_400,
          },
          departures: null,
        },
      },
      journey()
    );
    expect(failedOnly["500"].departures).toEqual([]);
    expect(failedOnly["500"].best).toBeNull();
  });

  test("missing candidate identity never matches", () => {
    expect(departureMatchesFailedTransferRun(null, journey())).toBe(false);
    expect(
      departureMatchesFailedTransferRun({ tripRef: "" }, journey())
    ).toBe(false);
  });
});
