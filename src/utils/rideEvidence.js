// Everything the live feed and the phone have said about the ride, made
// ready for the stage logic and the panel. The panel reads the same aged
// evidence as the stage logic, so what the passenger sees never disagrees
// with what the alarm decides. The live feed's own answers are aged in
// rideFeedEvidence.js before they reach here.

import { RIDE_STAGE } from "./rideProgress";
import { TARGET_CONFIRMED_FOR_SEC, trackingHealth } from "./rideFeedEvidence";

/**
 * @import {
 *   RideGpsState,
 *   RidePlannedProgress,
 *   RideRuntime,
 *   RideSession,
 *   RideSignals,
 *   RideStage,
 *   RideStageDecision,
 * } from "../types/ride"
 */

/**
 * What the stage logic makes of the runtime's latches.
 * @typedef {object} RideConfirmations
 * @property {boolean} gpsMovedAway
 * @property {boolean} previousPassedConfirmed
 * @property {boolean} targetPassedConfirmed
 */

/**
 * What changes on the saved ride after progress is weighed.
 * @typedef {object} RideStageTransition
 * @property {RideSession} nextSession
 * @property {boolean} previousLeft
 * @property {RideStage | null} announceStage The stage to announce, if any.
 */

// Fixes in a row that must agree the phone has left a stop. One can be
// thrown by a building; two a second or so apart rarely are. On a one-stop
// ride both stops are the boarding stop, so setting off and "Press STOP now"
// come together, as one alert.
export const LEFT_STOP_FIXES = 2;

/**
 * @param {RideRuntime} runtime
 * @param {RideGpsState} gps
 * @returns {RideConfirmations}
 */
export function rideConfirmations(runtime, gps) {
  const gpsMovedAway =
    gps.wasNearTarget === true && gps.movedAwayAfterNear === true;

  const previousPassedConfirmed =
    runtime.previousSeen === true &&
    runtime.previousMissingCount >= 2 &&
    runtime.targetListed === true;

  const targetPassedConfirmed =
    runtime.targetWasAtStop === true && runtime.targetMissingCount >= 2;

  return { gpsMovedAway, previousPassedConfirmed, targetPassedConfirmed };
}

/**
 * Seconds from an epoch-millisecond time to now, never negative; null when
 * there is no time to count from.
 * @param {number | null | undefined} atMs
 * @param {number} nowMs
 * @returns {number | null}
 */
export function secondsSince(atMs, nowMs) {
  // Before the first fix there is no time at all, and Number(null) is 0:
  // counted from 1970, the panel told a passenger whose location was never
  // found that it was "last seen 29845074 min ago".
  if (atMs === null || atMs === undefined) return null;
  const at = Number(atMs);
  return Number.isFinite(at) && at > 0
    ? Math.max(0, (nowMs - at) / 1000)
    : null;
}

/**
 * @param {RideGpsState} gps
 * @param {number | null} gpsAgeSec
 * @returns {number | null}
 */
export function recentGpsSpeedMps(gps, gpsAgeSec) {
  // Riding pace, from a fix recent enough to still describe the phone.
  const gpsSpeed = Number(gps.speedMps);
  return gps.speedMps !== null &&
    Number.isFinite(gpsSpeed) &&
    gpsAgeSec !== null &&
    gpsAgeSec <= 60
    ? gpsSpeed
    : null;
}

/**
 * @param {RideSession} session
 * @param {boolean} previousPassedConfirmed
 * @param {RideGpsState} gps
 * @returns {boolean}
 */
export function rideUnderway(session, previousPassedConfirmed, gps) {
  // Until the phone has ridden away from the boarding stop, where it is
  // says nothing about the bus: someone waiting there for a one-stop
  // ride is already "400 m from the exit", and was told to press STOP
  // twenty minutes before the bus came. Kept once known.
  return (
    session.underway === true ||
    previousPassedConfirmed ||
    gps.leftBoardingFixes >= LEFT_STOP_FIXES
  );
}

/**
 * @typedef {object} RideStageEvidence
 * @property {RideSession} session
 * @property {RidePlannedProgress} planned
 * @property {RideRuntime} runtime
 * @property {RideGpsState} gps
 * @property {RideConfirmations} confirmations
 * @property {boolean} underway
 * @property {number | null} liveEtaSec
 * @property {number | null} providerPositionAgeSec
 * @property {number | null} gpsAgeSec
 * @property {number | null} gpsSpeedMps
 * @property {number | null} stageAgeSec
 * @property {string} restoredRideId The ride this page read back from
 *   storage, or "".
 */

/**
 * The signals evaluateRideStage() weighs, from aged evidence.
 * @param {RideStageEvidence} evidence
 * @returns {RideSignals}
 */
export function rideStageSignals({
  session: current,
  planned,
  runtime: nextRuntime,
  gps: nextGps,
  confirmations,
  underway,
  liveEtaSec,
  providerPositionAgeSec,
  gpsAgeSec,
  gpsSpeedMps,
  stageAgeSec,
  restoredRideId,
}) {
  return {
    liveEtaSec,
    scheduleEtaSec: planned.etaSec,
    remainingStops: planned.remainingStops,
    providerDistanceM: nextRuntime.providerDistanceM,
    providerPositionAgeSec,
    gpsDistanceM: nextGps.distanceM,
    gpsAccuracyM: nextGps.accuracyM,
    gpsAgeSec,
    gpsShapeAvailable: nextGps.shapeStatus === "ready",
    gpsShapeUsable: underway && nextGps.shapeUsable,
    gpsOnRoute: underway && nextGps.onRoute,
    gpsRouteDistanceM: nextGps.routeDistanceM,
    gpsRouteEtaSec: nextGps.routeEtaSec,
    // 200 m past the exit is not somewhere a passenger waits for the bus.
    gpsPassedTarget: nextGps.passedTarget,
    gpsSpeedMps,
    stageAgeSec,
    previousPassedConfirmed: confirmations.previousPassedConfirmed,
    targetAtStop: nextRuntime.targetWasAtStop && nextRuntime.targetListed,
    targetPassedConfirmed: confirmations.targetPassedConfirmed,
    gpsMovedAwayAfterNear: confirmations.gpsMovedAway,
    // A reloaded ride waits for its first poll to answer, or fail. And
    // the timetable says nothing about a bus that is not due to have
    // left the boarding stop yet.
    scheduleMayRaise:
      !planned.beforeDeparture &&
      (current.id !== restoredRideId || nextRuntime.lastPollAt !== null),
    lastReason: current.stageReason,
    lastConfidence: current.stageConfidence,
  };
}

/**
 * @typedef {object} RidePanelEvidence
 * @property {RideSession} session
 * @property {RidePlannedProgress} planned
 * @property {RideRuntime} runtime
 * @property {RideGpsState} gps
 * @property {RideStage} stage The stage just decided.
 * @property {boolean} underway
 * @property {number | null} liveEtaSec
 * @property {number | null} gpsAgeSec
 * @property {number | null} sinceTargetSec
 */

/**
 * The runtime the panel shows, read from the same evidence as the stage.
 * @param {RidePanelEvidence} evidence
 * @returns {RideRuntime}
 */
export function progressRuntime({
  session: current,
  planned,
  runtime: nextRuntime,
  gps: nextGps,
  stage,
  underway,
  liveEtaSec,
  gpsAgeSec,
  sinceTargetSec,
}) {
  const health = trackingHealth(nextRuntime);
  // The panel must not read a different source than the stage logic. A
  // frozen prediction from a failed poll, or a fix from before a tunnel,
  // would otherwise keep showing a confident "~2 min" next to a badge
  // that already says tracking is degraded.
  const gpsEtaUsable =
    underway &&
    nextGps.routeEtaSec !== null &&
    Number.isFinite(Number(nextGps.routeEtaSec)) &&
    (gpsAgeSec === null || gpsAgeSec <= 60);
  const etaSource = gpsEtaUsable
    ? "location"
    : liveEtaSec !== null
      ? "live"
      : "schedule";
  // Answers without the bus only count towards ending the alarm once it
  // is sounding, so the count starts again as it begins.
  const enteringNow =
    stage === RIDE_STAGE.NOW && current.stage !== RIDE_STAGE.NOW;
  return {
    ...nextRuntime,
    targetMissingCount: enteringNow ? 0 : nextRuntime.targetMissingCount,
    scheduleEtaSec: planned.etaSec,
    // What the panel shows. Before the bus leaves, every stop of the
    // plan is still ahead: the stage logic may not count them yet, but
    // the passenger may, and "Remaining: tracking" answered nothing.
    remainingStops:
      planned.remainingStops ??
      (planned.beforeDeparture && Array.isArray(current.plan?.stopsToTarget)
        ? current.plan.stopsToTarget.length
        : null),
    // Published so the panel can age out a fix on exactly the same clock
    // the stage logic uses, instead of presenting a tunnel-old distance
    // as where the passenger is now.
    gpsAgeSec,
    etaSec:
      etaSource === "location"
        ? Number(nextGps.routeEtaSec)
        : etaSource === "live"
          ? liveEtaSec
          : planned.etaSec,
    etaSource,
    // The panel's "confirmed" is about the exit stop, on the same clock
    // as the estimate it sits beside, and never beside a badge that has
    // gone back to the timetable (an offline phone does at once).
    targetLive:
      health === "live" &&
      sinceTargetSec !== null &&
      sinceTargetSec <= TARGET_CONFIRMED_FOR_SEC &&
      nextRuntime.targetListed === true,
    trackingHealth: health,
  };
}

/**
 * What the saved ride learns from a decision, or null when it learns
 * nothing and stays as it was.
 * @param {RideSession} current
 * @param {RideStageDecision} evaluated
 * @param {boolean} underway
 * @param {boolean} previousPassedConfirmed
 * @param {RideGpsState} nextGps
 * @param {number} nowMs Stamped on the ride if its stage changes.
 * @returns {RideStageTransition | null}
 */
export function rideStageTransition(
  current,
  evaluated,
  underway,
  previousPassedConfirmed,
  nextGps,
  nowMs
) {
  // Kept once known: "Press STOP now" is only said once the bus has left
  // the stop before the exit, and a fix lost in a tunnel afterwards does
  // not put it back there. One vague fix past it is not enough: the bus
  // could still be standing there, and the press would stop it there.
  const previousLeft =
    current.previousLeft === true ||
    previousPassedConfirmed ||
    (underway && nextGps.leftPreviousFixes >= LEFT_STOP_FIXES);
  const stageChanged = evaluated.stage !== current.stage;
  const leftPrevious = previousLeft && current.previousLeft !== true;
  const setOff = underway && current.underway !== true;

  if (!stageChanged && !leftPrevious && !setOff) return null;

  const nextSession = stageChanged
    ? {
        ...current,
        underway,
        previousLeft,
        stage: evaluated.stage,
        stageReason: evaluated.reason,
        stageConfidence: evaluated.confidence,
        stageChangedAt: nowMs,
      }
    : { ...current, underway, previousLeft };

  // "Your stop is after X" is said on reaching NEXT before the bus has
  // left X; the moment it has, "Press STOP now" is said as an alert of
  // its own.
  const announceStage = stageChanged
    ? evaluated.stage
    : leftPrevious && evaluated.stage === RIDE_STAGE.NEXT
      ? RIDE_STAGE.NEXT
      : null;

  return {
    nextSession,
    previousLeft,
    announceStage:
      announceStage === RIDE_STAGE.SOON ||
      announceStage === RIDE_STAGE.NEXT ||
      announceStage === RIDE_STAGE.NOW ||
      announceStage === RIDE_STAGE.MISSED
        ? announceStage
        : null,
  };
}
