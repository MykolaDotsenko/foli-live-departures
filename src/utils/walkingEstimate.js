const WALKING_SPEED_MPS = 1.2;
const STREET_DETOUR_FACTOR = 1.25;

/**
 * Approximate pedestrian duration from straight-line distance.
 *
 * This is intentionally a coarse routing heuristic, not turn-by-turn walking
 * navigation. The UI must label it as approximate.
 *
 * @param {number | null | undefined} distanceM
 * @returns {number | null}
 */
export function approximateWalkSeconds(distanceM) {
  if (distanceM === null || distanceM === undefined || distanceM === "") {
    return null;
  }
  const distance = Number(distanceM);
  if (!Number.isFinite(distance) || distance < 0) return null;
  if (distance === 0) return 0;

  return Math.ceil(
    (distance * STREET_DETOUR_FACTOR) / WALKING_SPEED_MPS
  );
}
