import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import useActiveJourney from "./useActiveJourney";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const option = {
  id: "100:trip-1:1500",
  label: "fastest",
  stopId: "100",
  stopName: "Kauppatori D2",
  distanceMeters: 200,
  departure: {
    tripRef: "trip-1",
    lineRef: "18",
    destinationStopId: "900",
    departureAt: 1_500,
    aimedDepartureAt: 1_480,
    destinationArrivalAt: 2_100,
    catchability: "comfortable",
    liveState: "live",
    rideDurationSec: 600,
  },
  arrivalDeltaSec: 0,
  walkingDeltaMeters: 0,
};

test("selects, advances, observes and clears an active journey", () => {
  const { result } = renderHook(() => useActiveJourney());

  expect(result.current.journey).toBeNull();

  act(() => {
    expect(
      result.current.selectDirectJourney(option, destination)
    ).toBe(true);
  });
  expect(result.current.journey?.phase).toBe("walking-to-stop");

  act(() => result.current.confirmAtStop());
  expect(result.current.journey?.phase).toBe("waiting");

  act(() => {
    result.current.observeStopFeed({
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_650,
      },
      referenceTimeSec: 1_500,
      receivedAtMs: Date.now() + 60_000,
      feedError: false,
      cancelled: false,
    });
  });
  expect(result.current.journey?.departureAt).toBe(1_650);

  act(() => result.current.clearJourney());
  expect(result.current.journey).toBeNull();
});


function transferOption() {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "transfer:100:first:500:second:900",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 80,
    first: {
      tripRef: "first",
      lineRef: "1",
      boardStopId: "100",
      boardStopSequence: 1,
      exitStopId: "500",
      exitStopSequence: 8,
      departureAt: now + 300,
      arrivalAt: now + 900,
      aimedDepartureAt: now + 280,
      originAimedDepartureAt: now,
      liveState: "live",
    },
    transfer: {
      alightStopId: "500",
      alightStopSequence: 8,
      boardStopId: "501",
      boardStopName: "Transfer platform",
      walkingDistanceM: 70,
      feasibility: {
        state: "comfortable",
        recommendable: true,
        incomingArrivalAt: now + 900,
        outgoingDepartureAt: now + 1_500,
        walkingDistanceM: 70,
        requiredSec: 175,
        availableSec: 600,
        slackSec: 425,
      },
    },
    second: {
      tripRef: "second",
      lineRef: "7",
      boardStopId: "501",
      boardStopSequence: 3,
      exitStopId: "900",
      exitStopSequence: 14,
      departureAt: now + 1_500,
      arrivalAt: now + 2_400,
      aimedDepartureAt: now + 1_500,
      originAimedDepartureAt: now + 1_200,
      liveState: "schedule",
    },
    destinationStopId: "900",
    destinationArrivalAt: now + 2_400,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    journeyArrivalAt: now + 2_400,
    totalWalkingDistanceM: 150,
    reliability: "medium",
  };
}

test("commits and continues a concrete transfer journey through the public hook API", () => {
  const { result } = renderHook(() => useActiveJourney());
  const transfer = transferOption();

  act(() => {
    expect(
      result.current.selectTransferJourney(transfer, destination)
    ).toBe(true);
  });
  expect(result.current.journey).toMatchObject({
    transferLeg: 1,
    tripRef: "first",
    destinationStopId: "500",
  });

  const pending = result.current.journey;
  let continued;
  act(() => {
    continued = result.current.continueTransferAfterRide(pending, {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    });
  });

  expect(continued).toMatchObject({
    transferLeg: 2,
    tripRef: "second",
    stopId: "501",
  });
  expect(result.current.journey).toMatchObject({
    transferLeg: 2,
    tripRef: "second",
  });
});

test("transfer hook fails closed for invalid selections and premature Ride Mode completion", () => {
  const { result } = renderHook(() => useActiveJourney());

  act(() => {
    expect(result.current.selectTransferJourney({}, destination)).toBe(false);
    expect(result.current.selectDirectJourney({}, destination)).toBe(false);
  });
  expect(result.current.journey).toBeNull();

  const transfer = transferOption();
  act(() => {
    result.current.selectTransferJourney(transfer, destination);
  });
  const pending = result.current.journey;

  act(() => {
    expect(
      result.current.continueTransferAfterRide(pending, {
        tripRef: "first",
        stage: "next",
        targetStop: { id: "500", stopSequence: 8 },
      })
    ).toBeNull();
  });

  let recovered;
  act(() => {
    recovered = result.current.recoverTransferAfterRide(pending, {
      tripRef: "first",
      stage: "next",
      targetStop: { id: "500", stopSequence: 8 },
    });
  });
  expect(recovered).toMatchObject({
    transferLeg: 1,
    phase: "recovery",
    recoveryReason: "transfer-risk",
  });
  expect(result.current.journey?.phase).toBe("recovery");

  act(() => {
    expect(result.current.recoverTransferAfterRide(null, null)).toBeNull();
    result.current.clearJourney();
    result.current.confirmAtStop();
    result.current.observeStopFeed({
      stopId: "100",
      arrival: null,
      referenceTimeSec: null,
      receivedAtMs: null,
      feedError: true,
      cancelled: false,
    });
  });
  expect(result.current.journey).toBeNull();
});


test("applies live second-leg revalidation through the public hook API", () => {
  const { result } = renderHook(() => useActiveJourney());
  const transfer = transferOption();

  act(() => {
    result.current.selectTransferJourney(transfer, destination);
  });

  act(() => {
    result.current.revalidateTransfer({
      providerState: "cancelled",
      decision: "cancelled",
      departureAt: transfer.second.departureAt,
      feasibility: transfer.transfer.feasibility,
      missingSinceMs: null,
    });
  });

  expect(result.current.journey).toMatchObject({
    transferLeg: 1,
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  });
});

function threeLegOption() {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "three-leg",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 20,
    legs: [
      {
        tripRef: "first-3",
        lineRef: "1",
        boardStopId: "100",
        boardStopSequence: 1,
        exitStopId: "500",
        exitStopSequence: 5,
        departureAt: now + 300,
        arrivalAt: now + 600,
        aimedDepartureAt: now + 300,
        originAimedDepartureAt: now + 180,
        liveState: "live",
      },
      {
        tripRef: "second-3",
        lineRef: "7",
        boardStopId: "500",
        boardStopSequence: 1,
        exitStopId: "700",
        exitStopSequence: 6,
        departureAt: now + 900,
        arrivalAt: now + 1_200,
        aimedDepartureAt: now + 900,
        originAimedDepartureAt: now + 780,
        liveState: "schedule",
      },
      {
        tripRef: "third-3",
        lineRef: "18",
        boardStopId: "700",
        boardStopSequence: 1,
        exitStopId: "900",
        exitStopSequence: 7,
        departureAt: now + 1_500,
        arrivalAt: now + 1_900,
        aimedDepartureAt: now + 1_500,
        originAimedDepartureAt: now + 1_380,
        liveState: "schedule",
      },
    ],
    transfers: [
      {
        alightStopId: "500",
        alightStopSequence: 5,
        boardStopId: "500",
        boardStopName: "Hub A",
        walkingDistanceM: 0,
        feasibility: {
          state: "comfortable",
          recommendable: true,
          incomingArrivalAt: now + 600,
          outgoingDepartureAt: now + 900,
          walkingDistanceM: 0,
          requiredSec: 60,
          availableSec: 300,
          slackSec: 240,
        },
      },
      {
        alightStopId: "700",
        alightStopSequence: 6,
        boardStopId: "700",
        boardStopName: "Hub B",
        walkingDistanceM: 0,
        feasibility: {
          state: "comfortable",
          recommendable: true,
          incomingArrivalAt: now + 1_200,
          outgoingDepartureAt: now + 1_500,
          walkingDistanceM: 0,
          requiredSec: 60,
          availableSec: 300,
          slackSec: 240,
        },
      },
    ],
    destinationStopId: "900",
    destinationArrivalAt: now + 1_900,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    journeyArrivalAt: now + 1_900,
    totalWalkingDistanceM: 20,
    reliability: "medium",
  };
}

test("three-leg journey advances through both authoritative Ride Mode handoffs", () => {
  const { result } = renderHook(() => useActiveJourney());
  const multi = threeLegOption();

  act(() => {
    expect(result.current.selectTransferJourney(multi, destination)).toBe(true);
  });
  expect(result.current.journey).toMatchObject({
    activeLegIndex: 0,
    tripRef: "first-3",
    destinationStopId: "500",
    transferPlan: null,
  });

  const first = result.current.journey;
  act(() => {
    result.current.continueTransferAfterRide(first, {
      tripRef: "first-3",
      stage: "now",
      targetStop: { id: "500", stopSequence: 5 },
    });
  });
  expect(result.current.journey).toMatchObject({
    activeLegIndex: 1,
    tripRef: "second-3",
    stopId: "500",
    destinationStopId: "700",
  });

  const second = result.current.journey;
  act(() => {
    result.current.continueTransferAfterRide(second, {
      tripRef: "second-3",
      stage: "now",
      targetStop: { id: "700", stopSequence: 6 },
    });
  });
  expect(result.current.journey).toMatchObject({
    activeLegIndex: 2,
    tripRef: "third-3",
    stopId: "700",
    destinationStopId: "900",
  });
});

test("three-leg journey can fail a specific later leg without skipping the current leg", () => {
  const { result } = renderHook(() => useActiveJourney());
  const multi = threeLegOption();

  act(() => {
    result.current.selectTransferJourney(multi, destination);
  });
  act(() => {
    result.current.revalidateTransfer(
      {
        providerState: "cancelled",
        decision: "cancelled",
        departureAt: multi.legs[2].departureAt,
        feasibility: multi.transfers[1].feasibility,
        missingSinceMs: null,
      },
      2
    );
  });

  expect(result.current.journey).toMatchObject({
    activeLegIndex: 0,
    tripRef: "first-3",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    futureLegRevalidations: {
      2: {
        providerState: "cancelled",
        decision: "cancelled",
      },
    },
  });
});

