// The ride as it is kept between page loads. A passenger who locks the phone
// or reloads mid-ride expects the get-off alert to still be armed, so the
// session is saved on every change and read back on start. What is read back
// is only a convenience: anything stale, corrupt or implausible is dropped
// rather than trusted, and the phone's own location is never saved at all.

import { rideLongOver } from "./rideProgress";

/**
 * @import {
 *   RideArrivalIdentity,
 *   RideGpsState,
 *   RideRuntime,
 *   RideSession,
 * } from "../types/ride"
 */

export const RIDE_STORAGE_KEY = "foli-active-ride-v1";
export const RIDE_TTL_MS = 6 * 60 * 60 * 1000;

/** @returns {RideRuntime} */
export function emptyRuntime() {
  return {
    lastPollAt: null,
    lastProviderSuccessAt: null,
    lastLiveMatchAt: null,
    targetSeenAt: null,
    previousSeen: false,
    previousMissingCount: 0,
    targetMissingCount: 0,
    targetWasAtStop: false,
    targetListed: false,
    targetMatchBy: "",
    liveEtaSec: null,
    providerDistanceM: null,
    providerPositionAgeSec: null,
    scheduleEtaSec: null,
    remainingStops: null,
    etaSec: null,
    gpsAgeSec: null,
    trackingHealth: "schedule",
    lastError: "",
    notificationPermission: "unknown",
  };
}

/** @returns {RideGpsState} */
export function emptyGps() {
  return {
    status: "off",
    distanceM: null,
    accuracyM: null,
    speedMps: null,
    minimumDistanceM: null,
    wasNearTarget: false,
    movedAwayAfterNear: false,
    shapeStatus: "idle",
    shapeError: "",
    shapeUsable: false,
    onRoute: false,
    alongRouteM: null,
    alongRouteUpdatedAt: null,
    lateralDistanceM: null,
    routeDistanceM: null,
    routeEtaSec: null,
    offRouteSinceMs: null,
    offRouteSuspected: false,
    passedTarget: false,
    leftBoardingFixes: 0,
    leftPreviousFixes: 0,
    updatedAt: null,
    error: "",
  };
}

/**
 * Whether a record read back from storage is a ride still worth resuming.
 * @param {any} value Parsed from storage, so nothing about it is trusted.
 * @param {number} [now] Epoch milliseconds.
 * @returns {value is RideSession} Truthy only for a resumable ride.
 */
export function validStoredRide(value, now = Date.now()) {
  const startedAt = Number(value?.startedAt);
  const expiresAt = Number(value?.expiresAt);

  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.targetStop &&
    /^\d+$/.test(String(value.targetStop.id || "")) &&
    value.plan &&
    Number.isFinite(startedAt) &&
    startedAt > 0 &&
    startedAt <= now &&
    now - startedAt <= RIDE_TTL_MS &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    expiresAt <= startedAt + RIDE_TTL_MS &&
    !rideLongOver(value.plan, now / 1000)
  );
}

/**
 * The saved ride, or null. A record that is no longer valid is removed.
 * @returns {RideSession | null}
 */
export function readStoredRide() {
  try {
    // A missing record reads as null, and JSON.parse(null) is null.
    const parsed = JSON.parse(
      /** @type {string} */ (localStorage.getItem(RIDE_STORAGE_KEY))
    );
    if (validStoredRide(parsed)) return parsed;
    localStorage.removeItem(RIDE_STORAGE_KEY);
  } catch {
    // A corrupt convenience record must never block the departure board.
    // Left in place, it was read, and failed, on every load for good.
    try {
      localStorage.removeItem(RIDE_STORAGE_KEY);
    } catch {
      // Storage itself is unavailable; there is nothing to clean up.
    }
  }
  return null;
}

/**
 * Saves the ride, or forgets it when there is none.
 * @param {RideSession | null} session
 */
export function persistRide(session) {
  try {
    if (!session) {
      localStorage.removeItem(RIDE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(RIDE_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ride tracking continues in-memory even if storage is unavailable.
  }
}

/** @returns {string} */
export function createRideId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * What picks the passenger's journey out of a stop's live rows.
 * @param {RideSession} session
 * @returns {RideArrivalIdentity}
 */
export function rideIdentity(session) {
  return {
    datedVehicleJourneyRef: session.datedVehicleJourneyRef,
    tripRef: session.tripRef,
    vehicleRef: session.vehicleRef,
    lineRef: session.lineRef,
    originAimedDepartureTime: session.originAimedDepartureTime,
  };
}
