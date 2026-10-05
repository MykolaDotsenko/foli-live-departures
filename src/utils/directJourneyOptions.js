import { compareJourneyTimeCandidates } from "./journeyTime";
/** @import { DirectJourneyOption, NearbyFitMap, NearbyDepartureFit } from "../types/journey" */

const MAX_ALTERNATIVE_DELAY_SEC = 10 * 60;
const MIN_WALKING_SAVING_M = 100;
// A backup bus leaves at least this much apart from the first choice: one
// leaving the same minute is no second chance.
const MIN_BACKUP_GAP_SEC = 2 * 60;
// One run of a trip is boarded at its stops minutes apart; the timetable
// lists the same trip again for its next service day, a day later.
const SAME_RUN_WITHIN_SEC = 12 * 60 * 60;

/**
 * @param {NearbyDepartureFit} left
 * @param {NearbyDepartureFit} right
 */
function sameRun(left, right) {
  return (
    left.tripRef === right.tripRef &&
    Math.abs(Number(left.departureAt) - Number(right.departureAt)) <
      SAME_RUN_WITHIN_SEC
  );
}

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
 * @param {{ distanceMeters: number, departure: NearbyDepartureFit }} candidate
 * @returns {number}
 */
function totalApproxWalkingMeters(candidate) {
  const boarding = Number(candidate.distanceMeters);
  const finalWalk = Number(candidate.departure?.finalWalkDistanceM);
  const boardingMeters =
    Number.isFinite(boarding) && boarding >= 0 ? boarding : 0;
  const finalMeters =
    Number.isFinite(finalWalk) && finalWalk >= 0 ? finalWalk : 0;
  return boardingMeters + finalMeters;
}

/**
 * @param {NearbyDepartureFit} departure
 * @returns {number}
 */
function arrivalRank(departure) {
  const journeyArrival = Number(departure.journeyArrivalAt);
  if (Number.isFinite(journeyArrival) && journeyArrival > 0) {
    return journeyArrival;
  }

  const stopArrival = Number(departure.destinationArrivalAt);
  return Number.isFinite(stopArrival) && stopArrival > 0
    ? stopArrival
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
    Number.isFinite(arrivalRank(departure))
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
    departure.aimedDepartureAt || departure.departureAt,
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
 *   timeConstraint?: import("../types/journey").JourneyTimeConstraint | null,
 *   preference?: import("../types/journey").RoutingPreference | string,
 * }} input
 * @returns {DirectJourneyOption[]}
 */
export function selectDirectJourneyOptions({
  stops,
  fitsByStop,
  timeConstraint = null,
  preference = "balanced",
}) {
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

  // Arriving at the same moment is equally fast: boarding the same bus
  // further back down its line only adds walking, and it had won "Fastest"
  // by boarding earlier. Arrive-by keeps its latest-departure order.
  candidates.sort(
    (left, right) =>
      (timeConstraint?.mode === "arrive-by"
        ? compareJourneyTimeCandidates(
            left.departure,
            right.departure,
            timeConstraint
          )
        : arrivalRank(left.departure) - arrivalRank(right.departure)) ||
      catchabilityRank(left.departure) - catchabilityRank(right.departure) ||
      left.distanceMeters - right.distanceMeters ||
      Number(left.departure.departureAt) - Number(right.departure.departureAt)
  );

  const fastest = candidates[0];
  const fastestArrival = arrivalRank(fastest.departure);

  /** @type {DirectJourneyOption[]} */
  const selected = [
    {
      id: optionId(fastest.stopId, fastest.departure),
      label:
        timeConstraint?.mode === "arrive-by"
          ? "latest-departure"
          : "fastest",
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
        totalApproxWalkingMeters(fastest) -
        totalApproxWalkingMeters(candidate);

      return (
        arrivalDelay >= 0 &&
        arrivalDelay <= MAX_ALTERNATIVE_DELAY_SEC &&
        walkingSaving >= MIN_WALKING_SAVING_M
      );
    })
    .sort(
      (left, right) =>
        totalApproxWalkingMeters(left) -
          totalApproxWalkingMeters(right) ||
        arrivalRank(left.departure) - arrivalRank(right.departure)
    )[0];

  if (lessWalking) {
    /** @type {DirectJourneyOption} */
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
        totalApproxWalkingMeters(lessWalking) -
        totalApproxWalkingMeters(fastest),
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
        totalApproxWalkingMeters(easier) -
        totalApproxWalkingMeters(fastest),
    });
  }

  // A second choice whenever there is one. With only the fastest shown, a
  // passenger who missed it, or needed a few more minutes, had no answer;
  // and with nothing to compare, "Fastest" said nothing. The backup is the
  // bus after the first choice that gets there first, or, arriving by a
  // time, the bus before it, for margin. The same run boarded at another
  // stop is the same bus, not a second chance; the trip's run on its next
  // service day, which a timetable search lists under the same trip, is.
  if (selected.length < 3) {
    const arriveBy = timeConstraint?.mode === "arrive-by";
    const firstLeaves = Number(fastest.departure.departureAt);
    const backup = candidates
      .filter((candidate) => {
        const gap = Number(candidate.departure.departureAt) - firstLeaves;
        return (
          !selected.some((item) =>
            sameRun(item.departure, candidate.departure)
          ) &&
          (arriveBy ? -gap : gap) >= MIN_BACKUP_GAP_SEC
        );
      })
      .sort(
        (left, right) =>
          (arriveBy
            ? Number(right.departure.departureAt) -
              Number(left.departure.departureAt)
            : arrivalRank(left.departure) - arrivalRank(right.departure)) ||
          Number(left.departure.departureAt) -
            Number(right.departure.departureAt) ||
          totalApproxWalkingMeters(left) - totalApproxWalkingMeters(right)
      )[0];

    if (backup) {
      selected.push({
        id: optionId(backup.stopId, backup.departure),
        label: arriveBy ? "earlier-bus" : "next-bus",
        stopId: backup.stopId,
        stopName: backup.stopName,
        distanceMeters: backup.distanceMeters,
        departure: backup.departure,
        arrivalDeltaSec: arrivalRank(backup.departure) - fastestArrival,
        walkingDeltaMeters:
          totalApproxWalkingMeters(backup) -
          totalApproxWalkingMeters(fastest),
      });
    }
  }

  const result = selected.slice(0, 3);

  if (preference === "less-walking") {
    result.sort(
      (left, right) =>
        totalApproxWalkingMeters(left) -
          totalApproxWalkingMeters(right) ||
        arrivalRank(left.departure) - arrivalRank(right.departure)
    );
  } else if (preference === "more-buffer") {
    result.sort(
      (left, right) =>
        catchabilityRank(left.departure) -
          catchabilityRank(right.departure) ||
        arrivalRank(left.departure) - arrivalRank(right.departure)
    );
  }

  return result;
}
