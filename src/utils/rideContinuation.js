/**
 * Temporary continuation state for one active Ride Mode session.
 *
 * Same-tab reload continuity always uses sessionStorage. A privacy-safe
 * public-stop/saved-place continuation is also mirrored to localStorage for
 * active-ride reopen/cross-tab continuity, bounded by the ride expiry.
 * External place labels/coordinates and final-walk data are never written to
 * durable storage.
 */

export const RIDE_CONTINUATION_STORAGE_KEY =
  "foli-active-ride-continuation-v1";

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/** @param {unknown} value */
export function normalizeRideContinuation(value) {
  const candidate = record(value);
  if (!candidate) return null;

  const transferJourney = record(candidate.transferJourney);
  const finalWalk = record(candidate.finalWalk);
  const destination = record(candidate.destination);

  if (!transferJourney && !finalWalk) return null;
  return {
    transferJourney,
    finalWalk,
    ...(destination ? { destination } : {}),
  };
}

function sessionStorageTarget() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function durableStorageTarget() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Durable continuation is allowed only when it cannot silently turn a private
 * address/POI into browser history.
 *
 * @param {ReturnType<typeof normalizeRideContinuation>} continuation
 */
export function rideContinuationCanPersistDurably(continuation) {
  if (!continuation || continuation.finalWalk) return false;

  const destinationKind = String(
    continuation.destination?.kind ||
      continuation.transferJourney?.destinationKind ||
      ""
  );
  return destinationKind === "public-stop" || destinationKind === "saved-place";
}

/**
 * @param {Storage | null} target
 * @param {string} id
 * @param {number} now
 * @param {{ durable?: boolean }} [options]
 */
function readFrom(target, id, now, { durable = false } = {}) {
  if (!target) return null;

  try {
    const parsed = JSON.parse(
      target.getItem(RIDE_CONTINUATION_STORAGE_KEY) || "null"
    );
    const stored = record(parsed);
    const expiresAt = Number(stored?.expiresAt);
    const normalized =
      stored &&
      String(stored.rideId || "") === id &&
      Number.isFinite(expiresAt) &&
      Number.isFinite(now) &&
      expiresAt > now
        ? normalizeRideContinuation(stored.continuation)
        : null;

    if (
      !normalized ||
      (durable && !rideContinuationCanPersistDurably(normalized))
    ) {
      target.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    try {
      target.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
    } catch {
      // Active ride continuity is best-effort when Web Storage is blocked.
    }
    return null;
  }
}

/**
 * @param {unknown} rideId
 * @param {number} [nowMs]
 */
export function readDurableRideContinuation(rideId, nowMs = Date.now()) {
  const id = String(rideId || "");
  if (!id) return null;

  return readFrom(durableStorageTarget(), id, Number(nowMs), {
    durable: true,
  });
}

export function readRideContinuation(rideId, nowMs = Date.now()) {
  const id = String(rideId || "");
  if (!id) return null;

  const now = Number(nowMs);
  const session = readFrom(sessionStorageTarget(), id, now);
  if (session) return session;

  return readDurableRideContinuation(id, now);
}

/**
 * @param {Storage | null} target
 * @param {string} id
 * @param {ReturnType<typeof normalizeRideContinuation>} continuation
 * @param {number} expiry
 */
function writeTo(target, id, continuation, expiry) {
  if (!target || !continuation) return;
  target.setItem(
    RIDE_CONTINUATION_STORAGE_KEY,
    JSON.stringify({
      rideId: id,
      expiresAt: expiry,
      continuation,
    })
  );
}

/**
 * @param {unknown} rideId
 * @param {unknown} continuation
 * @param {unknown} expiresAt
 */
export function persistRideContinuation(rideId, continuation, expiresAt) {
  const id = String(rideId || "");
  const normalized = normalizeRideContinuation(continuation);
  const expiry = Number(expiresAt);
  if (!id) return normalized;

  if (
    !normalized ||
    !Number.isFinite(expiry) ||
    expiry <= Date.now()
  ) {
    clearRideContinuation(id);
    return normalized;
  }

  try {
    writeTo(sessionStorageTarget(), id, normalized, expiry);
  } catch {
    // In-memory continuation still works when session storage is unavailable.
  }

  const durable = durableStorageTarget();
  try {
    if (rideContinuationCanPersistDurably(normalized)) {
      writeTo(durable, id, normalized, expiry);
    } else {
      durable?.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
    }
  } catch {
    // Durable continuity is optional; the current tab still has the state.
  }

  return normalized;
}

/**
 * @param {Storage | null} target
 * @param {string} rideId
 */
function clearFrom(target, rideId) {
  if (!target) return;

  try {
    if (!rideId) {
      target.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
      return;
    }

    const parsed = JSON.parse(
      target.getItem(RIDE_CONTINUATION_STORAGE_KEY) || "null"
    );
    const stored = record(parsed);
    if (!stored || String(stored.rideId || "") === rideId) {
      target.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
    }
  } catch {
    try {
      target.removeItem(RIDE_CONTINUATION_STORAGE_KEY);
    } catch {
      // Nothing else depends on continuation cleanup.
    }
  }
}

/** @param {unknown} [rideId] */
export function clearRideContinuation(rideId = "") {
  const id = String(rideId || "");
  clearFrom(sessionStorageTarget(), id);
  clearFrom(durableStorageTarget(), id);
}
