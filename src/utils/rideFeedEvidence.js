// What the live feed's answers are still worth. Evidence ages: an estimate
// from the exit stop counts down from when it was given, a position grows
// old, and a failed poll must never keep either looking fresh. The badge
// that says how live tracking is reads the same clock.

import { distanceInMeters, hasCoordinates } from "./geo";
import { arrivalEtaSeconds } from "./rideProgress";
import { dataAgeSeconds } from "./time";

/**
 * @import { Arrival, EpochSeconds } from "../types/foli"
 * @import { RidePlanStop, RideRuntime, RideTrackingHealth } from "../types/ride"
 */

// How long an answer from the exit stop still counts as live. Everything
// read from it, estimate and position alike, is aged by the time since.
const TARGET_LIVE_FOR_SEC = 120;
// The same window trackingHealth calls "live", so the panel's "Your bus is
// confirmed" and its badge always describe the same evidence.
export const TARGET_CONFIRMED_FOR_SEC = 45;

/**
 * A stable identity for one provider observation of a tracked journey.
 *
 * HTTP responses are not evidence that the provider data advanced. Föli can
 * legitimately return the same SIRI snapshot more than once. If each copy
 * resets targetSeenAt, an ETA such as "23 min" can stay frozen forever and a
 * stale bus can keep the UI labelled live. Only fields that describe the
 * provider observation belong in this signature; the browser receive time
 * deliberately does not.
 *
 * @param {Arrival | null | undefined} arrival
 * @returns {string}
 */
export function liveArrivalSnapshotSignature(arrival) {
  if (!arrival || typeof arrival !== "object") return "";

  return JSON.stringify([
    arrival.recordedattime ?? null,
    arrival.expectedarrivaltime ?? null,
    arrival.expecteddeparturetime ?? null,
    arrival.aimedarrivaltime ?? null,
    arrival.aimeddeparturetime ?? null,
    arrival.latitude ?? null,
    arrival.longitude ?? null,
    arrival.vehicleatstop === true,
    arrival.monitored === true,
  ]);
}

/**
 * @param {RideRuntime} runtime
 * @param {boolean} [online]
 * @returns {RideTrackingHealth}
 */
export function trackingHealth(
  runtime,
  online = globalThis.navigator?.onLine !== false
) {
  if (!online) return "schedule";

  const lastLive = Number(runtime.lastLiveMatchAt);
  if (!Number.isFinite(lastLive) || lastLive <= 0) return "schedule";

  const ageMs = Date.now() - lastLive;
  if (ageMs <= 45_000) return "live";
  if (ageMs <= 120_000) return "delayed";
  return "schedule";
}

/**
 * @param {Arrival | null | undefined} arrival
 * @param {RidePlanStop | null | undefined} targetStop
 * @returns {number | null}
 */
export function providerDistanceToTarget(arrival, targetStop) {
  if (
    !hasCoordinates(targetStop) ||
    !hasCoordinates({ lat: arrival?.latitude, lon: arrival?.longitude })
  ) {
    return null;
  }

  const distance = distanceInMeters(
    { lat: arrival?.latitude, lon: arrival?.longitude },
    targetStop
  );

  return Number.isFinite(distance) ? distance : null;
}

/**
 * What the exit stop's matched row says about the bus.
 * @param {Arrival} arrival
 * @param {EpochSeconds | null | undefined} serverTime
 * @param {RidePlanStop | null | undefined} targetStop
 */
export function readArrivalSignals(arrival, serverTime, targetStop) {
  return {
    liveEtaSec: arrivalEtaSeconds(arrival, serverTime),
    providerDistanceM: providerDistanceToTarget(arrival, targetStop),
    providerPositionAgeSec: dataAgeSeconds(arrival.recordedattime, serverTime),
  };
}

// The exit stop's row is only as current as the answer it came in.
// Its estimate counts down from then, and its position ages from then,
// or a failed poll keeps both looking fresh: a frozen "100 s" held
// back "Press STOP" past the bus's arrival, and a position from a
// loop's first pass, kept at its original age, later read as the bus
// standing at the stop. Sightings at the stop before do not count
// here; they say nothing about the exit stop's estimate.

/**
 * Seconds since the exit stop last listed the bus, or null if it never has.
 * @param {number | null | undefined} targetSeenAtMs
 * @param {number} nowMs
 * @returns {number | null}
 */
export function targetAnswerAgeSec(targetSeenAtMs, nowMs) {
  const targetSeenAt = Number(targetSeenAtMs);
  return Number.isFinite(targetSeenAt) && targetSeenAt > 0
    ? Math.max(0, (nowMs - targetSeenAt) / 1000)
    : null;
}

/**
 * The exit stop's estimate, counted down since it was given, or null once
 * that answer is no longer live.
 * @param {RideRuntime} runtime
 * @param {number | null} sinceTargetSec
 * @returns {number | null}
 */
export function agedLiveEtaSec(runtime, sinceTargetSec) {
  const targetAnswerLive =
    sinceTargetSec !== null && sinceTargetSec <= TARGET_LIVE_FOR_SEC;
  const reportedEta = Number(runtime.liveEtaSec);
  return targetAnswerLive &&
    runtime.liveEtaSec !== null &&
    Number.isFinite(reportedEta)
    ? Math.round(reportedEta - sinceTargetSec)
    : null;
}

/**
 * The bus position's age, grown by the time since the answer it came in.
 * @param {RideRuntime} runtime
 * @param {number | null} sinceTargetSec
 * @returns {number | null}
 */
export function agedProviderPositionAgeSec(runtime, sinceTargetSec) {
  const reportedPositionAge = Number(runtime.providerPositionAgeSec);
  return sinceTargetSec === null ||
    runtime.providerPositionAgeSec === null ||
    !Number.isFinite(reportedPositionAge)
    ? null
    : reportedPositionAge + sinceTargetSec;
}
