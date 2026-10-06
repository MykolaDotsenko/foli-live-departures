import { hasCoordinates } from "./geo";

// The last location the passenger explicitly asked the app to use ("Find
// nearest stop", the stop-search location button, "Nearest to me first" or
// Stop Radar). It is kept in memory only: never persisted, never sent
// anywhere, and gone with the page. Accuracy is preserved so later journey
// origin reuse can reject an old approximate fix instead of treating every
// remembered coordinate as equally trustworthy.
const MAX_AGE_MS = 15 * 60 * 1000;

/** @type {{ lat: number, lon: number, accuracy: number | null, at: number } | null} */
let last = null;

/** @param {{ lat?: unknown, lon?: unknown, accuracy?: unknown } | null | undefined} position */
export function rememberPosition(position) {
  if (!position || !hasCoordinates(position)) return;

  const rawAccuracy = Number(position.accuracy);
  last = {
    lat: Number(position.lat),
    lon: Number(position.lon),
    accuracy:
      Number.isFinite(rawAccuracy) && rawAccuracy >= 0 ? rawAccuracy : null,
    at: Date.now(),
  };
}

/** @returns {{ lat: number, lon: number, accuracy: number | null } | null} */
export function recentPosition() {
  if (!last || Date.now() - last.at > MAX_AGE_MS) return null;
  return {
    lat: last.lat,
    lon: last.lon,
    accuracy: last.accuracy,
  };
}

/** Test-only reset. */
export function forgetPositionForTests() {
  last = null;
}
