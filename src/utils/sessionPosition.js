import { hasCoordinates } from "./geo";

// The last location the passenger explicitly asked the app to use ("Find
// nearest stop", the location button, "Nearest to me first"). It is kept only
// in memory: never persisted, never sent anywhere, and gone with the page.
//
// Accuracy is part of the evidence. A later destination-first flow may reuse a
// fresh fix only when it can prove the fix was precise enough; dropping
// accuracy would turn a real GPS reading into an unverifiable location.
const MAX_AGE_MS = 15 * 60 * 1000;

/** @type {{ lat: number, lon: number, accuracy: number | null, at: number } | null} */
let last = null;

/**
 * @param {{ lat?: unknown, lon?: unknown, accuracy?: unknown } | null | undefined} position
 */
export function rememberPosition(position) {
  if (!position || !hasCoordinates(position)) return;
  const accuracy = Number(position.accuracy);
  last = {
    lat: Number(position.lat),
    lon: Number(position.lon),
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    at: Date.now(),
  };
}

/**
 * @returns {{ lat: number, lon: number, accuracy: number | null } | null}
 */
export function recentPosition() {
  if (!last || Date.now() - last.at > MAX_AGE_MS) return null;
  return { lat: last.lat, lon: last.lon, accuracy: last.accuracy };
}

/** Test-only reset. */
export function forgetPositionForTests() {
  last = null;
}
