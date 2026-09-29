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
