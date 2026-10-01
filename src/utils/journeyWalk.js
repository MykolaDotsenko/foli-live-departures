const WALKING_SPEED_MPS = 1.15;
const STRAIGHT_LINE_DETOUR_FACTOR = 1.25;

/**
 * Internal ranking estimate only. It converts a straight-line distance into
 * a conservative walking-duration approximation. It is deliberately not a
 * pedestrian-routing claim.
 *
 * @param {number | null | undefined} distanceM
 * @returns {number | null}
 */
export function estimatedWalkSeconds(distanceM) {
  const distance = Number(distanceM);
  if (!Number.isFinite(distance) || distance < 0) return null;

  return Math.ceil(
    (distance * STRAIGHT_LINE_DETOUR_FACTOR) / WALKING_SPEED_MPS
  );
}
