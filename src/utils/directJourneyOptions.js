/** @import { DirectJourneyOption, NearbyFitMap, NearbyDepartureFit } from "../types/journey" */

const MAX_ALTERNATIVE_DELAY_SEC = 10 * 60;
const MIN_WALKING_SAVING_M = 100;

const CATCHABILITY_RANK = {
  "at-stop": 0,
  comfortable: 1,
  likely: 2,
  tight: 3,
  unknown: 4,
  "too-late": 5,
};

/**
 * @param {NearbyDepartureFit} departure
 * @returns {number}
 */
function catchabilityRank(departure) {
  return CATCHABILITY_RANK[departure.catchability] ?? 4;
}

/**
 * @param {NearbyDepartureFit} departure
 * @returns {number}
 */
function arrivalRank(departure) {
  const arrival = Number(departure.destinationArrivalAt);
  return Number.isFinite(arrival) && arrival > 0
    ? arrival
    : Number.POSITIVE_INFINITY;
}

/**
 * @param {NearbyDepartureFit} departure
 * @returns {boolean}
 */
function usable(departure) {
  return (
    departure.catchability !== "too-late" &&
    departure.catchability !== "unknown" &&
    Number.isFinite(Number(departure.destinationArrivalAt))
  );
}

/**
 * @param {string} stopId
 * @param {NearbyDepartureFit} departure
 */
function optionId(stopId, departure) {
  return [
    stopId,
    departure.tripRef,
    departure.departureAt,
    departure.destinationStopId,
  ].join(":");
}

/**
 * Turn stop-level evidence into a small, deliberately diverse set of direct
 * journey choices. This is not a generic route enumerator: it only surfaces
 * options with a passenger-meaningful trade-off.
 *
 * @param {{
 *   stops: readonly { id: string, name?: string, distanceMeters?: number }[],
 *   fitsByStop: NearbyFitMap,
 * }} input
 * @returns {DirectJourneyOption[]}
 */
export function selectDirectJourneyOptions({ stops, fitsByStop }) {
  const stopById = new Map(stops.map((stop) => [String(stop.id), stop]));

  /** @type {{ stopId: string, stopName: string, distanceMeters: number, departure: NearbyDepartureFit }[]} */
  const candidates = [];

  for (const [stopId, fit] of Object.entries(fitsByStop || {})) {
    const stop = stopById.get(stopId);
    if (!stop) continue;

    const distanceMeters = Number(stop.distanceMeters);
    const departures = Array.isArray(fit?.departures)
      ? fit.departures
      : fit?.best
        ? [fit.best]
        : [];

    for (const departure of departures) {
      if (!usable(departure)) continue;
      candidates.push({
        stopId,
        stopName: String(stop.name || stopId),
        distanceMeters: Number.isFinite(distanceMeters)
          ? distanceMeters
          : Number.POSITIVE_INFINITY,
        departure,
      });
    }
  }

  if (candidates.length === 0) return [];

  candidates.sort(
    (left, right) =>
      arrivalRank(left.departure) - arrivalRank(right.departure) ||
      catchabilityRank(left.departure) - catchabilityRank(right.departure) ||
      left.distanceMeters - right.distanceMeters
  );

  const fastest = candidates[0];
  const fastestArrival = arrivalRank(fastest.departure);

  /** @type {DirectJourneyOption[]} */
  const selected = [
    {
      id: optionId(fastest.stopId, fastest.departure),
      label: "fastest",
      stopId: fastest.stopId,
      stopName: fastest.stopName,
      distanceMeters: fastest.distanceMeters,
      departure: fastest.departure,
      arrivalDeltaSec: 0,
      walkingDeltaMeters: 0,
    },
  ];

  const selectedIds = new Set(selected.map((item) => item.id));

  const lessWalking = [...candidates]
    .filter((candidate) => {
      const id = optionId(candidate.stopId, candidate.departure);
      if (selectedIds.has(id)) return false;

      const arrivalDelay =
        arrivalRank(candidate.departure) - fastestArrival;
      const walkingSaving =
        fastest.distanceMeters - candidate.distanceMeters;

      return (
        arrivalDelay >= 0 &&
        arrivalDelay <= MAX_ALTERNATIVE_DELAY_SEC &&
        walkingSaving >= MIN_WALKING_SAVING_M
      );
    })
    .sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        arrivalRank(left.departure) - arrivalRank(right.departure)
    )[0];

  if (lessWalking) {
    const item = {
      id: optionId(lessWalking.stopId, lessWalking.departure),
      label: "less-walking",
      stopId: lessWalking.stopId,
      stopName: lessWalking.stopName,
      distanceMeters: lessWalking.distanceMeters,
      departure: lessWalking.departure,
      arrivalDeltaSec:
        arrivalRank(lessWalking.departure) - fastestArrival,
      walkingDeltaMeters:
        lessWalking.distanceMeters - fastest.distanceMeters,
    };
    selected.push(item);
    selectedIds.add(item.id);
  }

  const fastestCatchability = catchabilityRank(fastest.departure);
  const easier = [...candidates]
    .filter((candidate) => {
      const id = optionId(candidate.stopId, candidate.departure);
      if (selectedIds.has(id)) return false;

      const arrivalDelay =
        arrivalRank(candidate.departure) - fastestArrival;

      return (
        catchabilityRank(candidate.departure) < fastestCatchability &&
        arrivalDelay >= 0 &&
        arrivalDelay <= MAX_ALTERNATIVE_DELAY_SEC
      );
    })
    .sort(
      (left, right) =>
        catchabilityRank(left.departure) -
          catchabilityRank(right.departure) ||
        arrivalRank(left.departure) - arrivalRank(right.departure) ||
        left.distanceMeters - right.distanceMeters
    )[0];

  if (easier) {
    selected.push({
      id: optionId(easier.stopId, easier.departure),
      label: "easier-to-catch",
      stopId: easier.stopId,
      stopName: easier.stopName,
      distanceMeters: easier.distanceMeters,
      departure: easier.departure,
      arrivalDeltaSec:
        arrivalRank(easier.departure) - fastestArrival,
      walkingDeltaMeters:
        easier.distanceMeters - fastest.distanceMeters,
    });
  }

  return selected.slice(0, 3);
}
