import { describe, expect, it } from "vitest";
import { distanceInMeters } from "./geo";
import { prepareRideShape } from "./rideGeometry";
import { MISS_FIX_ACCURACY_M, rideGpsFromFix, routeGapM } from "./rideGpsFix";
import { RIDE_STAGE } from "./rideProgress";
import { emptyGps } from "./rideSession";

const NOW = 1_700_000_000_000;
const LAT = 60.45;

// A straight east-west route, one point every 0.001° of longitude (about
// 55 m here), with GTFS distances in real metres so map matching is allowed.
const routePoints = Array.from({ length: 41 }, (_, index) => ({
  lat: LAT,
  lon: 22.25 + index * 0.001,
}));
const shape = prepareRideShape(
  routePoints.map((point) => ({
    ...point,
    traveled: distanceInMeters(routePoints[0], point),
  }))
);
const alongAt = (lon) => distanceInMeters(routePoints[0], { lat: LAT, lon });

const boardingStop = { id: "10", shapeDistTraveled: 0 };
const previousStop = { id: "20", shapeDistTraveled: Math.round(alongAt(22.27)) };
const targetStop = {
  id: "30",
  lat: LAT,
  lon: 22.28,
  shapeDistTraveled: Math.round(alongAt(22.28)),
};

const session = {
  id: "ride-1",
  targetStop,
  plan: { boardingStop, previousStop, targetStop },
  stage: RIDE_STAGE.BOARDED,
};

function fix(lon, { accuracy = 10, speed = 8, lat = LAT } = {}) {
  return { coords: { latitude: lat, longitude: lon, accuracy, speed } };
}

function reading(overrides = {}) {
  return {
    position: fix(22.26),
    session,
    stage: RIDE_STAGE.BOARDED,
    previous: emptyGps(),
    shape: null,
    nowMs: NOW,
    ...overrides,
  };
}

describe("routeGapM", () => {
  const plan = { targetStop: { shapeDistTraveled: 1000 } };

  it("measures along the route from a stop to the exit", () => {
    expect(routeGapM(plan, { shapeDistTraveled: 400 })).toBe(600);
  });

  it("has no gap without both distances, or for a stop not before the exit", () => {
    expect(routeGapM(plan, { shapeDistTraveled: null })).toBeNull();
    expect(routeGapM(plan, {})).toBeNull();
    expect(routeGapM(plan, null)).toBeNull();
    expect(routeGapM({ targetStop: { shapeDistTraveled: null } }, { shapeDistTraveled: 0 })).toBeNull();
    expect(routeGapM(plan, { shapeDistTraveled: 1000 })).toBeNull();
  });
});

describe("rideGpsFromFix", () => {
  it("changes nothing for a fix without a position", () => {
    expect(rideGpsFromFix(reading({ position: { coords: {} } }))).toBeNull();
    expect(rideGpsFromFix(reading({ position: null }))).toBeNull();
  });

  it("reads straight-line distance, accuracy and speed from the fix", () => {
    const next = rideGpsFromFix(reading());
    expect(next).toMatchObject({
      status: "active",
      accuracyM: 10,
      speedMps: 8,
      shapeStatus: "idle",
      shapeUsable: false,
      updatedAt: NOW,
      error: "",
    });
    expect(next.distanceM).toBeCloseTo(
      distanceInMeters({ lat: LAT, lon: 22.26 }, targetStop),
      6
    );
  });

  it("never turns a speed the browser does not have into standing still", () => {
    expect(
      rideGpsFromFix(reading({ position: fix(22.26, { speed: null }) })).speedMps
    ).toBeNull();
  });

  it("calls a vague fix weak", () => {
    expect(
      rideGpsFromFix(reading({ position: fix(22.26, { accuracy: 121 }) })).status
    ).toBe("weak");
  });

  it("tracks the approach only once the ride is near its end", () => {
    const early = rideGpsFromFix(reading({ position: fix(22.28) }));
    expect(early).toMatchObject({ minimumDistanceM: null, wasNearTarget: false });

    const near = rideGpsFromFix(
      reading({ position: fix(22.28), stage: RIDE_STAGE.NEXT })
    );
    expect(near.minimumDistanceM).toBeCloseTo(0, 6);
    expect(near.wasNearTarget).toBe(true);
  });

  it("moves the near-then-away latch only on a precise fix", () => {
    const near = rideGpsFromFix(
      reading({ position: fix(22.28), stage: RIDE_STAGE.NEXT })
    );
    const vague = rideGpsFromFix(
      reading({
        position: fix(22.29, { accuracy: MISS_FIX_ACCURACY_M + 1 }),
        stage: RIDE_STAGE.NEXT,
        previous: near,
      })
    );
    expect(vague).toMatchObject({ movedAwayAfterNear: false });
    expect(vague.minimumDistanceM).toBe(near.minimumDistanceM);

    const away = rideGpsFromFix(
      reading({
        position: fix(22.29),
        stage: RIDE_STAGE.NEXT,
        previous: near,
      })
    );
    expect(away.movedAwayAfterNear).toBe(true);
  });

  it("places an on-route fix along the trip's shape", () => {
    const next = rideGpsFromFix(reading({ shape, position: fix(22.26) }));
    expect(next).toMatchObject({
      shapeStatus: "ready",
      shapeUsable: true,
      onRoute: true,
      alongRouteUpdatedAt: NOW,
      passedTarget: false,
    });
    expect(next.alongRouteM).toBeCloseTo(alongAt(22.26), 0);
    expect(next.routeDistanceM).toBeCloseTo(
      targetStop.shapeDistTraveled - alongAt(22.26),
      0
    );
    expect(next.routeEtaSec).toBeGreaterThan(0);
  });

  it("keeps the last route anchor through a fix far off the route", () => {
    const onRoute = rideGpsFromFix(reading({ shape, position: fix(22.26) }));
    const offRoute = rideGpsFromFix(
      reading({
        shape,
        position: fix(22.262, { lat: LAT + 0.01 }),
        previous: onRoute,
        nowMs: NOW + 5_000,
      })
    );
    expect(offRoute.onRoute).toBe(false);
    expect(offRoute.alongRouteM).toBe(onRoute.alongRouteM);
    expect(offRoute.alongRouteUpdatedAt).toBe(NOW);
  });

  it("counts fixes in a row past each stop, and starts again on one that is not", () => {
    // Past the boarding stop but not yet past the stop before the exit.
    const first = rideGpsFromFix(reading({ shape, position: fix(22.26) }));
    expect(first).toMatchObject({ leftBoardingFixes: 1, leftPreviousFixes: 0 });

    const second = rideGpsFromFix(
      reading({ shape, position: fix(22.261), previous: first, nowMs: NOW + 2_000 })
    );
    expect(second.leftBoardingFixes).toBe(2);

    const standing = rideGpsFromFix(
      reading({
        shape,
        position: fix(22.261, { speed: 0 }),
        previous: second,
        nowMs: NOW + 4_000,
      })
    );
    expect(standing.leftBoardingFixes).toBe(0);

    const pastPrevious = rideGpsFromFix(
      reading({
        shape,
        position: fix(22.2715),
        previous: standing,
        nowMs: NOW + 60_000,
      })
    );
    expect(pastPrevious).toMatchObject({
      leftBoardingFixes: 1,
      leftPreviousFixes: 1,
    });
  });
});
