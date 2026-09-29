// What one location fix says about the ride. The phone is the passenger's
// own evidence of where the bus is, but a fix can be vague, thrown by a
// building, or taken while a loop route passes close to the exit long
// before serving it. Each fix is weighed against the one before, so only
// agreement over time moves the latches that raise or end the alarm.

import { distanceInMeters, hasCoordinates } from "./geo";
import { analyzeRideGps } from "./rideGeometry";
import { RIDE_STAGE, fixLeftStop, rideStageRank } from "./rideProgress";

/**
 * @import {
 *   RideGpsMatch,
 *   RideGpsState,
 *   RidePlan,
 *   RidePlanStop,
 *   RideSession,
 *   RideShape,
 *   RideSignals,
 *   RideStage,
 * } from "../types/ride"
 */

/**
 * The part of a browser position a fix is read from. Every field is read
 * defensively: a browser may leave any of them out.
 * @typedef {{
 *   coords?: {
 *     latitude?: number | null,
 *     longitude?: number | null,
 *     accuracy?: number | null,
 *     speed?: number | null,
 *   } | null,
 * } | null | undefined} RideFixPosition
 */

/**
 * @typedef {object} RideFixInput
 * @property {RideFixPosition} position
 * @property {RideSession} session The ride as the location watch began.
 * @property {RideStage | null | undefined} stage The ride's stage as the fix
 *   arrives, which may have moved on since the watch began.
 * @property {RideGpsState} previous The location state before this fix.
 * @property {RideShape | null} shape The trip's shape, once loaded.
 * @property {number} nowMs Epoch milliseconds of the fix.
 */

// A fix this precise is needed before straight-line distance counts towards
// "you have gone past your stop": two fixes 300 m wide ended a ride that was
// still a minute from the stop.
export const MISS_FIX_ACCURACY_M = 50;

/**
 * Number.isFinite, telling the type checker what it proved.
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return Number.isFinite(value);
}

// Metres along the trip's shape from the stop before the exit to the exit.
// How far along the route a stop of the plan lies before the exit.
/**
 * @param {RidePlan | null | undefined} plan
 * @param {RidePlanStop | null | undefined} stop
 * @returns {number | null}
 */
export function routeGapM(plan, stop) {
  const target = Number(plan?.targetStop?.shapeDistTraveled);
  const from = Number(stop?.shapeDistTraveled);
  if (
    plan?.targetStop?.shapeDistTraveled === null ||
    stop?.shapeDistTraveled === null ||
    !Number.isFinite(target) ||
    !Number.isFinite(from) ||
    target <= from
  ) {
    return null;
  }
  return target - from;
}

/**
 * The location state after one fix, or null when the fix has no usable
 * position and changes nothing.
 * @param {RideFixInput} input
 * @returns {RideGpsState | null}
 */
export function rideGpsFromFix({
  position,
  session: current,
  stage,
  previous,
  shape,
  nowMs,
}) {
  const point = {
    lat: Number(position?.coords?.latitude),
    lon: Number(position?.coords?.longitude),
  };
  const accuracy = Number(position?.coords?.accuracy);
  // Browsers report a speed they do not have as null, which Number()
  // turns into a confident 0 m/s.
  const reportedSpeed = position?.coords?.speed;
  const speed =
    reportedSpeed === null || reportedSpeed === undefined
      ? Number.NaN
      : Number(reportedSpeed);

  if (!hasCoordinates(point)) return null;

  const straightDistance = hasCoordinates(current.targetStop)
    ? distanceInMeters(point, current.targetStop)
    : null;

  // Loop and doubling-back routes drive close to the target long before
  // serving it. Arming the "gone past it" latch on that early pass would
  // let a sample taken while still approaching look like a miss, so the
  // approach is only tracked once the ride is actually near its end.
  const onApproach = rideStageRank(stage) >= rideStageRank(RIDE_STAGE.NEXT);
  // Only a precise fix moves the "near, then away" latch that ends a
  // ride as missed. The rest still show distance and time as before.
  const preciseFix =
    Number.isFinite(accuracy) && accuracy <= MISS_FIX_ACCURACY_M;
  const minimumDistance =
    onApproach && preciseFix && isFiniteNumber(straightDistance)
      ? previous.minimumDistanceM === null
        ? straightDistance
        : Math.min(previous.minimumDistanceM, straightDistance)
      : previous.minimumDistanceM;
  const wasNearTarget =
    previous.wasNearTarget === true ||
    (onApproach && isFiniteNumber(minimumDistance) && minimumDistance <= 80);
  const movedAwayAfterNear = preciseFix
    ? wasNearTarget &&
      isFiniteNumber(straightDistance) &&
      straightDistance >= 250 &&
      isFiniteNumber(minimumDistance) &&
      straightDistance > minimumDistance + 120
    : previous.movedAwayAfterNear === true;

  // Every field an analysis can carry, read as optional: an unusable or
  // ambiguous match carries only some of them.
  const shapeAnalysis = shape
    ? /** @type {Partial<RideGpsMatch>} */ (
        analyzeRideGps({
          position: point,
          accuracyM: accuracy,
          speedMps: speed,
          shape,
          boardingShapeDistM: current.plan?.boardingStop?.shapeDistTraveled,
          targetShapeDistM: current.plan?.targetStop?.shapeDistTraveled,
          previousAlongM: previous.alongRouteM,
          previousFixAtMs: previous.alongRouteUpdatedAt,
          offRouteSinceMs: previous.offRouteSinceMs,
          nowMs,
        })
      )
    : null;

  // Asked of every fix, so "in a row" means fixes, not polls.
  /** @type {RideSignals} */
  const fixSignals = {
    gpsShapeUsable: shapeAnalysis?.usable === true,
    gpsOnRoute: shapeAnalysis?.onRoute === true,
    gpsRouteDistanceM: shapeAnalysis?.routeDistanceM,
    gpsAccuracyM: accuracy,
    gpsAgeSec: 0,
    gpsSpeedMps: Number.isFinite(speed) ? speed : null,
  };
  const leftBoardingFixes = fixLeftStop(
    fixSignals,
    routeGapM(current.plan, current.plan?.boardingStop)
  )
    ? (previous.leftBoardingFixes || 0) + 1
    : 0;
  const leftPreviousFixes = fixLeftStop(
    fixSignals,
    routeGapM(current.plan, current.plan?.previousStop)
  )
    ? (previous.leftPreviousFixes || 0) + 1
    : 0;

  return {
    ...previous,
    status:
      Number.isFinite(accuracy) && accuracy > 120
        ? "weak"
        : shapeAnalysis?.offRouteSuspected
          ? "off-route"
          : "active",
    distanceM: isFiniteNumber(straightDistance) ? straightDistance : null,
    accuracyM: Number.isFinite(accuracy) ? accuracy : null,
    speedMps: Number.isFinite(speed) ? speed : null,
    minimumDistanceM: minimumDistance,
    wasNearTarget,
    movedAwayAfterNear,
    shapeStatus: shape ? "ready" : previous.shapeStatus,
    shapeUsable: shapeAnalysis?.usable === true,
    onRoute: shapeAnalysis?.onRoute === true,
    // Ambiguous or off-route projections are diagnostics, not progress.
    // Keeping one as the next continuity anchor can lock a later good fix
    // onto the wrong leg of a loop.
    alongRouteM:
      shapeAnalysis?.onRoute === true && isFiniteNumber(shapeAnalysis?.alongM)
        ? shapeAnalysis.alongM
        : previous.alongRouteM,
    alongRouteUpdatedAt:
      shapeAnalysis?.onRoute === true && isFiniteNumber(shapeAnalysis?.alongM)
        ? nowMs
        : previous.alongRouteUpdatedAt,
    lateralDistanceM: isFiniteNumber(shapeAnalysis?.lateralDistanceM)
      ? shapeAnalysis.lateralDistanceM
      : null,
    routeDistanceM: isFiniteNumber(shapeAnalysis?.routeDistanceM)
      ? shapeAnalysis.routeDistanceM
      : null,
    routeEtaSec: isFiniteNumber(shapeAnalysis?.routeEtaSec)
      ? shapeAnalysis.routeEtaSec
      : null,
    offRouteSinceMs: shapeAnalysis?.offRouteSinceMs ?? null,
    offRouteSuspected: shapeAnalysis?.offRouteSuspected === true,
    passedTarget: shapeAnalysis?.passedTarget === true,
    leftBoardingFixes,
    leftPreviousFixes,
    updatedAt: nowMs,
    error: "",
  };
}
