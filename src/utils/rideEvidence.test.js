import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEFT_STOP_FIXES,
  locationRideProgress,
  progressRuntime,
  recentGpsSpeedMps,
  rideConfirmations,
  rideStageSignals,
  rideStageTransition,
  rideUnderway,
  secondsSince,
} from "./rideEvidence";
import { RIDE_STAGE } from "./rideProgress";
import { emptyGps, emptyRuntime } from "./rideSession";

const NOW = 1_700_000_000_000;
const targetStop = { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 };

function session(overrides = {}) {
  return {
    id: "ride-1",
    targetStop,
    plan: { stopsToTarget: [{ id: "31" }, { id: "32" }] },
    stage: RIDE_STAGE.BOARDED,
    stageReason: "tracking",
    stageConfidence: "live",
    startedAt: NOW - 60_000,
    stageChangedAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    ...overrides,
  };
}

function runtime(overrides = {}) {
  return { ...emptyRuntime(), ...overrides };
}

function gps(overrides = {}) {
  return { ...emptyGps(), ...overrides };
}

const planned = { etaSec: 300, remainingStops: 2, beforeDeparture: false };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rideConfirmations", () => {
  it("needs two answers without the bus before calling a stop passed", () => {
    const seen = { previousSeen: true, targetListed: true, targetWasAtStop: true };
    expect(
      rideConfirmations(
        runtime({ ...seen, previousMissingCount: 1, targetMissingCount: 1 }),
        gps()
      )
    ).toEqual({
      gpsMovedAway: false,
      previousPassedConfirmed: false,
      targetPassedConfirmed: false,
    });
    expect(
      rideConfirmations(
        runtime({ ...seen, previousMissingCount: 2, targetMissingCount: 2 }),
        gps({ wasNearTarget: true, movedAwayAfterNear: true })
      )
    ).toEqual({
      gpsMovedAway: true,
      previousPassedConfirmed: true,
      targetPassedConfirmed: true,
    });
  });

  it("does not call the stop before passed while the exit stop has lost the bus", () => {
    expect(
      rideConfirmations(
        runtime({ previousSeen: true, previousMissingCount: 3 }),
        gps()
      ).previousPassedConfirmed
    ).toBe(false);
  });
});

describe("ageing the phone's evidence", () => {
  it("counts seconds since a time, never below zero", () => {
    expect(secondsSince(NOW - 5_000, NOW)).toBe(5);
    expect(secondsSince(NOW + 5_000, NOW)).toBe(0);
    expect(secondsSince(undefined, NOW)).toBeNull();
    // No fix yet is no age at all, not an age counted from 1970.
    expect(secondsSince(null, NOW)).toBeNull();
    expect(secondsSince(emptyGps().updatedAt, NOW)).toBeNull();
    expect(secondsSince(0, NOW)).toBeNull();
  });

  it("trusts riding pace only from a recent fix", () => {
    expect(recentGpsSpeedMps(gps({ speedMps: 8 }), 60)).toBe(8);
    expect(recentGpsSpeedMps(gps({ speedMps: 8 }), 61)).toBeNull();
    expect(recentGpsSpeedMps(gps({ speedMps: 8 }), null)).toBeNull();
    expect(recentGpsSpeedMps(gps({ speedMps: null }), 1)).toBeNull();
  });
});

describe("rideUnderway", () => {
  it("is known once the bus left the stop before, or fixes left the boarding stop", () => {
    expect(rideUnderway(session(), false, gps())).toBe(false);
    expect(rideUnderway(session({ underway: true }), false, gps())).toBe(true);
    expect(rideUnderway(session(), true, gps())).toBe(true);
    expect(
      rideUnderway(session(), false, gps({ leftBoardingFixes: LEFT_STOP_FIXES - 1 }))
    ).toBe(false);
    expect(
      rideUnderway(session(), false, gps({ leftBoardingFixes: LEFT_STOP_FIXES }))
    ).toBe(true);
  });
});

describe("rideStageSignals", () => {
  const confirmations = {
    gpsMovedAway: false,
    previousPassedConfirmed: false,
    targetPassedConfirmed: false,
  };
  const evidence = {
    session: session(),
    planned,
    runtime: runtime(),
    gps: gps({ shapeUsable: true, onRoute: true, shapeStatus: "ready" }),
    confirmations,
    underway: false,
    liveEtaSec: null,
    providerPositionAgeSec: null,
    gpsAgeSec: 3,
    gpsSpeedMps: null,
    stageAgeSec: 60,
    restoredRideId: "",
  };

  it("ignores where the phone is on the route until the ride is underway", () => {
    expect(rideStageSignals(evidence)).toMatchObject({
      gpsShapeAvailable: true,
      gpsShapeUsable: false,
      gpsOnRoute: false,
    });
    expect(rideStageSignals({ ...evidence, underway: true })).toMatchObject({
      gpsShapeUsable: true,
      gpsOnRoute: true,
    });
  });

  it("holds the timetable back for a reloaded ride until its first poll", () => {
    expect(rideStageSignals(evidence).scheduleMayRaise).toBe(true);
    expect(
      rideStageSignals({ ...evidence, restoredRideId: "ride-1" }).scheduleMayRaise
    ).toBe(false);
    expect(
      rideStageSignals({
        ...evidence,
        restoredRideId: "ride-1",
        runtime: runtime({ lastPollAt: NOW }),
      }).scheduleMayRaise
    ).toBe(true);
    expect(
      rideStageSignals({
        ...evidence,
        planned: { ...planned, beforeDeparture: true },
      }).scheduleMayRaise
    ).toBe(false);
  });

  it("keeps the last decision's reason and confidence for a held stage", () => {
    expect(rideStageSignals(evidence)).toMatchObject({
      lastReason: "tracking",
      lastConfidence: "live",
      scheduleEtaSec: 300,
      remainingStops: 2,
    });
  });
});

describe("locationRideProgress", () => {
  const plan = {
    boardingStop: { id: "10", shapeDistTraveled: 0, offsetSec: 0 },
    targetStop: { id: "40", shapeDistTraveled: 1500, offsetSec: 900 },
    stopsToTarget: [
      { id: "20", shapeDistTraveled: 500, offsetSec: 300 },
      { id: "30", shapeDistTraveled: 1000, offsetSec: 600 },
      { id: "40", shapeDistTraveled: 1500, offsetSec: 900 },
    ],
  };

  const routeGps = (alongRouteM, overrides = {}) =>
    gps({
      shapeUsable: true,
      onRoute: true,
      accuracyM: 10,
      alongRouteM,
      ...overrides,
    });

  it("counts stops from physical route progress instead of timetable time", () => {
    expect(locationRideProgress(plan, routeGps(450), 5, true).remainingStops).toBe(3);
    // More than the safety margin past stop 20: only stops 30 and 40 remain.
    expect(locationRideProgress(plan, routeGps(650), 5, true).remainingStops).toBe(2);
    expect(locationRideProgress(plan, routeGps(1100), 5, true).remainingStops).toBe(1);
  });

  it("interpolates a stable remaining duration from position along the trip", () => {
    expect(locationRideProgress(plan, routeGps(650), 5, true).etaSec).toBe(510);
    expect(locationRideProgress(plan, routeGps(1100), 5, true).etaSec).toBe(240);
  });

  it("refuses stale, vague, off-route or pre-departure location evidence", () => {
    expect(locationRideProgress(plan, routeGps(650), 61, true)).toEqual({
      etaSec: null,
      remainingStops: null,
    });
    expect(
      locationRideProgress(plan, routeGps(650, { accuracyM: 121 }), 5, true)
    ).toEqual({ etaSec: null, remainingStops: null });
    expect(
      locationRideProgress(plan, routeGps(650, { onRoute: false }), 5, true)
    ).toEqual({ etaSec: null, remainingStops: null });
    expect(locationRideProgress(plan, routeGps(650), 5, false)).toEqual({
      etaSec: null,
      remainingStops: null,
    });
  });

  it("fails closed on non-monotonic stop geometry", () => {
    const corrupt = {
      ...plan,
      stopsToTarget: [
        { id: "20", shapeDistTraveled: 700, offsetSec: 300 },
        { id: "30", shapeDistTraveled: 600, offsetSec: 600 },
        { id: "40", shapeDistTraveled: 1500, offsetSec: 900 },
      ],
    };
    expect(locationRideProgress(corrupt, routeGps(800), 5, true)).toEqual({
      etaSec: null,
      remainingStops: null,
    });
  });
});

describe("progressRuntime", () => {
  const evidence = {
    session: session(),
    planned,
    runtime: runtime(),
    gps: gps(),
    stage: RIDE_STAGE.BOARDED,
    underway: false,
    liveEtaSec: null,
    gpsAgeSec: null,
    sinceTargetSec: null,
  };

  it("prefers fresh live ETA, then route progress, then the timetable", () => {
    const progressPlan = {
      boardingStop: { id: "10", shapeDistTraveled: 0, offsetSec: 0 },
      targetStop: { id: "32", shapeDistTraveled: 1000, offsetSec: 600 },
      stopsToTarget: [
        { id: "31", shapeDistTraveled: 500, offsetSec: 300 },
        { id: "32", shapeDistTraveled: 1000, offsetSec: 600 },
      ],
    };
    const current = session({ plan: progressPlan });
    const onRoute = gps({
      shapeUsable: true,
      onRoute: true,
      accuracyM: 10,
      alongRouteM: 500,
    });

    expect(
      progressRuntime({
        ...evidence,
        session: current,
        gps: onRoute,
        underway: true,
        gpsAgeSec: 5,
        liveEtaSec: 80,
      })
    ).toMatchObject({ etaSource: "live", etaSec: 80, remainingStops: 2 });

    expect(
      progressRuntime({
        ...evidence,
        session: current,
        gps: onRoute,
        underway: true,
        gpsAgeSec: 5,
      })
    ).toMatchObject({ etaSource: "location", etaSec: 300, remainingStops: 2 });

    expect(progressRuntime({ ...evidence, session: current, gps: onRoute })).toMatchObject({
      etaSource: "schedule",
      etaSec: 300,
    });
  });

  it("starts the count of answers without the bus again as the alarm begins", () => {
    const missing = runtime({ targetMissingCount: 3 });
    expect(
      progressRuntime({ ...evidence, runtime: missing, stage: RIDE_STAGE.NOW })
        .targetMissingCount
    ).toBe(0);
    expect(
      progressRuntime({
        ...evidence,
        runtime: missing,
        session: session({ stage: RIDE_STAGE.NOW }),
        stage: RIDE_STAGE.NOW,
      }).targetMissingCount
    ).toBe(3);
  });

  it("counts every stop as ahead before the bus is due to leave", () => {
    expect(
      progressRuntime({
        ...evidence,
        planned: { etaSec: 900, remainingStops: null, beforeDeparture: true },
      }).remainingStops
    ).toBe(2);
    expect(
      progressRuntime({
        ...evidence,
        planned: { etaSec: 900, remainingStops: null, beforeDeparture: false },
      }).remainingStops
    ).toBeNull();
  });

  it("calls the bus confirmed only on a recent live exit-stop answer", () => {
    const live = runtime({ lastLiveMatchAt: NOW, targetListed: true });
    expect(
      progressRuntime({ ...evidence, runtime: live, sinceTargetSec: 45 })
    ).toMatchObject({ targetLive: true, trackingHealth: "live", gpsAgeSec: null });
    expect(
      progressRuntime({ ...evidence, runtime: live, sinceTargetSec: 46 }).targetLive
    ).toBe(false);
    expect(
      progressRuntime({
        ...evidence,
        runtime: { ...live, targetListed: false },
        sinceTargetSec: 1,
      }).targetLive
    ).toBe(false);
  });
});

describe("rideStageTransition", () => {
  const held = { stage: RIDE_STAGE.BOARDED, reason: "tracking", confidence: "live" };

  it("changes nothing when nothing new is known", () => {
    expect(rideStageTransition(session(), held, false, false, gps(), NOW)).toBeNull();
  });

  it("stamps a new stage and announces it", () => {
    const transition = rideStageTransition(
      session(),
      { stage: RIDE_STAGE.SOON, reason: "live-eta", confidence: "live" },
      false,
      false,
      gps(),
      NOW
    );
    expect(transition).toEqual({
      nextSession: {
        ...session(),
        underway: false,
        previousLeft: false,
        stage: RIDE_STAGE.SOON,
        stageReason: "live-eta",
        stageConfidence: "live",
        stageChangedAt: NOW,
      },
      previousLeft: false,
      announceStage: RIDE_STAGE.SOON,
    });
  });

  it("saves setting off without a sound or a new stage time", () => {
    const transition = rideStageTransition(session(), held, true, false, gps(), NOW);
    expect(transition).toEqual({
      nextSession: { ...session(), underway: true, previousLeft: false },
      previousLeft: false,
      announceStage: null,
    });
  });

  it("announces NEXT again the moment the bus leaves the stop before", () => {
    const atNext = session({ stage: RIDE_STAGE.NEXT, underway: true });
    const next = { stage: RIDE_STAGE.NEXT, reason: "gps-route-distance", confidence: "location" };
    const transition = rideStageTransition(
      atNext,
      next,
      true,
      false,
      gps({ leftPreviousFixes: LEFT_STOP_FIXES }),
      NOW
    );
    expect(transition).toMatchObject({
      previousLeft: true,
      announceStage: RIDE_STAGE.NEXT,
      nextSession: { previousLeft: true, stageChangedAt: atNext.stageChangedAt },
    });
    // Kept once known: it is not announced twice.
    expect(
      rideStageTransition(
        transition.nextSession,
        next,
        true,
        false,
        gps({ leftPreviousFixes: 0 }),
        NOW
      )
    ).toBeNull();
  });

  it("does not count fixes past the stop before until the ride is underway", () => {
    expect(
      rideStageTransition(
        session(),
        held,
        false,
        false,
        gps({ leftPreviousFixes: LEFT_STOP_FIXES }),
        NOW
      )
    ).toBeNull();
  });

  it("never announces falling back to boarded", () => {
    expect(
      rideStageTransition(
        session({ stage: RIDE_STAGE.SOON }),
        held,
        false,
        false,
        gps(),
        NOW
      ).announceStage
    ).toBeNull();
  });
});
