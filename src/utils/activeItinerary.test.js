import { expect, test } from "vitest";
import {
  activeJourneyFromItinerary,
  advanceItineraryAfterRide,
  applyFutureLegRevalidation,
  currentItineraryIndex,
  currentItineraryLeg,
  itineraryHasFutureLeg,
  nextItineraryLeg,
  nextItineraryTransfer,
  recoverItineraryAfterRide,
  rideMatchesCurrentItineraryLeg,
} from "./activeItinerary";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Destination",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

function leg(id, line, board, exit, departureAt, arrivalAt, exitSequence) {
  return {
    tripRef: id,
    lineRef: line,
    boardStopId: board,
    boardStopSequence: 1,
    exitStopId: exit,
    exitStopSequence: exitSequence,
    departureAt,
    arrivalAt,
    aimedDepartureAt: departureAt,
    originAimedDepartureAt: departureAt - 60,
    liveState: "schedule",
  };
}

function transfer(alight, board, departureAt) {
  return {
    alightStopId: alight,
    alightStopSequence: 5,
    boardStopId: board,
    boardStopName: `Platform ${board}`,
    walkingDistanceM: alight === board ? 0 : 75,
    feasibility: {
      state: "comfortable",
      recommendable: true,
      incomingArrivalAt: departureAt - 300,
      outgoingDepartureAt: departureAt,
      walkingDistanceM: alight === board ? 0 : 75,
      requiredSec: 120,
      availableSec: 300,
      slackSec: 180,
    },
  };
}

function option() {
  return {
    id: "three-leg",
    originStopId: "100",
    originStopName: "Origin",
    originDistanceMeters: 50,
    legs: [
      leg("first", "1", "100", "500", 1_500, 1_900, 8),
      leg("second", "7", "501", "700", 2_400, 2_800, 9),
      leg("third", "18", "700", "900", 3_200, 3_800, 10),
    ],
    transfers: [
      transfer("500", "501", 2_400),
      transfer("700", "700", 3_200),
    ],
    destinationStopId: "900",
    destinationArrivalAt: 3_800,
    journeyArrivalAt: 3_800,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    totalWalkingDistanceM: 125,
    reliability: "medium",
  };
}

test("projects the first leg of a three-leg itinerary", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  expect(journey).toMatchObject({
    activeLegIndex: 0,
    tripRef: "first",
    stopId: "100",
    destinationStopId: "500",
    transferPlan: null,
    transferLeg: null,
  });
  expect(journey.itinerary.legs).toHaveLength(3);
  expect(currentItineraryLeg(journey).tripRef).toBe("first");
  expect(itineraryHasFutureLeg(journey)).toBe(true);
});

test("advances only after exact authoritative NOW and preserves Ride Mode authority", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  expect(
    rideMatchesCurrentItineraryLeg(journey, {
      tripRef: "first",
      targetStop: { id: "500", stopSequence: 8 },
    })
  ).toBe(true);
  expect(
    advanceItineraryAfterRide(
      journey,
      {
        tripRef: "first",
        stage: "next",
        targetStop: { id: "500", stopSequence: 8 },
      },
      1_950_000
    )
  ).toBeNull();

  const second = advanceItineraryAfterRide(
    journey,
    {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(second).toMatchObject({
    activeLegIndex: 1,
    tripRef: "second",
    stopId: "501",
    destinationStopId: "700",
    phase: "walking-to-stop",
  });

  const third = advanceItineraryAfterRide(
    second,
    {
      tripRef: "second",
      stage: "now",
      targetStop: { id: "700", stopSequence: 9 },
    },
    2_850_000
  );
  expect(third).toMatchObject({
    activeLegIndex: 2,
    tripRef: "third",
    stopId: "700",
    destinationStopId: "900",
  });
  expect(itineraryHasFutureLeg(third)).toBe(false);
});

test("premature Ride Mode end fails closed instead of skipping a leg", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  const recovered = recoverItineraryAfterRide(
    journey,
    {
      tripRef: "first",
      stage: "next",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(recovered).toMatchObject({
    activeLegIndex: 0,
    tripRef: "first",
    phase: "recovery",
    recoveryReason: "transfer-risk",
  });
});

test("revalidates any committed future leg without trusting stale uncertainty", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  const delayed = applyFutureLegRevalidation(journey, 2, {
    providerState: "live",
    decision: "good",
    departureAt: 3_260,
    feasibility: { state: "comfortable", recommendable: true },
    missingSinceMs: null,
  });
  expect(delayed.itinerary.legs[2]).toMatchObject({
    departureAt: 3_260,
    arrivalAt: 3_860,
    liveState: "delayed",
  });
  expect(delayed).toMatchObject({
    phase: "walking-to-stop",
    destinationArrivalAt: 3_860,
    journeyArrivalAt: 3_860,
  });
  expect(delayed.itinerary).toMatchObject({
    destinationArrivalAt: 3_860,
    journeyArrivalAt: 3_860,
  });

  const stale = applyFutureLegRevalidation(delayed, 1, {
    providerState: "stale",
    decision: "unknown",
    departureAt: 2_400,
    feasibility: null,
    missingSinceMs: null,
  });
  expect(stale.phase).toBe("walking-to-stop");

  const cancelled = applyFutureLegRevalidation(stale, 2, {
    providerState: "cancelled",
    decision: "cancelled",
    departureAt: 3_260,
    feasibility: null,
    missingSinceMs: null,
  });

  // A broken third leg is recorded immediately, but must not interrupt the
  // first bus. Ride Mode stays authoritative until the passenger reaches the
  // next real transfer point.
  expect(cancelled).toMatchObject({
    activeLegIndex: 0,
    phase: "walking-to-stop",
  });
  expect(cancelled.futureLegRevalidations[2]).toMatchObject({
    providerState: "cancelled",
    decision: "cancelled",
  });

  const atFirstTransfer = advanceItineraryAfterRide(
    cancelled,
    {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(atFirstTransfer).toMatchObject({
    activeLegIndex: 1,
    tripRef: "second",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  });
});


test("null or malformed active-leg identity never aliases leg zero", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  expect(currentItineraryIndex(null)).toBeNull();
  expect(currentItineraryIndex({ activeLegIndex: null })).toBeNull();
  expect(currentItineraryIndex({ activeLegIndex: -1 })).toBeNull();
  expect(currentItineraryIndex({ activeLegIndex: 1.5 })).toBeNull();
  expect(currentItineraryLeg({ ...journey, activeLegIndex: null })).toBeNull();
  expect(nextItineraryLeg({ ...journey, activeLegIndex: null })).toBeNull();
  expect(nextItineraryTransfer({ ...journey, activeLegIndex: null })).toBeNull();
});

test("exact current-leg matching rejects wrong run, stop and repeated-stop occurrence", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  expect(rideMatchesCurrentItineraryLeg(journey, null)).toBe(false);
  expect(
    rideMatchesCurrentItineraryLeg(journey, {
      tripRef: "wrong",
      targetStop: { id: "500", stopSequence: 8 },
    })
  ).toBe(false);
  expect(
    rideMatchesCurrentItineraryLeg(journey, {
      tripRef: "first",
      targetStop: { id: "999", stopSequence: 8 },
    })
  ).toBe(false);
  expect(
    rideMatchesCurrentItineraryLeg(journey, {
      tripRef: "first",
      targetStop: { id: "500", stopSequence: 99 },
    })
  ).toBe(false);

  const withoutSequence = {
    ...journey,
    itinerary: {
      ...journey.itinerary,
      legs: [
        { ...journey.itinerary.legs[0], exitStopSequence: null },
        ...journey.itinerary.legs.slice(1),
      ],
    },
  };
  expect(
    rideMatchesCurrentItineraryLeg(withoutSequence, {
      tripRef: "first",
      targetStop: { id: "500", stopSequence: 99 },
    })
  ).toBe(true);
});

test("active-itinerary creation and advancement reject incomplete authority", () => {
  expect(activeJourneyFromItinerary(null, destination, 1_000_000)).toBeNull();
  expect(
    activeJourneyFromItinerary(option(), { ...destination, id: "" }, 1_000_000)
  ).toBeNull();
  expect(
    activeJourneyFromItinerary(option(), { ...destination, label: "" }, 1_000_000)
  ).toBeNull();
  expect(activeJourneyFromItinerary(option(), destination, 0)).toBeNull();

  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  expect(
    advanceItineraryAfterRide(
      { ...journey, phase: "recovery" },
      {
        tripRef: "first",
        stage: "now",
        targetStop: { id: "500", stopSequence: 8 },
      },
      1_950_000
    )
  ).toBeNull();
  expect(
    advanceItineraryAfterRide(
      journey,
      {
        tripRef: "first",
        stage: "next",
        targetStop: { id: "500", stopSequence: 8 },
      },
      1_950_000
    )
  ).toBeNull();
});

test("one-transfer generic itinerary preserves legacy aliases through the handoff", () => {
  const source = option();
  const twoLeg = {
    ...source,
    id: "two-leg",
    legs: source.legs.slice(0, 2),
    transfers: source.transfers.slice(0, 1),
    destinationStopId: "700",
    destinationArrivalAt: 2_800,
    journeyArrivalAt: 2_800,
  };
  const first = activeJourneyFromItinerary(twoLeg, destination, 1_000_000);
  expect(first).toMatchObject({ transferLeg: 1 });
  expect(first.transferPlan.first.tripRef).toBe("first");

  const second = advanceItineraryAfterRide(
    first,
    {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(second).toMatchObject({
    activeLegIndex: 1,
    transferLeg: 2,
    tripRef: "second",
  });
  expect(itineraryHasFutureLeg(second)).toBe(false);
});

test("immediate future-leg failures enter recovery while invalid or duplicate evidence is inert", () => {
  const journey = activeJourneyFromItinerary(option(), destination, 1_000_000);
  const cancelledState = {
    providerState: "cancelled",
    decision: "cancelled",
    departureAt: 2_400,
    feasibility: null,
    missingSinceMs: null,
  };

  expect(applyFutureLegRevalidation(null, 1, cancelledState)).toBeNull();
  expect(applyFutureLegRevalidation(journey, 0, cancelledState)).toBe(journey);
  expect(applyFutureLegRevalidation(journey, 9, cancelledState)).toBe(journey);
  expect(applyFutureLegRevalidation(journey, 1, null)).toBe(journey);

  const cancelled = applyFutureLegRevalidation(journey, 1, cancelledState);
  expect(cancelled).toMatchObject({
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  });
  expect(
    applyFutureLegRevalidation(cancelled, 1, cancelled.futureLegRevalidations[1])
  ).toBe(cancelled);

  const missed = applyFutureLegRevalidation(
    activeJourneyFromItinerary(option(), destination, 1_000_000),
    1,
    { ...cancelledState, providerState: "live", decision: "missed" }
  );
  expect(missed.recoveryReason).toBe("transfer-missed");

  const unsafe = applyFutureLegRevalidation(
    activeJourneyFromItinerary(option(), destination, 1_000_000),
    1,
    { ...cancelledState, providerState: "live", decision: "unsafe" }
  );
  expect(unsafe.recoveryReason).toBe("transfer-risk");
});

test("recovery never skips the current leg and only projects after authoritative NOW", () => {
  const base = activeJourneyFromItinerary(option(), destination, 1_000_000);
  const failed = applyFutureLegRevalidation(base, 1, {
    providerState: "cancelled",
    decision: "cancelled",
    departureAt: 2_400,
    feasibility: null,
    missingSinceMs: null,
  });

  const stillCurrent = recoverItineraryAfterRide(
    failed,
    {
      tripRef: "first",
      stage: "next",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(stillCurrent).toMatchObject({
    activeLegIndex: 0,
    tripRef: "first",
    phase: "recovery",
  });

  const projected = recoverItineraryAfterRide(
    failed,
    {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    },
    1_950_000
  );
  expect(projected).toMatchObject({
    activeLegIndex: 1,
    tripRef: "second",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  });

  const finalLeg = {
    ...base,
    activeLegIndex: 2,
  };
  expect(recoverItineraryAfterRide(finalLeg, null, 2_000_000)).toBeNull();
});
