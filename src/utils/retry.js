const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

/**
 * @param {unknown} consecutiveFailures Coerced; anything unusable counts as one.
 * @returns {number}
 */
export function retryDelayMs(consecutiveFailures) {
  const failures = Math.max(1, Math.floor(Number(consecutiveFailures) || 0));

  return Math.min(BASE_RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS);
}

// An active ride cannot back off the way a background departure board can:
// the passenger is on the bus now. Repeated failures still slow the poll so a
// dead provider is not hammered, but never past the point where the panel has
// already declared live tracking lost (120s), so recovery is still noticed.
const RIDE_POLL_MS = 20_000;
const RIDE_POLL_MAX_MS = 80_000;

/**
 * @param {unknown} consecutiveFailures Coerced; anything unusable counts as none.
 * @param {() => number} [random] Returns a value in [0, 1), like Math.random.
 * @returns {number}
 */
export function ridePollDelayMs(consecutiveFailures, random = Math.random) {
  const failures = Math.max(0, Math.floor(Number(consecutiveFailures) || 0));
  if (failures === 0) return RIDE_POLL_MS;

  const backoff = Math.min(
    RIDE_POLL_MS * 2 ** (failures - 1),
    RIDE_POLL_MAX_MS
  );

  // Jitter keeps a city's worth of phones off one synchronised retry tick.
  return Math.round(backoff * (0.85 + random() * 0.3));
}
