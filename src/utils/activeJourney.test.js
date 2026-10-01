import { describe, expect, test } from "vitest";
import {
  activeJourneyFromOption,
  arrivalMatchesActiveJourney,
  confirmActiveJourneyAtStop,
  directOptionMatchesActiveJourney,
  observeActiveJourney,
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
