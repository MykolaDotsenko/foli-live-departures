const MATERIAL_SWITCH_SECONDS = 2 * 60;

/**
 * @param {any} fit
 * @returns {number}
 */
export function destinationFitRank(fit) {
  if (!fit) return 7;
  if (fit.status === "good") return 0;
  if (fit.status === "tight") return 1;
  if (fit.status === "uncertain") return 2;
  if (fit.status === "too-late") return 3;
  if (fit.status === "other-direction") return 4;
  if (fit.status === "no-direct") return 5;
  return 6;
}

/**
 * @param {any} fit
 * @returns {number | null}
 */
function destinationArrival(fit) {
  const value = Number(
    fit?.best?.finalArrivalAt ?? fit?.best?.destinationArrivalAt
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Stable destination-aware ordering.
 *
 * The strongest evidence class always wins. Inside the same evidence class,
 * an already recommended stop is retained when a challenger only improves
 * destination arrival by less than two minutes. This prevents realtime/GPS
 * jitter from making the first card jump around while still switching for a
 * materially faster option.
 *
 * Every input stop is retained.
 *
 * @template {{ id: string, distanceMeters: number }} Stop
 * @param {readonly Stop[]} stops
 * @param {Record<string, any>} fitsByStop
 * @param {readonly string[]} [previousOrder]
 * @param {number} [switchThresholdSec]
 * @returns {Stop[]}
 */
export function rankDestinationStops(
  stops,
  fitsByStop,
  previousOrder = [],
  switchThresholdSec = MATERIAL_SWITCH_SECONDS
) {
  const ranked = [...stops].sort((left, right) => {
    const leftFit = fitsByStop[left.id];
    const rightFit = fitsByStop[right.id];
    const rankDifference =
      destinationFitRank(leftFit) - destinationFitRank(rightFit);
    if (rankDifference !== 0) return rankDifference;

    const leftArrival = destinationArrival(leftFit);
    const rightArrival = destinationArrival(rightFit);
    if (leftArrival !== null && rightArrival === null) return -1;
    if (leftArrival === null && rightArrival !== null) return 1;
    if (
      leftArrival !== null &&
      rightArrival !== null &&
      leftArrival !== rightArrival
    ) {
      return leftArrival - rightArrival;
    }

    return Number(left.distanceMeters) - Number(right.distanceMeters);
  });

  if (ranked.length < 2 || previousOrder.length === 0) return ranked;

  const previousTopId = String(previousOrder[0] || "");
  const previousIndex = ranked.findIndex(
    (stop) => String(stop.id) === previousTopId
  );
  if (previousIndex <= 0) return ranked;

  const challenger = ranked[0];
  const previous = ranked[previousIndex];
  const challengerFit = fitsByStop[challenger.id];
  const previousFit = fitsByStop[previous.id];

  // A stronger evidence class is a meaningful change by itself.
  if (destinationFitRank(challengerFit) !== destinationFitRank(previousFit)) {
    return ranked;
  }

  const challengerArrival = destinationArrival(challengerFit);
  const previousArrival = destinationArrival(previousFit);

  // If either ETA is unknown, keep the deterministic base order rather than
  // freezing an old recommendation without evidence.
  if (challengerArrival === null || previousArrival === null) return ranked;

  const improvement = previousArrival - challengerArrival;
  if (improvement >= Math.max(0, switchThresholdSec)) return ranked;

  const stable = [...ranked];
  stable.splice(previousIndex, 1);
  stable.unshift(previous);
  return stable;
}
