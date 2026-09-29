import { afterEach, describe, expect, it } from "vitest";
import { resetLanguageForTests } from "../i18n";
import {
  RIDE_STAGE,
  arrivalEtaSeconds,
  buildRidePlan,
  evaluateRideStage,
  gtfsTimeToSeconds,
  matchRideArrival,
  plannedRideProgress,
  fixLeftStop,
  resolveRideBoardingIndex,
} from "./rideProgress";

describe("ride progress", () => {
  it("parses GTFS times beyond midnight", () => {
    expect(gtfsTimeToSeconds("25:02:03")).toBe(90123);
    expect(gtfsTimeToSeconds("bad")).toBeNull();
  });

  it("builds an anchored plan with GTFS shape distances", () => {
    const stopsById = new Map([
      ["10", { id: "10", name: "Board" }],
      ["20", { id: "20", name: "Before" }],
      ["30", { id: "30", name: "Target" }],
      ["40", { id: "40", name: "After" }],
    ]);
    const plan = buildRidePlan({
      stopTimes: [
        {
          stopId: "10",
          departureTime: "12:00:00",
          stopSequence: 1,
          shapeDistTraveled: 0,
        },
        {
          stopId: "20",
          departureTime: "12:04:00",
          stopSequence: 2,
          shapeDistTraveled: 900,
        },
        {
          stopId: "30",
          departureTime: "12:08:00",
          stopSequence: 3,
          shapeDistTraveled: 1800,
        },
        {
          stopId: "40",
          departureTime: "12:12:00",
          stopSequence: 4,
          shapeDistTraveled: 2700,
        },
      ],
      currentStopId: "10",
      targetStopId: "30",
      targetStopSequence: 3,
      stopsById,
      departureEpochSec: 1_000,
    });

    expect(plan.previousStop.name).toBe("Before");
    expect(plan.targetStop.predictedEpochSec).toBe(1_480);
    expect(plan.nextStop.name).toBe("After");
    expect(plan.boardingStop.shapeDistTraveled).toBe(0);
    expect(plan.targetStop.shapeDistTraveled).toBe(1800);
  });

  it("anchors boarding to departure but downstream stops to arrival", () => {
    const stopsById = new Map([
      ["10", { id: "10", name: "Board" }],
      ["20", { id: "20", name: "Target" }],
    ]);

    const plan = buildRidePlan({
      stopTimes: [
        {
          stopId: "10",
          arrivalTime: "11:58:00",
          departureTime: "12:00:00",
          stopSequence: 1,
        },
        {
          stopId: "20",
          arrivalTime: "12:08:00",
          departureTime: "12:12:00",
          stopSequence: 2,
        },
      ],
      currentStopId: "10",
      targetStopId: "20",
      targetStopSequence: 2,
      stopsById,
      departureEpochSec: 1_000,
    });

    expect(plan.boardingStop.offsetSec).toBe(0);
    expect(plan.targetStop.offsetSec).toBe(8 * 60);
    expect(plan.targetPredictedEpochSec).toBe(1_480);
  });

  // The plan's names are what the panel shows and the alerts say, so a stop
  // the catalogue does not name goes by its number in the passenger's
  // language, never by an empty name.
  describe("a stop the catalogue does not name", () => {
    afterEach(() => resetLanguageForTests("en"));

    const plan = () =>
      buildRidePlan({
        stopTimes: [
          { stopId: "10", departureTime: "12:00:00", stopSequence: 1 },
          { stopId: "30", departureTime: "12:08:00", stopSequence: 2 },
        ],
        currentStopId: "10",
        targetStopId: "30",
        targetStopSequence: 2,
        stopsById: new Map([["10", { id: "10", name: "Board" }]]),
        departureEpochSec: 1_000,
      });

    // The plan is saved with the ride. A stand-in saved in it stayed in the
    // language the ride started in, and was read out by the Finnish voice.
    it("keeps no stand-in name in the saved plan, in any language", () => {
      expect(plan().targetStop.name).toBe("");
      resetLanguageForTests("fi");
      expect(plan().targetStop.name).toBe("");
      expect(plan().boardingStop.name).toBe("Board");
    });
  });

  it("disambiguates a loop boarding stop from the SIRI aimed time", () => {
    const stopTimes = [
      { stopId: "10", departureTime: "08:00:00", stopSequence: 1 },
      { stopId: "20", departureTime: "08:10:00", stopSequence: 2 },
      { stopId: "10", departureTime: "08:30:00", stopSequence: 3 },
      { stopId: "30", departureTime: "08:40:00", stopSequence: 4 },
    ];

    const helsinkiEightThirty =
      new Date("2026-09-21T05:30:00Z").getTime() / 1000;

    expect(
      resolveRideBoardingIndex(stopTimes, "10", helsinkiEightThirty)
    ).toBe(2);
  });

  it("refuses a repeated boarding stop without safe time disambiguation", () => {
    const stopTimes = [
      { stopId: "10", departureTime: "08:00:00", stopSequence: 1 },
      { stopId: "10", departureTime: "08:30:00", stopSequence: 2 },
    ];

    expect(resolveRideBoardingIndex(stopTimes, "10", null)).toBe(-1);
  });

  it("targets the exact stop sequence when a loop revisits a stop", () => {
    const stopsById = new Map([
      ["10", { id: "10", name: "Board" }],
      ["20", { id: "20", name: "Loop stop" }],
      ["30", { id: "30", name: "Between" }],
    ]);

    const plan = buildRidePlan({
      stopTimes: [
        { stopId: "10", departureTime: "12:00:00", stopSequence: 1 },
        { stopId: "20", departureTime: "12:05:00", stopSequence: 2 },
        { stopId: "30", departureTime: "12:10:00", stopSequence: 3 },
        { stopId: "20", departureTime: "12:15:00", stopSequence: 4 },
      ],
      currentStopId: "10",
      targetStopId: "20",
      targetStopSequence: 4,
      stopsById,
      departureEpochSec: 1_000,
    });

    expect(plan.targetStop.stopSequence).toBe(4);
    expect(plan.previousStop.id).toBe("30");
  });

  it("matches the strongest available ride identity", () => {
    const rows = [
      {
        lineref: "1",
        tripref: "trip-a",
        datedvehiclejourneyref: "journey-a",
        vehicleref: "bus-a",
        originaimeddeparturetime: 1000,
      },
    ];

    expect(
      matchRideArrival(rows, {
        datedVehicleJourneyRef: "journey-a",
        tripRef: "wrong",
      })?.matchedBy
    ).toBe("dated-journey");

    expect(
      matchRideArrival(rows, {
        tripRef: "trip-a",
      })?.matchedBy
    ).toBe("trip");

    expect(
      matchRideArrival(rows, {
        lineRef: "1",
        originAimedDepartureTime: 1040,
      })?.matchedBy
    ).toBe("line-origin-time");
  });

  it("refuses a vehicle match that belongs to another run", () => {
    // The bus reached its terminus and started line 2. It is the same
    // registration at the same stop, but it is no longer our journey.
    expect(
      matchRideArrival(
        [{ lineref: "2", vehicleref: "bus-a", originaimeddeparturetime: 5000 }],
        { vehicleRef: "bus-a", lineRef: "1" }
      )
    ).toBeNull();
  });

  it("refuses a single same-line vehicle row from the wrong run", () => {
    expect(
      matchRideArrival(
        [
          {
            lineref: "1",
            vehicleref: "bus-a",
            originaimeddeparturetime: 5_000,
          },
        ],
        {
          vehicleRef: "bus-a",
          lineRef: "1",
          originAimedDepartureTime: 1_000,
        }
      )
    ).toBeNull();

    const match = matchRideArrival(
      [
        {
          lineref: "1",
          vehicleref: "bus-a",
          originaimeddeparturetime: 1_030,
        },
      ],
      {
        vehicleRef: "bus-a",
        lineRef: "1",
        originAimedDepartureTime: 1_000,
      }
    );

    expect(match?.matchedBy).toBe("vehicle-origin-time");
  });

  it("picks the run whose origin time matches when one bus is listed twice", () => {
    const ourRun = {
      lineref: "1",
      vehicleref: "bus-a",
      originaimeddeparturetime: 1030,
    };
    const returnRun = {
      lineref: "1",
      vehicleref: "bus-a",
      originaimeddeparturetime: 4000,
    };

    const match = matchRideArrival([returnRun, ourRun], {
      vehicleRef: "bus-a",
      lineRef: "1",
      originAimedDepartureTime: 1000,
    });

    expect(match?.arrival).toBe(ourRun);
    expect(match?.matchedBy).toBe("vehicle-origin-time");
  });

  it("does not let a drifted timetable outvote a fresh on-route fix", () => {
    // The bus is nine minutes down in traffic. The timetable, anchored at
    // boarding, believes the stop is here; GPS says it is 2.4 km along the
    // route. Believing the clock would send the passenger out early.
    const stage = evaluateRideStage(RIDE_STAGE.BOARDED, {
      liveEtaSec: null,
      scheduleEtaSec: 40,
      remainingStops: 1,
      gpsShapeAvailable: true,
      gpsShapeUsable: true,
      gpsOnRoute: true,
      gpsRouteDistanceM: 2_400,
      gpsRouteEtaSec: null,
      gpsAccuracyM: 15,
      gpsAgeSec: 5,
    });

    expect(stage.stage).toBe(RIDE_STAGE.BOARDED);
  });

  it("still trusts the timetable once the fix goes stale", () => {
    // Same ride, but the phone has not reported for four minutes. The fix is
    // no longer evidence about anything, so the schedule takes over again.
    const stage = evaluateRideStage(RIDE_STAGE.BOARDED, {
      liveEtaSec: null,
      scheduleEtaSec: 40,
      remainingStops: 1,
      gpsShapeAvailable: true,
      gpsShapeUsable: true,
      gpsOnRoute: true,
      gpsRouteDistanceM: 2_400,
      gpsRouteEtaSec: null,
      gpsAccuracyM: 15,
      gpsAgeSec: 240,
    });

    expect(stage.stage).toBe(RIDE_STAGE.NEXT);
    expect(stage.reason).toBe("planned-stop-count");
  });

  it("follows the visit the passenger chose when a loop lists the stop twice", () => {
    // Both laps carry the same journey reference. The first row used to win,
    // so a passenger riding to the second visit had the first lap's "bus at
    // stop" read as theirs: "Get off now" a full lap early.
    const firstLap = {
      datedvehiclejourneyref: "journey-1",
      expectedarrivaltime: 1_000,
      vehicleatstop: true,
    };
    const secondLap = {
      datedvehiclejourneyref: "journey-1",
      expectedarrivaltime: 2_200,
    };

    expect(
      matchRideArrival([firstLap, secondLap], {
        datedVehicleJourneyRef: "journey-1",
        plannedEpochSec: 2_150,
      })?.arrival
    ).toBe(secondLap);
    expect(
      matchRideArrival([firstLap, secondLap], {
        tripRef: "",
        datedVehicleJourneyRef: "journey-1",
        plannedEpochSec: 1_060,
      })?.arrival
    ).toBe(firstLap);
    expect(
      matchRideArrival(
        [
          { tripref: "trip-1", expectedarrivaltime: 1_000 },
          { tripref: "trip-1", expectedarrivaltime: 2_200 },
        ],
        { tripRef: "trip-1", plannedEpochSec: 2_150 }
      )?.arrival.expectedarrivaltime
    ).toBe(2_200);
  });

  it("does not guess between two visits the plan cannot tell apart", () => {
    const rows = [
      { datedvehiclejourneyref: "journey-1", expectedarrivaltime: 1_000 },
      { datedvehiclejourneyref: "journey-1", expectedarrivaltime: 2_200 },
    ];

    expect(
      matchRideArrival(rows, {
        datedVehicleJourneyRef: "journey-1",
        plannedEpochSec: 1_620,
      })
    ).toBeNull();
    expect(
      matchRideArrival(rows, { datedVehicleJourneyRef: "journey-1" })
    ).toBeNull();
  });

  it("still matches a journey the feed lists twice at the same time", () => {
    const row = { datedvehiclejourneyref: "journey-1", expectedarrivaltime: 1_000 };
    const duplicate = { ...row };

    expect(
      matchRideArrival([row, duplicate], { datedVehicleJourneyRef: "journey-1" })
        ?.arrival
    ).toBe(row);
  });

  it("declines a line and time match when two visits both fit", () => {
    // A loop journey serves this stop twice and both rows carry the same
    // origin time. Answering with the earlier visit would alarm a passenger
    // riding to the later one, a full lap early.
    const firstVisit = {
      lineref: "1",
      originaimeddeparturetime: 1000,
      visitnumber: 1,
    };
    const secondVisit = {
      lineref: "1",
      originaimeddeparturetime: 1000,
      visitnumber: 2,
    };

    expect(
      matchRideArrival([firstVisit, secondVisit], {
        lineRef: "1",
        originAimedDepartureTime: 1000,
      })
    ).toBeNull();
  });

  it("still answers when one departure clearly fits best", () => {
    const ours = { lineref: "1", originaimeddeparturetime: 1005 };
    const other = { lineref: "1", originaimeddeparturetime: 1080 };

    const match = matchRideArrival([other, ours], {
      lineRef: "1",
      originAimedDepartureTime: 1000,
    });

    expect(match?.arrival).toBe(ours);
    expect(match?.matchedBy).toBe("line-origin-time");
  });

  it("reads an after-midnight trip written in next-day clock time", () => {
    // "00:10" where GTFS asks for "24:10". Clamping the backwards jump to
    // zero put the target at the moment of boarding, so the schedule called
    // "your stop is next" the second the passenger sat down.
    const stopsById = new Map([
      ["10", { id: "10", name: "Board" }],
      ["20", { id: "20", name: "Target" }],
    ]);

    const plan = buildRidePlan({
      stopTimes: [
        { stopId: "10", departureTime: "23:55:00", stopSequence: 1 },
        { stopId: "20", departureTime: "00:10:00", stopSequence: 2 },
      ],
      currentStopId: "10",
      targetStopId: "20",
      targetStopSequence: 2,
      stopsById,
      departureEpochSec: 1_000_000,
    });

    expect(plan.targetStop.offsetSec).toBe(900);
    expect(plan.targetPredictedEpochSec).toBe(1_000_900);
  });

  it("refuses a stop time that makes no sense either way round", () => {
    // Twenty hours after boarding once rolled over: not a bus trip, so the
    // schedule declines instead of inventing an arrival.
    const stopsById = new Map([
      ["10", { id: "10", name: "Board" }],
      ["20", { id: "20", name: "Target" }],
    ]);

    const plan = buildRidePlan({
      stopTimes: [
        { stopId: "10", departureTime: "12:00:00", stopSequence: 1 },
        { stopId: "20", departureTime: "08:00:00", stopSequence: 2 },
      ],
      currentStopId: "10",
      targetStopId: "20",
      targetStopSequence: 2,
      stopsById,
      departureEpochSec: 1_000_000,
    });

    expect(plan.targetStop.offsetSec).toBeNull();
    expect(plan.targetPredictedEpochSec).toBeNull();
  });

  it("keeps missing evidence neutral", () => {
    const stage = evaluateRideStage(RIDE_STAGE.BOARDED, {
      liveEtaSec: null,
      scheduleEtaSec: null,
      remainingStops: null,
    });
    expect(stage.stage).toBe(RIDE_STAGE.BOARDED);
  });

  it("keeps schedule-only evidence from claiming NOW", () => {
    const next = evaluateRideStage(RIDE_STAGE.BOARDED, {
      scheduleEtaSec: 5,
      remainingStops: 1,
    });

    expect(next.stage).toBe(RIDE_STAGE.NEXT);
    expect(next.confidence).toBe("schedule");
  });

  it("requires strong evidence for NOW", () => {
    const next = evaluateRideStage(RIDE_STAGE.NEXT, {
      scheduleEtaSec: -20,
      providerDistanceM: 55,
      providerPositionAgeSec: 10,
    });

    expect(next.stage).toBe(RIDE_STAGE.NOW);
    expect(next.reason).toBe("provider-near-target");
  });

  it("uses accurate on-shape GPS route distance for NEXT and NOW", () => {
    const next = evaluateRideStage(RIDE_STAGE.BOARDED, {
      gpsShapeAvailable: true,
      gpsShapeUsable: true,
      gpsOnRoute: true,
      gpsAccuracyM: 20,
      gpsRouteDistanceM: 520,
    });

    expect(next.stage).toBe(RIDE_STAGE.NEXT);
    expect(next.reason).toBe("gps-route-distance");

    const now = evaluateRideStage(RIDE_STAGE.NEXT, {
      gpsShapeAvailable: true,
      gpsShapeUsable: true,
      gpsOnRoute: true,
      gpsAccuracyM: 18,
      gpsRouteDistanceM: 85,
    });

    expect(now.stage).toBe(RIDE_STAGE.NOW);
    expect(now.reason).toBe("gps-route-arrival");
  });

  it("does not use off-route GPS as get-off evidence", () => {
    const stage = evaluateRideStage(RIDE_STAGE.BOARDED, {
      gpsShapeAvailable: true,
      gpsShapeUsable: true,
      gpsOnRoute: false,
      gpsAccuracyM: 15,
      gpsRouteDistanceM: 70,
      scheduleEtaSec: 600,
      remainingStops: 4,
    });

    expect(stage.stage).toBe(RIDE_STAGE.BOARDED);
  });

  it("lets a live prediction override a slipped timetable", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.BOARDED, {
      liveEtaSec: 250,
      scheduleEtaSec: 60,
      remainingStops: 0,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.SOON);
    expect(evaluated.confidence).toBe("live");
  });

  it("reaches NOW when NEXT evidence and proximity arrive together", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.SOON, {
      previousPassedConfirmed: true,
      gpsShapeAvailable: false,
      gpsDistanceM: 40,
      gpsAccuracyM: 20,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.NOW);
    expect(evaluated.reason).toBe("device-near-target");
  });

  it("can declare a missed stop from NEXT using strong post-target evidence", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.NEXT, {
      gpsPassedTarget: true,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.MISSED);
    expect(evaluated.reason).toBe("gps-route-passed");
  });

  it("never rolls a stage backwards", () => {
    expect(
      evaluateRideStage(RIDE_STAGE.NEXT, {
        scheduleEtaSec: 900,
        remainingStops: 8,
      }).stage
    ).toBe(RIDE_STAGE.NEXT);
  });

  it("only marks missed after post-target evidence", () => {
    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        scheduleEtaSec: -300,
      }).stage
    ).toBe(RIDE_STAGE.NOW);

    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        gpsPassedTarget: true,
      }).stage
    ).toBe(RIDE_STAGE.MISSED);
  });

  it("treats the bus leaving as a miss only before the get-off alert fired", () => {
    // Never alerted, vehicle gone: the passenger is still aboard.
    expect(
      evaluateRideStage(RIDE_STAGE.NEXT, {
        targetPassedConfirmed: true,
      }).stage
    ).toBe(RIDE_STAGE.MISSED);
  });

  it("does not accuse a passenger who already got off of missing the stop", () => {
    // A successful alight looks exactly like this: the get-off alert fired,
    // the bus left the stop, and the phone walked away from it. Announcing
    // "get off at the next stop" here would send someone standing at their
    // own destination back onto a bus.
    const afterGettingOff = evaluateRideStage(RIDE_STAGE.NOW, {
      targetPassedConfirmed: true,
      gpsMovedAwayAfterNear: true,
    });

    expect(afterGettingOff.stage).toBe(RIDE_STAGE.NOW);
  });

  it("does not take someone walking on from their stop for a missed stop", () => {
    // Off the bus at NOW and walking on down the same street, the phone ends
    // up past the stop along the route just as a bus would, only at walking
    // pace. "Get off at the next stop" would send them back onto a bus.
    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        gpsPassedTarget: true,
        gpsSpeedMps: 1.3,
        stageAgeSec: 150,
      }).stage
    ).toBe(RIDE_STAGE.NOW);

    // No speed from the phone, and long after the alert: a bus carrying them
    // on would have been past the stop long before this.
    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        gpsPassedTarget: true,
        gpsSpeedMps: null,
        stageAgeSec: 180,
      }).stage
    ).toBe(RIDE_STAGE.NOW);
  });

  it("still catches a passenger the bus carried past the stop after the alert", () => {
    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        gpsPassedTarget: true,
        gpsSpeedMps: 8,
        stageAgeSec: 150,
      }).stage
    ).toBe(RIDE_STAGE.MISSED);

    expect(
      evaluateRideStage(RIDE_STAGE.NOW, {
        gpsPassedTarget: true,
        gpsSpeedMps: null,
        stageAgeSec: 60,
      }).stage
    ).toBe(RIDE_STAGE.MISSED);
  });

  it("computes live and planned ETA", () => {
    expect(
      arrivalEtaSeconds({ expectedarrivaltime: 1_120 }, 1_000)
    ).toBe(120);

    const plan = {
      targetPredictedEpochSec: 1_300,
      stopsToTarget: [
        { predictedEpochSec: 1_100 },
        { predictedEpochSec: 1_300 },
      ],
    };
    expect(plannedRideProgress(plan, 1_050)).toEqual({
      etaSec: 250,
      remainingStops: 2,
      beforeDeparture: false,
    });
  });

  // Set up twenty minutes early, a one-stop ride counted its one stop as
  // "next" and announced "Press STOP" before the bus had even come.
  it("counts no stops before the bus is due to leave the boarding stop", () => {
    const plan = {
      boardingStop: { predictedEpochSec: 2_200 },
      targetPredictedEpochSec: 2_290,
      stopsToTarget: [{ predictedEpochSec: 2_290 }],
    };

    expect(plannedRideProgress(plan, 1_000)).toEqual({
      etaSec: 1_290,
      remainingStops: null,
      beforeDeparture: true,
    });
    expect(plannedRideProgress(plan, 2_200).remainingStops).toBe(1);
    expect(
      evaluateRideStage(RIDE_STAGE.BOARDED, {
        ...plannedRideProgress(plan, 1_000),
        scheduleEtaSec: 1_290,
      }).stage
    ).toBe(RIDE_STAGE.BOARDED);
  });

  // "Get your things together" beside "~18 min" where the last stops are
  // far apart, and the passenger learns to ignore it.
  it("lets the timetable's stop count raise SOON only once the time is near too", () => {
    const threeStopsOut = { remainingStops: 3, scheduleEtaSec: 18 * 60 };
    expect(evaluateRideStage(RIDE_STAGE.BOARDED, threeStopsOut).stage).toBe(
      RIDE_STAGE.BOARDED
    );
    expect(
      evaluateRideStage(RIDE_STAGE.BOARDED, {
        remainingStops: 3,
        scheduleEtaSec: 6 * 60,
      }).stage
    ).toBe(RIDE_STAGE.SOON);
    expect(
      evaluateRideStage(RIDE_STAGE.BOARDED, { remainingStops: 3 }).stage
    ).toBe(RIDE_STAGE.SOON);
  });

  it("announces nothing at all before any evidence has arrived", () => {
    // Every signal is "not known yet", exactly as a ride begins. Coercing
    // those to zero would read as zero metres and zero seconds to go.
    const noEvidence = {
      liveEtaSec: null,
      scheduleEtaSec: null,
      remainingStops: null,
      providerDistanceM: null,
      providerPositionAgeSec: null,
      gpsDistanceM: null,
      gpsAccuracyM: null,
    };

    let stage = RIDE_STAGE.BOARDED;
    for (let tick = 0; tick < 3; tick += 1) {
      stage = evaluateRideStage(stage, noEvidence).stage;
    }

    expect(stage).toBe(RIDE_STAGE.BOARDED);
  });

  it("lets a live prediction override a timetable that has silently slipped", () => {
    // Bus is five minutes late: the anchored schedule says the stop is due,
    // the provider says it is still 400 seconds out. Announcing now would
    // put the passenger at the door five minutes early.
    const signals = {
      liveEtaSec: 250,
      scheduleEtaSec: 60,
      remainingStops: 0,
    };

    const evaluated = evaluateRideStage(RIDE_STAGE.BOARDED, signals);
    expect(evaluated.stage).toBe(RIDE_STAGE.SOON);
    expect(evaluated.confidence).toBe("live");
  });

  it("still uses the timetable once the provider stops answering", () => {
    const signals = {
      liveEtaSec: null,
      scheduleEtaSec: 60,
      remainingStops: 0,
    };

    const evaluated = evaluateRideStage(RIDE_STAGE.BOARDED, signals);
    expect(evaluated.stage).toBe(RIDE_STAGE.NEXT);
    expect(evaluated.confidence).toBe("schedule");
  });

  it("does not let a slipped timetable pull the ride forward to SOON either", () => {
    const signals = {
      liveEtaSec: 900,
      scheduleEtaSec: 120,
      remainingStops: 1,
    };

    expect(evaluateRideStage(RIDE_STAGE.BOARDED, signals).stage).toBe(
      RIDE_STAGE.BOARDED
    );
  });

  it("reaches NOW in the same evaluation that first proves the ride is ending", () => {
    // Arriving evidence and proximity can land in one poll; holding the
    // get-off alert back a tick is a tick at the worst possible moment.
    const evaluated = evaluateRideStage(RIDE_STAGE.SOON, {
      previousPassedConfirmed: true,
      gpsDistanceM: 40,
      gpsAccuracyM: 20,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.NOW);
    expect(evaluated.reason).toBe("device-near-target");
  });

  it("declares the stop missed from NEXT when live tracking died on approach", () => {
    // The tunnel case: the stage never reached NOW, the bus passed the stop,
    // and only the device knows. The panel must not keep saying "next".
    const evaluated = evaluateRideStage(RIDE_STAGE.NEXT, {
      gpsMovedAwayAfterNear: true,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.MISSED);
    expect(evaluated.reason).toBe("device-moved-away");
  });

  // With the trip's shape loaded, straight-line distance cannot raise NOW,
  // and a loop swinging back past the stop looks like having ridden on.
  it("takes no straight-line miss when the trip's shape says where the phone is", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.NEXT, {
      gpsMovedAwayAfterNear: true,
      gpsShapeAvailable: true,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.NEXT);
  });

  it("never declares a miss before the ride is anywhere near its end", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.SOON, {
      gpsMovedAwayAfterNear: true,
      targetPassedConfirmed: true,
    });

    expect(evaluated.stage).not.toBe(RIDE_STAGE.MISSED);
  });
});

// STOP asks for the next stop: pressed before the bus has left the stop
// before the exit, it stops the bus there. In the city centre those stops
// are 300 m apart, closer than what raises "next".
describe("whether a fix has left a stop", () => {
  const onShape = {
    gpsShapeUsable: true,
    gpsOnRoute: true,
    gpsAccuracyM: 20,
    gpsAgeSec: 5,
  };
  // The stop lies 300 m before the exit along the route.
  const left = (signals) => fixLeftStop({ ...onShape, ...signals }, 300);

  it("takes a fix on the route clearly past the stop", () => {
    expect(left({ gpsRouteDistanceM: 250 })).toBe(true);
    expect(left({ gpsRouteDistanceM: 250, gpsSpeedMps: 8 })).toBe(true);
  });

  it("does not take a fix at the stop, just past it or before it", () => {
    expect(left({ gpsRouteDistanceM: 290 })).toBe(false);
    // A bus standing at the far end of a long platform.
    expect(left({ gpsRouteDistanceM: 270 })).toBe(false);
    expect(left({ gpsRouteDistanceM: 520 })).toBe(false);
  });

  it("wants a vague fix past the stop by its own accuracy", () => {
    expect(left({ gpsRouteDistanceM: 269, gpsAccuracyM: 110 })).toBe(false);
    expect(left({ gpsRouteDistanceM: 180, gpsAccuracyM: 110 })).toBe(true);
  });

  it("does not take a phone standing or walking", () => {
    expect(left({ gpsRouteDistanceM: 200, gpsSpeedMps: 0 })).toBe(false);
    expect(left({ gpsRouteDistanceM: 200, gpsSpeedMps: 1.4 })).toBe(false);
  });

  it("does not take a near exit on its own", () => {
    expect(fixLeftStop({ liveEtaSec: 40 }, 300)).toBe(false);
    expect(fixLeftStop({ ...onShape, gpsRouteDistanceM: 100 }, null)).toBe(false);
  });

  it("does not take a fix that is vague, old or off the route", () => {
    expect(left({ gpsRouteDistanceM: 100, gpsAccuracyM: 300 })).toBe(false);
    expect(left({ gpsRouteDistanceM: 100, gpsAgeSec: 120 })).toBe(false);
    expect(left({ gpsRouteDistanceM: 100, gpsOnRoute: false })).toBe(false);
  });
});


describe("provider position freshness", () => {
  it("never treats a provider coordinate with unknown sample age as NOW evidence", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.BOARDED, {
      remainingStops: 1,
      scheduleEtaSec: 60,
      providerDistanceM: 25,
      providerPositionAgeSec: null,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.NEXT);
    expect(evaluated.reason).not.toBe("provider-near-target");
  });

  it("still accepts a genuinely fresh provider coordinate near the target", () => {
    const evaluated = evaluateRideStage(RIDE_STAGE.BOARDED, {
      remainingStops: 1,
      scheduleEtaSec: 60,
      providerDistanceM: 25,
      providerPositionAgeSec: 8,
    });

    expect(evaluated.stage).toBe(RIDE_STAGE.NOW);
    expect(evaluated.reason).toBe("provider-near-target");
  });
});
