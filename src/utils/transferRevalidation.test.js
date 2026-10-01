import { describe, expect, test } from "vitest";
import {
  applyTransferRevalidation,
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
  transferLeg: 1,
  transferRevalidation: null,
  transferPlan: {
    id: "t",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 10,
    first: {
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
    transfer: {
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
    },
    second: {
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
    },
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
      delaySec: 120,
    });
    expect(state.feasibility.slackSec).toBeGreaterThan(
      journey.transferPlan.transfer.feasibility.slackSec
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

  test("a fresh row clearly past its departure is missed unless still at the stop", () => {
    const missed = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ recordedattime: 2_050, expecteddeparturetime: 2_060 })],
      referenceTimeSec: 2_100,
      receivedAtMs: 2_100_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });
    expect(missed.decision).toBe("missed");

    const stillThere = evaluateTransferRevalidation({
      journey,
      arrivals: [
        liveArrival({
          recordedattime: 2_050,
          expecteddeparturetime: 2_060,
          vehicleatstop: true,
        }),
      ],
      referenceTimeSec: 2_100,
      receivedAtMs: 2_100_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });
    expect(stillThere.decision).not.toBe("missed");
  });
});

describe("applying revalidation to a committed journey", () => {
  test("fresh live timing updates leg 2 without changing the selected trip", () => {
    const state = evaluateTransferRevalidation({
      journey,
      arrivals: [liveArrival({ expecteddeparturetime: 2_120 })],
      referenceTimeSec: 1_720,
      receivedAtMs: 1_720_000,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    });

    const next = applyTransferRevalidation(journey, state);
    expect(next.transferPlan.second).toMatchObject({
      tripRef: "second",
      departureAt: 2_120,
      liveState: "delayed",
    });
    expect(next.phase).toBe("waiting");
  });

  test.each([
    ["cancelled", "cancelled", "transfer-cancelled"],
    ["live", "unsafe", "transfer-risk"],
    ["missing", "missed", "transfer-missed"],
  ])("%s/%s enters %s recovery", (providerState, decision, reason) => {
    const next = applyTransferRevalidation(journey, {
      providerState,
      decision,
      departureAt: 2_000,
      delaySec: null,
      feasibility: journey.transferPlan.transfer.feasibility,
      receivedAtMs: 2_100_000,
      missingSinceMs: null,
      matchedAtMs: null,
      providerAgeSec: null,
    });

    expect(next).toMatchObject({
      phase: "recovery",
      recoveryReason: reason,
    });
  });

  test("degraded evidence is recorded but cannot undo or fail the commitment", () => {
    const next = applyTransferRevalidation(journey, {
      providerState: "degraded",
      decision: "unknown",
      departureAt: 2_000,
      delaySec: null,
      feasibility: journey.transferPlan.transfer.feasibility,
      receivedAtMs: 2_100_000,
      missingSinceMs: null,
      matchedAtMs: null,
      providerAgeSec: null,
    });

    expect(next.phase).toBe("waiting");
    expect(next.recoveryReason).toBeNull();
    expect(next.transferRevalidation.providerState).toBe("degraded");
  });
});


test("applying the same transfer observation is idempotent", () => {
  const state = evaluateTransferRevalidation({
    journey,
    arrivals: [liveArrival({ expecteddeparturetime: 2_120 })],
    referenceTimeSec: 1_720,
    receivedAtMs: 1_720_000,
    incomingArrivalAt: 1_600,
    incomingLiveState: "live",
  });

  const once = applyTransferRevalidation(journey, state);
  const twice = applyTransferRevalidation(once, state);
  expect(twice).toBe(once);
});
