/** @import { DirectJourneyOption, NearbyFitMap, NearbyDepartureFit } from "../types/journey" */

const LESS_WALKING_MAX_DELAY_SEC = 8 * 60;
const EASIER_CATCH_MAX_DELAY_SEC = 8 * 60;
const MEANINGFUL_WALK_SAVING_M = 100;
const MEANINGFUL_CATCH_MARGIN_SEC = 2 * 60;

const CATCHABILITY_SCORE = {
  "at-stop": 5,
  comfortable: 4,
  likely: 3,
  tight: 2,
  unknown: 1,
  "too-late": 0,
};

const LIVE_SCORE = {
  live: 3,
  delayed: 2,
  schedule: 1,
  unknown: 0,
};

/**
 * @param {NearbyDepartureFit} candidate
 */
function arrival(candidate) {
  const value = Number(candidate?.destinationArrivalAt);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * @param {NearbyDepartureFit} candidate
 */
function catchScore(candidate) {
  return CATCHABILITY_SCORE[candidate?.catchability] ?? 0;
}

/**
 * @param {NearbyDepartureFit} candidate
 */
function liveScore(candidate) {
  return LIVE_SCORE[candidate?.liveState] ?? 0;
}

/**
 * A dominates B only if it is no worse on every direct-journey decision
 * dimension and better on at least one. This keeps a genuinely less-walking
 * or easier-to-catch option even when it is a little slower.
 *
 * @param {any} a
 * @param {any} b
 */
function dominates(a, b) {
  const noLater = a.destinationArrivalAt <= b.destinationArrivalAt;
  const noMoreWalking = a.distanceMeters <= b.distanceMeters;
  const noWorseCatch = catchScore(a) >= catchScore(b);
  const noWorseLive = liveScore(a) >= liveScore(b);

  if (!(noLater && noMoreWalking && noWorseCatch && noWorseLive)) {
    return false;
  }

  return (
    a.destinationArrivalAt < b.destinationArrivalAt ||
    a.distanceMeters < b.distanceMeters ||
    catchScore(a) > catchScore(b) ||
    liveScore(a) > liveScore(b)
  );
}

/**
 * @param {readonly any[]} stops
 * @param {NearbyFitMap} fitsByStop
 */
export function collectDirectJourneyCandidates(stops, fitsByStop) {
  const stopById = new Map(stops.map((stop) => [String(stop.id), stop]));
  const candidates = [];
  const seen = new Set();

  for (const [stopId, fit] of Object.entries(fitsByStop || {})) {
    const stop = stopById.get(String(stopId));
    if (!stop) continue;

    const source =
      Array.isArray(fit?.options) && fit.options.length > 0
        ? fit.options
        : fit?.best
          ? [fit.best]
          : [];

    for (const option of source) {
      const destinationArrivalAt = arrival(option);
      if (
        destinationArrivalAt === null ||
        option.catchability === "too-late"
      ) {
        continue;
      }

      const id = [
        stopId,
        option.tripRef,
        option.destinationStopId,
        option.departureAt,
      ].join("|");
      if (seen.has(id)) continue;
      seen.add(id);

      candidates.push({
        id,
        stopId: String(stopId),
        stopName: String(stop.name || stopId),
        distanceMeters: Number(stop.distanceMeters) || 0,
        tripRef: String(option.tripRef || ""),
        lineRef: String(option.lineRef || ""),
        destinationStopId: String(option.destinationStopId || ""),
        departureAt: Number(option.departureAt),
        destinationArrivalAt,
        catchability: option.catchability,
        liveState: option.liveState,
        catchMarginSec: Number.isFinite(Number(option.catchMarginSec))
          ? Number(option.catchMarginSec)
          : null,
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      left.destinationArrivalAt - right.destinationArrivalAt ||
      left.distanceMeters - right.distanceMeters ||
      right.departureAt - left.departureAt
  );
}

/**
 * @param {readonly any[]} candidates
 */
export function pruneDominatedDirectJourneys(candidates) {
  return candidates.filter(
    (candidate, index) =>
      !candidates.some(
        (other, otherIndex) =>
          otherIndex !== index && dominates(other, candidate)
      )
  );
}

/**
 * @param {readonly any[]} candidates
 * @param {Set<string>} used
 * @param {(candidate: any) => boolean} predicate
 * @param {(a: any, b: any) => number} compare
 */
function chooseDistinct(candidates, used, predicate, compare) {
  return candidates
    .filter((candidate) => !used.has(candidate.id) && predicate(candidate))
    .sort(compare)[0] || null;
}

/**
 * Returns at most three meaningful direct alternatives. It never invents a
 * "less walking" or "easier to catch" label when the trade-off is negligible.
 *
 * @param {readonly any[]} stops
 * @param {NearbyFitMap} fitsByStop
 * @returns {DirectJourneyOption[]}
 */
export function buildDirectJourneyOptions(stops, fitsByStop) {
  const candidates = pruneDominatedDirectJourneys(
    collectDirectJourneyCandidates(stops, fitsByStop)
  );
  if (candidates.length === 0) return [];

  const fastest = candidates[0];
  const used = new Set([fastest.id]);
  /** @type {DirectJourneyOption[]} */
  const options = [{ ...fastest, kind: "fastest" }];

  const lessWalking = chooseDistinct(
    candidates,
    used,
    (candidate) =>
      candidate.destinationArrivalAt - fastest.destinationArrivalAt <=
        LESS_WALKING_MAX_DELAY_SEC &&
      fastest.distanceMeters - candidate.distanceMeters >=
        MEANINGFUL_WALK_SAVING_M,
    (left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.destinationArrivalAt - right.destinationArrivalAt
  );

  if (lessWalking) {
    used.add(lessWalking.id);
    options.push({ ...lessWalking, kind: "less-walking" });
  }

  const fastestMargin = Number.isFinite(Number(fastest.catchMarginSec))
    ? Number(fastest.catchMarginSec)
    : null;
  const easierCatch = chooseDistinct(
    candidates,
    used,
    (candidate) => {
      if (
        candidate.destinationArrivalAt - fastest.destinationArrivalAt >
        EASIER_CATCH_MAX_DELAY_SEC
      ) {
        return false;
      }

      if (catchScore(candidate) > catchScore(fastest)) return true;

      const margin = Number(candidate.catchMarginSec);
      return (
        fastestMargin !== null &&
        Number.isFinite(margin) &&
        margin - fastestMargin >= MEANINGFUL_CATCH_MARGIN_SEC
      );
    },
    (left, right) => {
      const catchDifference = catchScore(right) - catchScore(left);
      if (catchDifference !== 0) return catchDifference;

      const leftMargin = Number.isFinite(Number(left.catchMarginSec))
        ? Number(left.catchMarginSec)
        : Number.NEGATIVE_INFINITY;
      const rightMargin = Number.isFinite(Number(right.catchMarginSec))
        ? Number(right.catchMarginSec)
        : Number.NEGATIVE_INFINITY;
      return (
        rightMargin - leftMargin ||
        left.destinationArrivalAt - right.destinationArrivalAt
      );
    }
  );

  if (easierCatch) {
    options.push({ ...easierCatch, kind: "easier-to-catch" });
  }

  return options.slice(0, 3);
}
