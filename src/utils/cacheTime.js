/**
 * A stored epoch-milliseconds timestamp, or 0 when it is unusable or in the
 * future.
 * @param {unknown} value Read back from storage, so not trusted.
 * @param {number} [nowMs]
 * @returns {number}
 */
export function normalizedPastTimestamp(value, nowMs = Date.now()) {
  const timestamp = Number(value);
  const now = Number(nowMs);

  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    !Number.isFinite(now) ||
    now <= 0 ||
    timestamp > now
  ) {
    return 0;
  }

  return timestamp;
}

/**
 * @param {unknown} value Read back from storage, so not trusted.
 * @param {number} ttlMs
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function timestampIsFresh(
  value,
  ttlMs,
  nowMs = Date.now()
) {
  const timestamp = normalizedPastTimestamp(value, nowMs);
  const ttl = Number(ttlMs);
  const now = Number(nowMs);

  return (
    timestamp > 0 &&
    Number.isFinite(ttl) &&
    ttl > 0 &&
    now - timestamp < ttl
  );
}
