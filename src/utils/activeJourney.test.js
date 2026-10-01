import { describe, expect, test } from "vitest";
import {
  activeJourneyFromOption,
  activeJourneyFromTransferOption,
  arrivalMatchesActiveJourney,
  completedTransferJourney,
  confirmActiveJourneyAtStop,
  directOptionMatchesActiveJourney,
  observeActiveJourney,
  transferJourneyForRideSelection,
  recoverTransferJourneyAfterRide,
} from "./activeJourney";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

function option(overrides = {}) {
  return {
    id: "100:trip-1:1500",
    label: "fastest",
    stopId: "100",
    stopName: "Kauppatori D2",
    distanceMeters: 240,
    departure: {
      tripRef: "trip-1",
      lineRef: "18",
      destinationStopId: "900",
      departureAt: 1_500,
      aimedDepartureAt: 1_480,
      originAimedDepartureAt: 900,
      destinationArrivalAt: 2_100,
      catchability: "comfortable",
      liveState: "live",
      rideDurationSec: 600,
    },
    arrivalDeltaSec: 0,
    walkingDeltaMeters: 0,
    ...overrides,
  };
}

describe("active journey transitions", () => {
  test("creates a session-only walking state from a chosen route", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    expect(journey).toMatchObject({
      destinationId: "stop:900",
      stopId: "100",
      tripRef: "trip-1",
      lineRef: "18",
      aimedDepartureAt: 1_480,
      originAimedDepartureAt: 900,
      phase: "walking-to-stop",
      recoveryReason: null,
      atStopConfirmedAt: null,
    });
  });

  test("rejects malformed journey selections", () => {
    expect(
      activeJourneyFromOption(
        { ...option(), stopId: "not-a-stop" },
        destination,
        1_000_000
      )
    ).toBeNull();
  });

  test("matches the selected option occurrence for recovery exclusion", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    expect(directOptionMatchesActiveJourney(option(), journey)).toBe(true);
    expect(
      directOptionMatchesActiveJourney(
        option({
          departure: {
            ...option().departure,
            aimedDepartureAt: 2_000,
          },
        }),
        journey
      )
    ).toBe(false);
    expect(
      directOptionMatchesActiveJourney(
        option({ stopId: "200" }),
        journey
      )
    ).toBe(false);
  });

  test("uses trip-origin time to distinguish adjacent same-trip recovery options", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    expect(
      directOptionMatchesActiveJourney(
        option({
          departure: {
            ...option().departure,
            aimedDepartureAt: 1_485,
            originAimedDepartureAt: 1_500,
          },
        }),
        journey
      )
    ).toBe(false);

    expect(
      directOptionMatchesActiveJourney(
        option({
          departure: {
            ...option().departure,
            aimedDepartureAt: 2_000,
            originAimedDepartureAt: 905,
          },
        }),
        journey
      )
    ).toBe(false);

    expect(
      directOptionMatchesActiveJourney(
        option({
          departure: {
            ...option().departure,
            aimedDepartureAt: 1_485,
            originAimedDepartureAt: 905,
          },
        }),
        journey
      )
    ).toBe(true);
  });

  test("uses planned boarding time to distinguish repeated trip visits", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    expect(
      arrivalMatchesActiveJourney(
        {
          tripref: "trip-1",
          aimeddeparturetime: 1_485,
        },
        journey
      )
    ).toBe(true);

    expect(
      arrivalMatchesActiveJourney(
        {
          tripref: "trip-1",
          aimeddeparturetime: 2_000,
        },
        journey
      )
    ).toBe(false);
  });

  test("rejects a live row with a different trip-origin occurrence", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    expect(
      arrivalMatchesActiveJourney(
        {
          tripref: "trip-1",
          aimeddeparturetime: 1_485,
          originaimeddeparturetime: 1_500,
        },
        journey
      )
    ).toBe(false);

    expect(
      arrivalMatchesActiveJourney(
        {
          tripref: "trip-1",
          aimeddeparturetime: 1_485,
          originaimeddeparturetime: 905,
        },
        journey
      )
    ).toBe(true);
  });

  test("moves to waiting only after explicit passenger confirmation", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);
    const waiting = confirmActiveJourneyAtStop(journey, 1_010_000);

    expect(waiting).toMatchObject({
      phase: "waiting",
      atStopConfirmedAt: 1_010_000,
    });
  });

  test("updates a delayed selected trip from the existing board feed", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        monitored: true,
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_620,
      },
      referenceTimeSec: 1_400,
      receivedAtMs: 1_040_000,
      feedError: false,
      cancelled: false,
    });

    expect(updated).toMatchObject({
      departureAt: 1_620,
      phase: "walking-to-stop",
      recoveryReason: null,
      lastSeenAt: 1_040_000,
    });
  });

  test("explicit cancellation enters recovery immediately", () => {
    const journey = confirmActiveJourneyAtStop(
      activeJourneyFromOption(option(), destination, 1_000_000),
      1_010_000
    );

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_600,
      },
      referenceTimeSec: 1_500,
      receivedAtMs: 1_050_000,
      cancelled: true,
    });

    expect(updated).toMatchObject({
      phase: "recovery",
      recoveryReason: "cancelled",
    });
  });

  test("cancellation enters recovery even after the departure row disappears", () => {
    const journey = confirmActiveJourneyAtStop(
      activeJourneyFromOption(option(), destination, 1_000_000),
      1_010_000
    );

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 1_500,
      receivedAtMs: 1_050_000,
      feedError: false,
      cancelled: true,
    });

    expect(updated).toMatchObject({
      phase: "recovery",
      recoveryReason: "cancelled",
    });
  });

  test("provider failure never becomes a false departed recovery", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 2_000,
      receivedAtMs: 1_100_000,
      feedError: true,
    });

    expect(updated.phase).toBe("walking-to-stop");
    expect(updated.recoveryReason).toBeNull();
  });

  test("a pre-selection cached arrival cannot overwrite selected timing", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_300,
      },
      referenceTimeSec: 1_250,
      receivedAtMs: 990_000,
      feedError: false,
      cancelled: false,
    });

    expect(updated).toBe(journey);
    expect(updated.departureAt).toBe(1_500);
  });

  test("a stale cached arrival cannot undo recovery", () => {
    const journey = {
      ...activeJourneyFromOption(option(), destination, 1_000_000),
      phase: "recovery",
      recoveryReason: "departed",
    };

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_600,
      },
      referenceTimeSec: 1_500,
      receivedAtMs: 990_000,
      feedError: false,
      cancelled: false,
    });

    expect(updated).toBe(journey);
    expect(updated.phase).toBe("recovery");
  });

  test("a cached board from before selection cannot prove the bus departed", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 2_000,
      receivedAtMs: 990_000,
      feedError: false,
    });

    expect(updated.phase).toBe("walking-to-stop");
  });

  test("confirmed missing evidence after departure grace enters recovery", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);

    const updated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 1_700,
      receivedAtMs: 1_040_001,
      feedError: false,
    });

    expect(updated).toMatchObject({
      phase: "recovery",
      recoveryReason: "departed",
    });
  });

  test("a trip that reappears after transient recovery restores the prior phase", () => {
    const waiting = confirmActiveJourneyAtStop(
      activeJourneyFromOption(option(), destination, 1_000_000),
      1_010_000
    );
    const recovering = {
      ...waiting,
      phase: "recovery",
      recoveryReason: "departed",
    };

    const updated = observeActiveJourney(recovering, {
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_760,
      },
      referenceTimeSec: 1_600,
      receivedAtMs: 1_080_000,
      feedError: false,
      cancelled: false,
    });

    expect(updated).toMatchObject({
      phase: "waiting",
      recoveryReason: null,
      departureAt: 1_760,
    });
  });
});


test("carries external-place door arrival into the selected journey", () => {
  const externalDestination = {
    id: "external:nominatim:node:123",
    kind: "external-place",
    label: "Prisma Itäharju",
    primaryStopId: "900",
    acceptableStopIds: ["900"],
    lat: 60.45,
    lon: 22.30,
    finalWalkDistanceByStop: { "900": 240 },
    source: "osm-nominatim",
  };

  const externalOption = option({
    departure: {
      ...option().departure,
      destinationArrivalAt: 2_100,
      journeyArrivalAt: 2_350,
      finalWalkDistanceM: 240,
      finalWalkSecEstimate: 250,
    },
  });

  const journey = activeJourneyFromOption(
    externalOption,
    externalDestination,
    1_000_000
  );

  expect(journey).toMatchObject({
    destinationKind: "external-place",
    destinationArrivalAt: 2_100,
    journeyArrivalAt: 2_350,
    finalWalkDistanceM: 240,
    finalWalkSecEstimate: 250,
  });
});

test("shifts stop and door arrival with a boarding delay", () => {
  const externalDestination = {
    id: "external:nominatim:node:123",
    kind: "external-place",
    label: "Prisma Itäharju",
    primaryStopId: "900",
    acceptableStopIds: ["900"],
  };

  const journey = activeJourneyFromOption(
    option({
      departure: {
        ...option().departure,
        destinationArrivalAt: 2_100,
        journeyArrivalAt: 2_350,
        finalWalkDistanceM: 240,
        finalWalkSecEstimate: 250,
      },
    }),
    externalDestination,
    1_000_000
  );

  const updated = observeActiveJourney(journey, {
    stopId: "100",
    arrival: {
      tripref: "trip-1",
      lineref: "18",
      aimeddeparturetime: 1_480,
      originaimeddeparturetime: 900,
      expecteddeparturetime: 1_620,
    },
    referenceTimeSec: 1_400,
    receivedAtMs: 1_040_000,
    feedError: false,
    cancelled: false,
  });

  // Boarding moved +120 s, so both downstream estimates move +120 s.
  expect(updated).toMatchObject({
    departureAt: 1_620,
    destinationArrivalAt: 2_220,
    journeyArrivalAt: 2_470,
  });
});


function transferOption(overrides = {}) {
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
      departureAt: 1_500,
      arrivalAt: 2_100,
      aimedDepartureAt: 1_480,
      originAimedDepartureAt: 900,
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
        incomingArrivalAt: 2_100,
        outgoingDepartureAt: 2_700,
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
      departureAt: 2_700,
      arrivalAt: 3_600,
      aimedDepartureAt: 2_700,
      originAimedDepartureAt: 2_400,
      liveState: "schedule",
    },
    destinationStopId: "900",
    destinationArrivalAt: 3_600,
    finalWalkDistanceM: null,
    finalWalkSecEstimate: null,
    journeyArrivalAt: 3_600,
    totalWalkingDistanceM: 150,
    reliability: "medium",
    ...overrides,
  };
}

describe("active transfer journey commitment", () => {
  test("locks both concrete legs while exposing leg 1 to existing monitoring", () => {
    const journey = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    expect(journey).toMatchObject({
      optionLabel: "transfer",
      stopId: "100",
      tripRef: "first",
      lineRef: "1",
      destinationStopId: "500",
      destinationStopSequence: 8,
      transferLeg: 1,
      phase: "walking-to-stop",
      transferPlan: {
        first: { tripRef: "first" },
        second: { tripRef: "second" },
      },
    });
  });

  test("preserves a transfer plan only for the exact selected Ride Mode target occurrence", () => {
    const journey = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    expect(
      transferJourneyForRideSelection(journey, {
        tripRef: "first",
        targetStop: { id: "500", stopSequence: 8 },
      })
    ).toBe(journey);

    expect(
      transferJourneyForRideSelection(journey, {
        tripRef: "first",
        targetStop: { id: "500", stopSequence: 18 },
      })
    ).toBeNull();

    expect(
      transferJourneyForRideSelection(journey, {
        tripRef: "another",
        targetStop: { id: "500", stopSequence: 8 },
      })
    ).toBeNull();
  });

  test("advances to leg 2 only after Ride Mode reaches NOW at the selected transfer occurrence", () => {
    const journey = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    expect(
      completedTransferJourney(
        journey,
        {
          tripRef: "first",
          stage: "next",
          targetStop: { id: "500", stopSequence: 8 },
        },
        2_150_000
      )
    ).toBeNull();

    const next = completedTransferJourney(
      journey,
      {
        tripRef: "first",
        stage: "now",
        targetStop: { id: "500", stopSequence: 8 },
      },
      2_150_000
    );

    expect(next).toMatchObject({
      stopId: "501",
      tripRef: "second",
      lineRef: "7",
      destinationStopId: "900",
      destinationStopSequence: 14,
      transferLeg: 2,
      phase: "walking-to-stop",
      recoveryReason: null,
      distanceMeters: 70,
    });
  });

  test("enters transfer recovery instead of pretending a missed second leg is catchable", () => {
    const journey = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    const next = completedTransferJourney(
      journey,
      {
        tripRef: "first",
        stage: "now",
        targetStop: { id: "500", stopSequence: 8 },
      },
      2_800_000
    );

    expect(next).toMatchObject({
      transferLeg: 2,
      tripRef: "second",
      phase: "recovery",
      recoveryReason: "transfer-missed",
    });
  });
});


describe("transfer Ride Mode fail-closed recovery", () => {
  test("ending leg 1 before the authoritative transfer stop does not advance to leg 2", () => {
    const pending = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    const recovered = recoverTransferJourneyAfterRide(
      pending,
      {
        tripRef: "first",
        stage: "next",
        targetStop: { id: "500", stopSequence: 8 },
      },
      2_200_000
    );

    expect(recovered).toMatchObject({
      transferLeg: 1,
      tripRef: "first",
      phase: "recovery",
      recoveryReason: "transfer-risk",
    });
  });

  test("marks the transfer missed when Ride Mode ends after the second departure", () => {
    const pending = activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    );

    const recovered = recoverTransferJourneyAfterRide(
      pending,
      { tripRef: "first", stage: "missed" },
      2_800_000
    );

    expect(recovered).toMatchObject({
      phase: "recovery",
      recoveryReason: "transfer-missed",
    });
  });
});


describe("active journey idempotence and fail-closed edge branches", () => {
  test("confirmation ignores null, recovery and invalid timestamps", () => {
    expect(confirmActiveJourneyAtStop(null, 1_000)).toBeNull();

    const base = activeJourneyFromOption(option(), destination, 1_000_000);
    const recovery = { ...base, phase: "recovery", recoveryReason: "departed" };
    expect(confirmActiveJourneyAtStop(recovery, 1_010_000)).toBe(recovery);
    expect(confirmActiveJourneyAtStop(base, Number.NaN)).toBe(base);
    expect(confirmActiveJourneyAtStop(base, 0)).toBe(base);
  });

  test("observation for another stop is ignored", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);
    expect(
      observeActiveJourney(journey, {
        stopId: "other",
        arrival: null,
        referenceTimeSec: 2_000,
        receivedAtMs: 1_100_000,
      })
    ).toBe(journey);
  });

  test("repeated cancellation observation is idempotent", () => {
    const journey = activeJourneyFromOption(option(), destination, 1_000_000);
    const cancelled = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 1_500,
      receivedAtMs: 1_050_000,
      cancelled: true,
    });

    const repeated = observeActiveJourney(cancelled, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 1_500,
      receivedAtMs: 1_050_000,
      cancelled: true,
    });

    expect(repeated).toBe(cancelled);
  });

  test("identical fresh arrival observation is idempotent", () => {
    const journey = {
      ...activeJourneyFromOption(option(), destination, 1_000_000),
      lastSeenAt: 1_040_000,
    };
    const arrival = {
      tripref: "trip-1",
      lineref: "18",
      aimeddeparturetime: 1_480,
      expecteddeparturetime: 1_500,
    };

    const repeated = observeActiveJourney(journey, {
      stopId: "100",
      arrival,
      referenceTimeSec: 1_400,
      receivedAtMs: 1_040_000,
      feedError: false,
      cancelled: false,
    });

    expect(repeated).toBe(journey);
  });

  test("repeated departed recovery is idempotent", () => {
    const journey = {
      ...activeJourneyFromOption(option(), destination, 1_000_000),
      phase: "recovery",
      recoveryReason: "departed",
    };

    const repeated = observeActiveJourney(journey, {
      stopId: "100",
      arrival: null,
      referenceTimeSec: 1_700,
      receivedAtMs: 1_040_001,
      feedError: false,
    });

    expect(repeated).toBe(journey);
  });

  test("missing planned times still allow exact trip identity matching", () => {
    const journey = {
      ...activeJourneyFromOption(option(), destination, 1_000_000),
      aimedDepartureAt: null,
    };
    expect(
      arrivalMatchesActiveJourney(
        { tripref: "trip-1", aimeddeparturetime: null },
        journey
      )
    ).toBe(true);
  });
});


test("live transfer recovery cannot be undone by Ride Mode completion", () => {
  const pending = {
    ...activeJourneyFromTransferOption(
      transferOption(),
      destination,
      1_000_000
    ),
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  };

  expect(
    completedTransferJourney(
      pending,
      {
        tripRef: "first",
        stage: "now",
        targetStop: { id: "500", stopSequence: 8 },
      },
      2_150_000
    )
  ).toBeNull();

  const recovered = recoverTransferJourneyAfterRide(
    pending,
    {
      tripRef: "first",
      stage: "now",
      targetStop: { id: "500", stopSequence: 8 },
    },
    2_150_000
  );

  expect(recovered).toMatchObject({
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
  });
});
