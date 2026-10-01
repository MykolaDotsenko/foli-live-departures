import { describe, expect, test } from "vitest";
import {
  canSearchTransferRecovery,
  departureMatchesFailedTransferRun,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "./transferRecovery";

function journey(overrides = {}) {
  return {
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    transferLeg: 2,
    stopId: "501",
    atStopConfirmedAt: null,
    transferPlan: {
      transfer: {
        alightStopId: "500",
        boardStopId: "501",
      },
      second: {
        tripRef: "failed-run",
        originAimedDepartureAt: 2_400,
      },
    },
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
    expect(canSearchTransferRecovery(journey({ transferLeg: 1 }))).toBe(false);
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
