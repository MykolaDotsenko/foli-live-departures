import { describe, expect, test } from "vitest";
import {
  evaluateTransferRevalidation,
  transferSecondArrivalMatches,
} from "./transferRevalidation";

const journey = {
  id: "j",
  destinationId: "d",
  destinationKind: "public-stop",
  destinationLabel: "Destination",
  optionLabel: "transfer",
  stopId: "100",
  stopName: "Origin",
  distanceMeters: 10,
  tripRef: "first",
  lineRef: "1",
  destinationStopId: "500",
  destinationStopSequence: 5,
  departureAt: 1_000,
  aimedDepartureAt: 1_000,
  originAimedDepartureAt: 900,
  destinationArrivalAt: 2_000,
  journeyArrivalAt: 2_000,
  finalWalkDistanceM: null,
  finalWalkSecEstimate: null,
  liveState: "schedule",
  phase: "waiting",
  recoveryReason: null,
  selectedAt: 1,
  atStopConfirmedAt: 2,
  lastSeenAt: 2,
  activeLegIndex: 0,
  transferRevalidation: null,
  itinerary: {
    id: "t",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 10,
    legs: [{
      tripRef: "first",
      lineRef: "1",
      boardStopId: "100",
      boardStopSequence: 1,
      exitStopId: "500",
      exitStopSequence: 5,
      departureAt: 1_000,
      arrivalAt: 1_600,
      aimedDepartureAt: 1_000,
      originAimedDepartureAt: 900,
      liveState: "schedule",
    },
    {
      alightStopId: "500",
      alightStopSequence: 5,
      boardStopId: "501",
      boardStopName: "Hub B",
      walkingDistanceM: 80,
      feasibility: {
        state: "comfortable",
        recommendable: true,
        incomingArrivalAt: 1_600,
        outgoingDepartureAt: 2_000,
        walkingDistanceM: 80,
        requiredSec: 167,
        availableSec: 400,
        slackSec: 233,
      },
    }],
    transfers: [{
      tripRef: "second",
      lineRef: "7",
      boardStopId: "501",
      boardStopSequence: 3,
      exitStopId: "900",
      exitStopSequence: 8,
      departureAt: 2_000,
      arrivalAt: 2_400,
      aimedDepartureAt: 2_000,
      originAimedDepartureAt: 1_800,
      liveState: "schedule",
    }],
    destinationStopId: "900",
    destinationArrivalAt: 2_400,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    journeyArrivalAt: 2_400,
    totalWalkingDistanceM: 90,
    reliability: "medium",
  },
};

function liveArrival(overrides = {}) {
  return {
    tripref: "second",
    lineref: "7",
    monitored: true,
    vehicleatstop: false,
    recordedattime: 1_700,
    originaimeddeparturetime: 1_800,
    aimeddeparturetime: 2_000,
    expecteddeparturetime: 2_060,
    ...overrides,
  };
}

describe("second-leg occurrence identity", () => {
  test("requires the selected trip and rejects a different loop/run occurrence", () => {
    expect(transferSecondArrivalMatches(liveArrival(), journey)).toBe(true);
    expect(
      transferSecondArrivalMatches(liveArrival({ tripref: "other" }), journey)
    ).toBe(false);
    expect(
      transferSecondArrivalMatches(
        liveArrival({ originaimeddeparturetime: 1_700 }),
        journey
      )
    ).toBe(false);
    expect(
      transferSecondArrivalMatches(
        liveArrival({ aimeddeparturetime: 2_200 }),
        journey
      )
    ).toBe(false);
  });
});

describe("live transfer revalidation", () => {
  test("uses fresh second-leg prediction to improve the transfer margin", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ expecteddeparturetime: 2_120 })],
      referenceTimeSec: 1_720,
      receivedAtMs: 1_720_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });

    expect(state).toMatchObject({
      providerState: "live",
      decision: "good",
      departureAt: 2_120,
    });
    expect(state.feasibility.slackSec).toBeGreaterThan(
      journey.itinerary.transfers[0].feasibility.slackSec
    );
  });

  test("fresh early timing can make a committed transfer unsafe", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ expecteddeparturetime: 1_760 })],
      referenceTimeSec: 1_710,
      receivedAtMs: 1_710_000,
      incomingArrivalAt: 1_650,
      incomingLiveState: "delayed",
    });

    expect(state.providerState).toBe("live");
    expect(state.decision).toBe("unsafe");
    expect(state.feasibility.recommendable).toBe(false);
  });

  test("stale repeated SIRI never becomes false missed or unsafe evidence", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ recordedattime: 1_400, expecteddeparturetime: 1_650 })],
      referenceTimeSec: 1_800,
      receivedAtMs: 1_800_000,
      incomingArrivalAt: 1_700,
      incomingLiveState: "live",
    });

    expect(state).toMatchObject({
      providerState: "stale",
      decision: "unknown",
      departureAt: 2_000,
    });
  });

  test("provider failure degrades confidence without declaring departure", () => {
    const state = evaluateTransferRevalidation({
      journey,
      feedError: true,
      referenceTimeSec: 2_500,
      receivedAtMs: 2_500_000,
      incomingArrivalAt: 1_900,
      incomingLiveState: "live",
    });

    expect(state).toMatchObject({
      providerState: "degraded",
      decision: "unknown",
    });
  });

  test("cancellation is strong evidence even if the live row disappeared", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [],
      cancelled: true,
      referenceTimeSec: 1_800,
      receivedAtMs: 1_800_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });

    expect(state).toMatchObject({
      providerState: "cancelled",
      decision: "cancelled",
    });
  });

  test("one absent successful poll after departure is not enough to call missed", () => {
    const first = evaluateTransferRevalidation({
      journey,
      arrivals: [],
      referenceTimeSec: 2_130,
      receivedAtMs: 2_130_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });

    expect(first).toMatchObject({
      providerState: "missing",
      decision: "unknown",
      missingSinceMs: 2_130_000,
    });

    const confirmed = evaluateTransferRevalidation({
      journey,
      arrivals: [],
      referenceTimeSec: 2_170,
      receivedAtMs: 2_170_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
      previous: first,
    });

    expect(confirmed.decision).toBe("missed");
  });

  test("only provider evidence recorded after departure can mark a still-visible row missed", () => {
    const ageingLocally = evaluateTransferRevalidation({
      journey,
      arrivals: [
        liveArrival({
          recordedattime: 2_050,
          expecteddeparturetime: 2_060,
        }),
      ],
      referenceTimeSec: 2_100,
      receivedAtMs: 2_100_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });
    expect(ageingLocally.decision).not.toBe("missed");

    const providerObservedDeparture = evaluateTransferRevalidation({
      journey,
      arrivals: [
        liveArrival({
          recordedattime: 2_100,
          expecteddeparturetime: 2_060,
        }),
      ],
      referenceTimeSec: 2_110,
      receivedAtMs: 2_110_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });
    expect(providerObservedDeparture.decision).toBe("missed");

    const stillThere = evaluateTransferRevalidation({
      journey,
      arrivals: [
        liveArrival({
          recordedattime: 2_100,
          expecteddeparturetime: 2_060,
          vehicleatstop: true,
        }),
      ],
      referenceTimeSec: 2_110,
      receivedAtMs: 2_110_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });
    expect(stillThere.decision).not.toBe("missed");
  });
});

describe("transfer revalidation fallback and branch safety", () => {
  test("occurrence matching tolerates missing optional provider anchors but still requires an active transfer leg", () => {
    expect(
      transferSecondArrivalMatches(
        liveArrival({
          originaimeddeparturetime: null,
          aimeddeparturetime: null,
          aimedarrivaltime: null,
        }),
        journey
      )
    ).toBe(true);

    const unanchored = JSON.parse(JSON.stringify(journey));
    unanchored.itinerary.legs[1].originAimedDepartureAt = null;
    unanchored.itinerary.legs[1].aimedDepartureAt = null;

    expect(
      transferSecondArrivalMatches(
        liveArrival({
          originaimeddeparturetime: 1_700,
          aimeddeparturetime: null,
          aimedarrivaltime: 2_000,
        }),
        unanchored
      )
    ).toBe(true);

    expect(
      transferSecondArrivalMatches(liveArrival(), {
        ...journey,
        activeLegIndex: 1,
      })
    ).toBe(false);
  });

  test("same-stop fallback can classify a tight connection using the planned incoming arrival", () => {
    const sameStop = JSON.parse(JSON.stringify(journey));
    sameStop.itinerary.transfers[0].boardStopId = "500";
    sameStop.itinerary.transfers[0].walkingDistanceM = null;
    sameStop.itinerary.legs[1].boardStopId = "500";
    sameStop.itinerary.legs[1].departureAt = 1_800;
    sameStop.itinerary.legs[1].aimedDepartureAt = 1_800;

    const state = evaluateTransferRevalidation({
      journey: sameStop,
      arrivals: [
        liveArrival({
          aimeddeparturetime: 1_800,
          expecteddeparturetime: 1_800,
        }),
      ],
      referenceTimeSec: 1_720,
      receivedAtMs: 1_720_000,
    });

    expect(state).toMatchObject({
      providerState: "live",
      decision: "tight",
      departureAt: 1_800,
    });
    expect(state.feasibility).toMatchObject({
      recommendable: true,
      state: "tight",
      walkingDistanceM: 0,
      incomingArrivalAt: 1_600,
    });
  });

  test("unmonitored and timestamp-less rows stay stale", () => {
    const prior = {
      providerState: "live",
      decision: "good",
      departureAt: 2_000,
      feasibility: journey.itinerary.transfers[0].feasibility,
      missingSinceMs: null,
    };

    const unmonitored = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ monitored: false })],
      referenceTimeSec: 1_720,
      receivedAtMs: null,
      previous: prior,
    });
    expect(unmonitored).toMatchObject({
      providerState: "stale",
      decision: "unknown",
    });

    const noProviderTimestamp = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ recordedattime: null })],
      referenceTimeSec: 1_720,
      receivedAtMs: 1_720_000,
      previous: prior,
    });
    expect(noProviderTimestamp.providerState).toBe("stale");
  });

  test("non-array or timestamp-less missing evidence cannot fabricate a miss", () => {
    const missing = evaluateTransferRevalidation({
      journey,
      arrivals: null,
      referenceTimeSec: 2_500,
      receivedAtMs: null,
    });

    expect(missing).toMatchObject({
      providerState: "missing",
      decision: "unknown",
      missingSinceMs: null,
    });

    const invalidPrior = evaluateTransferRevalidation({
      journey,
      arrivals: [],
      referenceTimeSec: 2_500,
      receivedAtMs: 2_500_000,
      previous: {
        providerState: "missing",
        missingSinceMs: 0,
      },
    });
    expect(invalidPrior).toMatchObject({
      providerState: "missing",
      decision: "unknown",
      missingSinceMs: 2_500_000,
    });
  });

  test("degraded and cancelled states preserve prior evidence without treating it as fresh live data", () => {
    const previous = {
      providerState: "missing",
      missingSinceMs: 1_700_000,
    };

    const degraded = evaluateTransferRevalidation({
      journey,
      feedError: true,
      receivedAtMs: 1_800_000,
      previous,
    });
    expect(degraded).toMatchObject({
      providerState: "degraded",
      decision: "unknown",
      missingSinceMs: 1_700_000,
    });

    const cancelled = evaluateTransferRevalidation({
      journey,
      cancelled: true,
      receivedAtMs: null,
      previous,
    });
    expect(cancelled).toMatchObject({
      providerState: "cancelled",
      decision: "cancelled",
      missingSinceMs: null,
    });
  });

  test("fresh live data falls back to the selected planned departure when the provider omits predictions", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [
        liveArrival({
          expecteddeparturetime: null,
          expectedarrivaltime: null,
          aimeddeparturetime: null,
          aimedarrivaltime: null,
        }),
      ],
      referenceTimeSec: 1_720,
      receivedAtMs: 1_720_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });

    expect(state).toMatchObject({
      providerState: "live",
      decision: "good",
      departureAt: 2_000,
    });
  });

});
