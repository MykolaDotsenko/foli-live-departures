/**
 * Ride continuation state is intentionally tab-scoped.
 *
 * Ride Mode itself persists in localStorage because a passenger must not lose
 * the get-off alarm on reload. Journey continuation can include an external
 * destination label and coordinates, so keeping it in sessionStorage preserves
 * reload continuity without silently turning a private destination into
 * durable cross-session history.
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

  if (!transferJourney && !finalWalk) return null;
  return {
    transferJourney,
    finalWalk,
  };
}

function storage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

/** @param {unknown} rideId */
export function readRideContinuation(rideId) {
  const id = String(rideId || "");
  if (!id) return null;

  const target = storage();
  if (!target) return null;

  try {
    const parsed = JSON.parse(
      target.getItem(RIDE_CONTINUATION_STORAGE_KEY) || "null"
    );
    const stored = record(parsed);
    const normalized =
      stored && String(stored.rideId || "") === id
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
      // Session continuity is best-effort; Ride Mode remains authoritative.
    }
    return null;
  }
}

/** @param {unknown} rideId @param {unknown} continuation */
export function persistRideContinuation(rideId, continuation) {
  const id = String(rideId || "");
  const normalized = normalizeRideContinuation(continuation);
  const target = storage();

  if (!id || !target) return normalized;

  try {
    if (!normalized) {
      clearRideContinuation(id);
      return null;
    }

    target.setItem(
      RIDE_CONTINUATION_STORAGE_KEY,
      JSON.stringify({ rideId: id, continuation: normalized })
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
    if (
      !record(parsed) ||
      String(parsed.rideId || "") === String(rideId)
    ) {
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
