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
 * Whether a record read back from storage is a ride record inside its
 * lifetime, whatever its plan says about where the bus is by now.
 * @param {any} value Parsed from storage, so nothing about it is trusted.
 * @param {number} now Epoch milliseconds.
 * @returns {boolean}
 */
function liveStoredRecord(value, now) {
  const startedAt = Number(value?.startedAt);
  const expiresAt = Number(value?.expiresAt);

  return Boolean(
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
      expiresAt <= startedAt + RIDE_TTL_MS
  );
}

/**
 * Whether a record read back from storage is a ride still worth resuming.
 * @param {any} value Parsed from storage, so nothing about it is trusted.
 * @param {number} [now] Epoch milliseconds.
 * @returns {value is RideSession} Truthy only for a resumable ride.
 */
export function validStoredRide(value, now = Date.now()) {
  return (
    liveStoredRecord(value, now) && !rideLongOver(value.plan, now / 1000)
  );
}

/** @returns {unknown} The stored record, parsed; null when there is none. */
function parseStoredRide() {
  // A missing record reads as null, and JSON.parse(null) is null.
  return JSON.parse(
    /** @type {string} */ (localStorage.getItem(RIDE_STORAGE_KEY))
  );
}

/**
 * The saved ride, or null. A record that is corrupt or past its lifetime is
 * removed. One only long past its planned exit is left alone: the tab that
 * runs it may know the bus is very late and still coming, and removing it
 * here ended that ride there, just by opening a second tab. That tab ends
 * the ride when it is over, and the record expires with its lifetime anyway.
 * @returns {RideSession | null}
 */
export function readStoredRide() {
  try {
    const parsed = parseStoredRide();
    const now = Date.now();
    if (validStoredRide(parsed, now)) return parsed;
    if (!liveStoredRecord(parsed, now)) {
      localStorage.removeItem(RIDE_STORAGE_KEY);
    }
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
 * The id of the ride storage holds, resumable or not, or "" when it holds
 * none inside its lifetime. Removes nothing: a tab asks this to learn
 * whether its own ride is still the stored one.
 * @returns {string}
 */
export function storedRideId() {
  try {
    const parsed = /** @type {any} */ (parseStoredRide());
    return liveStoredRecord(parsed, Date.now()) ? parsed.id : "";
  } catch {
    return "";
  }
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
