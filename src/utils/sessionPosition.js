import { hasCoordinates } from "./geo";

// The last location the passenger asked the app to use ("Find nearest
// stop", the location button, "Nearest to me first"), so places can be
// listed nearest first without asking again. Kept in memory only: it is
// never written to storage, never sent anywhere, and gone with the page.
const MAX_AGE_MS = 15 * 60 * 1000;

/** @type {{ lat: number, lon: number, at: number } | null} */
let last = null;

/** @param {{ lat?: unknown, lon?: unknown } | null | undefined} position */
export function rememberPosition(position) {
  if (!position || !hasCoordinates(position)) return;
  last = { lat: Number(position.lat), lon: Number(position.lon), at: Date.now() };
}

/** @returns {{ lat: number, lon: number } | null} */
export function recentPosition() {
  if (!last || Date.now() - last.at > MAX_AGE_MS) return null;
  return { lat: last.lat, lon: last.lon };
}

/** Test-only reset. */
export function forgetPositionForTests() {
  last = null;
}
