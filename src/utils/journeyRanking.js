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

const CATCHABLE = new Set(["at-stop", "comfortable", "likely"]);

/**
 * A stop is compared on its first realistically catchable bus. A tight
 * first one stays the bus shown, but it must not hide a comfortable later
 * one: standing 30 m from such a stop, the passenger was sent 700 m away
 * as "Best" for a bus arriving no earlier.
 *
 * @param {any} fit
 * @returns {any | null}
 */
function laterCatchableDeparture(fit) {
  if (fit?.status !== "tight" || !Array.isArray(fit.departures)) return null;
  return (
    fit.departures.find(
      (/** @type {any} */ departure) =>
        departure !== fit.best && CATCHABLE.has(departure?.catchability)
    ) || null
  );
}

/**
 * @param {any} fit
 * @returns {number}
 */
function rankingClass(fit) {
  return laterCatchableDeparture(fit)
    ? destinationFitRank({ status: "good" })
    : destinationFitRank(fit);
}

/**
 * @param {any} fit
 * @returns {number | null}
 */
function destinationArrival(fit) {
  const departure = laterCatchableDeparture(fit) || fit?.best;
  const value = Number(departure?.destinationArrivalAt);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Whether a different stop is materially better than the stop the passenger
 * explicitly chose as their origin. A stronger evidence class is enough; in
 * the same class, require the same two-minute improvement used by the stable
 * ranking. Unknown ETAs never trigger a same-class recommendation.
 *
 * @param {any} challengerFit
 * @param {any} currentFit
 * @param {number} [switchThresholdSec]
 * @returns {boolean}
 */
export function isMateriallyBetterDestinationFit(
  challengerFit,
  currentFit,
  switchThresholdSec = MATERIAL_SWITCH_SECONDS
) {
  if (!challengerFit || !currentFit) return false;

  const challengerClass = rankingClass(challengerFit);
  const currentClass = rankingClass(currentFit);
  if (challengerClass < currentClass) return true;
  if (challengerClass > currentClass) return false;

  const challengerArrival = destinationArrival(challengerFit);
  const currentArrival = destinationArrival(currentFit);
  if (challengerArrival === null || currentArrival === null) return false;

  return (
    currentArrival - challengerArrival >= Math.max(0, switchThresholdSec)
  );
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
    const rankDifference = rankingClass(leftFit) - rankingClass(rightFit);
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
  if (rankingClass(challengerFit) !== rankingClass(previousFit)) {
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
