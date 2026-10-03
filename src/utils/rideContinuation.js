/**
 * Temporary continuation state for one active Ride Mode session.
 *
 * Ride Mode already persists for at most its ride TTL so a passenger does not
 * lose the get-off alert on reload. The committed Journey Assistant
 * continuation follows the same lifecycle: it is local to this device,
 * expires with the ride, and is deleted when the ride ends or is replaced.
 * Raw device GPS samples are never part of this record.
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
    destination,
  };
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} rideId
 * @param {number} [nowMs]
 */
export function readRideContinuation(rideId, nowMs = Date.now()) {
  const id = String(rideId || "");
  if (!id) return null;

  const target = storage();
  if (!target) return null;

  try {
    const parsed = JSON.parse(
      target.getItem(RIDE_CONTINUATION_STORAGE_KEY) || "null"
    );
    const stored = record(parsed);
    const expiresAt = Number(stored?.expiresAt);
    const now = Number(nowMs);
    const normalized =
      stored &&
      String(stored.rideId || "") === id &&
      Number.isFinite(expiresAt) &&
      Number.isFinite(now) &&
      expiresAt > now
        ? normalizeRideContinuation(stored.continuation)
        : null;

    if (!normalized) {
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
 * @param {unknown} continuation
 * @param {unknown} expiresAt
 */
export function persistRideContinuation(rideId, continuation, expiresAt) {
  const id = String(rideId || "");
  const normalized = normalizeRideContinuation(continuation);
  const expiry = Number(expiresAt);
  const target = storage();

  if (!id || !target) return normalized;

  try {
    if (!normalized || !Number.isFinite(expiry) || expiry <= Date.now()) {
      clearRideContinuation(id);
      return normalized;
    }

    target.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({
        rideId: id,
        expiresAt: expiry,
        continuation: normalized,
      })
    );
  } catch {
    // In-memory continuation still works when storage is blocked or full.
  }

  return normalized;
}

/** @param {unknown} [rideId] */
export function clearRideContinuation(rideId = "") {
  const target = storage();
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
    if (!stored || String(stored.rideId || "") === String(rideId)) {
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
