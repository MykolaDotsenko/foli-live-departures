import { realStopName } from "./stopNames";

/**
 * @import { Arrival, EpochSeconds, TripStopTime } from "../types/foli"
 * @import {
 *   RideArrivalIdentity,
 *   RideArrivalMatch,
 *   RideArrivalResolution,
 *   RideCatalogStop,
 *   RidePlan,
 *   RidePlannedProgress,
 *   RideSignals,
 *   RideStage,
 *   RideStageDecision,
 *   RideStopDetails,
 * } from "../types/ride"
 */

/**
 * One visit's worth of rows, before the caller says how it matched.
 * @typedef {{ status: "absent" }
 *   | { status: "ambiguous" }
 *   | { status: "matched", arrival: Arrival }} VisitChoice
 */

export const RIDE_STAGE = Object.freeze({
  BOARDED: "boarded",
  SOON: "soon",
  NEXT: "next",
  NOW: "now",
  MISSED: "missed",
});

/** @type {Readonly<Record<RideStage, number>>} */
const STAGE_RANK = {
  [RIDE_STAGE.BOARDED]: 0,
  [RIDE_STAGE.SOON]: 1,
  [RIDE_STAGE.NEXT]: 2,
  [RIDE_STAGE.NOW]: 3,
  [RIDE_STAGE.MISSED]: 4,
};

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteNumber(value) {
  // `Number(null)` is 0, so without this guard every "no data yet" signal
  // reads as zero metres and zero seconds away: a ride with no provider match
  // and no location fix would announce "get off now" seconds after starting.
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {RideStage | null | undefined} stage Unknown or missing ranks as
 *   BOARDED.
 * @returns {number}
 */
export function rideStageRank(stage) {
  return (stage == null ? undefined : STAGE_RANK[stage]) ?? 0;
}

/**
 * @param {unknown} value A GTFS clock, "HH:MM:SS".
 * @returns {number | null} Seconds after the service day's midnight.
 */
export function gtfsTimeToSeconds(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  return hour * 3600 + minute * 60 + second;
}

// A trip that runs past midnight can be written in next-day clock time
// ("00:10" where GTFS asks for "24:10"). Read literally that is a jump
// backwards, and clamping it to zero put the target stop at the moment of
// boarding — so the schedule announced "your stop is next" the second the
// passenger sat down. Roll the day over instead, and refuse anything that
// still makes no sense rather than inventing a number.
const MAX_TRIP_SECONDS = 6 * 3600;

/**
 * @param {number | null} scheduleSec
 * @param {number | null} boardingScheduleSec
 * @returns {number | null}
 */
function tripOffsetSeconds(scheduleSec, boardingScheduleSec) {
  if (scheduleSec === null || boardingScheduleSec === null) return null;

  const raw = scheduleSec - boardingScheduleSec;
  if (raw >= 0) return raw <= MAX_TRIP_SECONDS ? raw : null;

  const rolled = raw + 24 * 3600;
  return rolled > 0 && rolled <= MAX_TRIP_SECONDS ? rolled : null;
}

/**
 * @param {TripStopTime | null | undefined} item
 * @returns {number | null}
 */
function boardingStopTimeSeconds(item) {
  return (
    gtfsTimeToSeconds(item?.departureTime) ??
    gtfsTimeToSeconds(item?.arrivalTime)
  );
}

/**
 * @param {TripStopTime | null | undefined} item
 * @returns {number | null}
 */
function alightingStopTimeSeconds(item) {
  return (
    gtfsTimeToSeconds(item?.arrivalTime) ??
    gtfsTimeToSeconds(item?.departureTime)
  );
}

/**
 * @param {string} stopId
 * @param {ReadonlyMap<string, RideCatalogStop> | null | undefined} stopsById
 * @returns {RideStopDetails}
 */
function stopDetails(stopId, stopsById) {
  const stop = stopsById?.get?.(String(stopId));
  const lat = finiteNumber(stop?.lat);
  const lon = finiteNumber(stop?.lon);

  return {
    id: String(stopId),
    // A stop the catalogue does not name is shown, spoken and notified by
    // number, in the language the ride was started in: the plan keeps it.
    // Saved with the ride, so only Föli's own name. The screen names a
    // nameless stop by its number, in the language of the moment.
    name: realStopName(stop?.name),
    ...(lat !== null && lon !== null ? { lat, lon } : {}),
  };
}

/**
 * @param {unknown} epochSec
 * @returns {number | null} Seconds after midnight on Föli's wall clock.
 */
function helsinkiClockSeconds(epochSec) {
  const epoch = finiteNumber(epochSec);
  if (epoch === null || epoch <= 0) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Helsinki",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(epoch * 1000));

    const byType = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );
    const hour = Number(byType.hour) % 24;
    const minute = Number(byType.minute);
    const second = Number(byType.second);

    if (![hour, minute, second].every(Number.isFinite)) return null;
    return hour * 3600 + minute * 60 + second;
  } catch {
    return null;
  }
}

/**
 * @param {number | null} a
 * @param {number | null} b
 * @returns {number} Infinity when either clock is unknown.
 */
function circularClockDeltaSeconds(a, b) {
  const left = finiteNumber(a);
  const right = finiteNumber(b);
  if (left === null || right === null) return Number.POSITIVE_INFINITY;

  const day = 24 * 60 * 60;
  const diff = Math.abs((left % day) - (right % day));
  return Math.min(diff, day - diff);
}

/**
 * @param {TripStopTime[]} stopTimes
 * @param {string} currentStopId
 * @param {EpochSeconds | null | undefined} aimedDepartureEpochSec
 * @returns {number} The boarding row's index, or -1 when it cannot be told.
 */
export function resolveRideBoardingIndex(
  stopTimes,
  currentStopId,
  aimedDepartureEpochSec
) {
  const rows = Array.isArray(stopTimes) ? stopTimes : [];
  const candidates = rows
    .map((item, index) =>
      String(item?.stopId) === String(currentStopId) ? index : -1
    )
    .filter((index) => index >= 0);

  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return -1;

  const aimedClock = helsinkiClockSeconds(aimedDepartureEpochSec);
  if (aimedClock === null) return -1;

  const ranked = candidates
    .map((index) => ({
      index,
      delta: circularClockDeltaSeconds(
        boardingStopTimeSeconds(rows[index]),
        aimedClock
      ),
    }))
    .sort((a, b) => a.delta - b.delta);

  if (ranked[0].delta > 10 * 60) return -1;
  if (ranked[1] && ranked[1].delta - ranked[0].delta < 30) return -1;

  return ranked[0].index;
}

/**
 * @param {object} options
 * @param {TripStopTime[]} options.stopTimes
 * @param {string} options.currentStopId
 * @param {EpochSeconds | null | undefined} options.currentStopAimedEpochSec
 * @param {string} options.targetStopId
 * @param {number | null} [options.targetStopSequence] Preferred over the id,
 *   which a loop can serve twice.
 * @param {ReadonlyMap<string, RideCatalogStop> | null} [options.stopsById]
 * @param {EpochSeconds} options.departureEpochSec
 * @returns {RidePlan | null}
 */
export function buildRidePlan({
  stopTimes,
  currentStopId,
  currentStopAimedEpochSec,
  targetStopId,
  targetStopSequence,
  stopsById,
  departureEpochSec,
}) {
  if (!Array.isArray(stopTimes) || stopTimes.length < 2) return null;

  const boardingIndex = resolveRideBoardingIndex(
    stopTimes,
    currentStopId,
    currentStopAimedEpochSec
  );
  if (boardingIndex < 0) return null;

  const targetSequence = finiteNumber(targetStopSequence);
  const targetIndex = stopTimes.findIndex(
    (item, index) =>
      index > boardingIndex &&
      Number(item?.dropOffType) !== 1 &&
      (targetSequence !== null
        ? finiteNumber(item?.stopSequence) === targetSequence
        : String(item?.stopId) === String(targetStopId))
  );
  if (targetIndex < 0) return null;

  const boardingScheduleSec = boardingStopTimeSeconds(stopTimes[boardingIndex]);
  const departure = finiteNumber(departureEpochSec);
  if (boardingScheduleSec === null || departure === null || departure <= 0) {
    return null;
  }

  const throughRecovery = stopTimes.slice(
    boardingIndex,
    Math.min(stopTimes.length, targetIndex + 2)
  );

  const routeStops = throughRecovery.map((item, routeIndex) => {
    // The ride is anchored to when the passenger's bus leaves the boarding
    // stop, but every downstream stop is about when the bus arrives there.
    // Using departure_time for a layover stop delays "next"/"now" by the
    // entire dwell.
    const scheduleSec =
      routeIndex === 0
        ? boardingScheduleSec
        : alightingStopTimeSeconds(item);
    const offsetSec = tripOffsetSeconds(scheduleSec, boardingScheduleSec);

    return {
      ...stopDetails(item.stopId, stopsById),
      stopSequence: finiteNumber(item.stopSequence),
      arrivalTime: item.arrivalTime || "",
      departureTime: item.departureTime || "",
      timepoint: finiteNumber(item.timepoint),
      dropOffType: finiteNumber(item.dropOffType),
      shapeDistTraveled: finiteNumber(item.shapeDistTraveled),
      offsetSec,
      predictedEpochSec:
        offsetSec === null ? null : Math.round(departure + offsetSec),
    };
  });

  const relativeTargetIndex = targetIndex - boardingIndex;
  const boardingStop = routeStops[0];
  const targetStop = routeStops[relativeTargetIndex];
  const previousStop =
    relativeTargetIndex > 0 ? routeStops[relativeTargetIndex - 1] : null;
  const nextStop = routeStops[relativeTargetIndex + 1] || null;

  return {
    boardingStop,
    targetStop,
    previousStop,
    nextStop,
    routeStops,
    stopsToTarget: routeStops.slice(1, relativeTargetIndex + 1),
    targetPredictedEpochSec: targetStop?.predictedEpochSec ?? null,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizedString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * @param {Arrival | null | undefined} row
 * @returns {EpochSeconds | null}
 */
function rowEpochSec(row) {
  return (
    finiteNumber(row?.expectedarrivaltime) ??
    finiteNumber(row?.expecteddeparturetime) ??
    finiteNumber(row?.aimedarrivaltime) ??
    finiteNumber(row?.aimeddeparturetime)
  );
}

// A loop journey can serve a stop twice, and both visits carry the same
// journey and trip reference. Taking the first row timed the alarm against
// a visit the passenger does not want, a whole lap early, so with more than
// one row the ride's planned time at this stop decides. Rows at the same
// time are one visit listed twice. Visits the planned time cannot clearly
// tell apart are not guessed at: no match leaves the timetable in charge,
// which can warn but never says "get off now".
/**
 * @param {Arrival[]} candidates
 * @param {EpochSeconds | null | undefined} plannedEpochSec
 * @returns {VisitChoice}
 */
function chooseVisit(candidates, plannedEpochSec) {
  if (candidates.length === 0) return { status: "absent" };
  if (candidates.length === 1) {
    return { status: "matched", arrival: candidates[0] };
  }

  const times = candidates.map(rowEpochSec);
  const known = times.filter((time) => time !== null);
  if (
    known.length === times.length &&
    Math.max(...known) - Math.min(...known) <= 60
  ) {
    return { status: "matched", arrival: candidates[0] };
  }

  const planned = finiteNumber(plannedEpochSec);
  if (planned === null) return { status: "ambiguous" };

  const ranked = candidates
    .map((arrival, index) => ({
      arrival,
      delta:
        times[index] === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(times[index] - planned),
    }))
    .sort((a, b) => a.delta - b.delta);

  return ranked[1].delta - ranked[0].delta >= 300
    ? { status: "matched", arrival: ranked[0].arrival }
    : { status: "ambiguous" };
}

// Richer than matchRideArrival(): provider polling needs to distinguish
// "the bus is absent" from "the feed lists our journey more than once and we
// cannot safely tell which visit is ours". Ambiguity is neutral evidence; it
// must never increment a "bus has left" counter.
/**
 * @param {Arrival[] | null | undefined} arrivals One stop's live rows.
 * @param {RideArrivalIdentity | null | undefined} identity
 * @returns {RideArrivalResolution}
 */
export function resolveRideArrivalMatch(arrivals, identity) {
  const rows = Array.isArray(arrivals) ? arrivals : [];
  if (rows.length === 0 || !identity) return { status: "absent" };

  const journey = normalizedString(identity.datedVehicleJourneyRef);
  if (journey) {
    const candidates = rows.filter(
      (row) => normalizedString(row?.datedvehiclejourneyref) === journey
    );
    if (candidates.length > 0) {
      const visit = chooseVisit(candidates, identity.plannedEpochSec);
      return visit.status === "matched"
        ? { ...visit, matchedBy: "dated-journey" }
        : visit;
    }
  }

  const trip = normalizedString(identity.tripRef);
  if (trip) {
    const candidates = rows.filter(
      (row) => normalizedString(row?.tripref) === trip
    );
    if (candidates.length > 0) {
      const visit = chooseVisit(candidates, identity.plannedEpochSec);
      return visit.status === "matched"
        ? { ...visit, matchedBy: "trip" }
        : visit;
    }
  }

  const line = normalizedString(identity.lineRef);
  const originTime = finiteNumber(identity.originAimedDepartureTime);

  const vehicle = normalizedString(identity.vehicleRef);
  if (vehicle) {
    const sameVehicle = rows.filter(
      (row) =>
        normalizedString(row?.vehicleref) === vehicle &&
        (line === "" || normalizedString(row?.lineref) === line)
    );

    if (sameVehicle.length === 1) {
      const arrival = sameVehicle[0];

      // A physical bus can finish one run and start another on the same line.
      // When the run's origin time is known, vehicle identity alone is not
      // enough: require the one row to agree with that run too.
      if (originTime === null) {
        return { status: "matched", arrival, matchedBy: "vehicle" };
      }

      const candidateOrigin = finiteNumber(arrival?.originaimeddeparturetime);
      if (candidateOrigin === null) {
        return { status: "ambiguous" };
      }
      if (Math.abs(candidateOrigin - originTime) <= 90) {
        return {
          status: "matched",
          arrival,
          matchedBy: "vehicle-origin-time",
        };
      }
    }

    if (sameVehicle.length > 1 && originTime !== null) {
      const ranked = sameVehicle
        .map((arrival) => ({
          arrival,
          delta: Math.abs(
            (finiteNumber(arrival?.originaimeddeparturetime) ??
              Number.POSITIVE_INFINITY) - originTime
          ),
        }))
        .sort((a, b) => a.delta - b.delta);

      if (ranked[0].delta <= 90 && ranked[1].delta - ranked[0].delta >= 90) {
        return {
          status: "matched",
          arrival: ranked[0].arrival,
          matchedBy: "vehicle-origin-time",
        };
      }

      return { status: "ambiguous" };
    }
  }

  if (line && originTime !== null) {
    const ranked = rows
      .filter((row) => normalizedString(row?.lineref) === line)
      .map((arrival) => ({
        arrival,
        delta: Math.abs(
          (finiteNumber(arrival?.originaimeddeparturetime) ??
            Number.POSITIVE_INFINITY) - originTime
        ),
      }))
      .filter((candidate) => candidate.delta <= 90)
      .sort((a, b) => a.delta - b.delta);

    if (ranked.length === 1) {
      return {
        status: "matched",
        arrival: ranked[0].arrival,
        matchedBy: "line-origin-time",
      };
    }

    if (ranked.length > 1) {
      if (ranked[1].delta - ranked[0].delta >= 30) {
        return {
          status: "matched",
          arrival: ranked[0].arrival,
          matchedBy: "line-origin-time",
        };
      }
      return { status: "ambiguous" };
    }
  }

  return { status: "absent" };
}

/**
 * @param {Arrival[] | null | undefined} arrivals
 * @param {RideArrivalIdentity | null | undefined} identity
 * @returns {RideArrivalMatch | null}
 */
export function matchRideArrival(arrivals, identity) {
  const result = resolveRideArrivalMatch(arrivals, identity);
  return result.status === "matched"
    ? { arrival: result.arrival, matchedBy: result.matchedBy }
    : null;
}

/**
 * @param {Arrival | null | undefined} arrival
 * @param {EpochSeconds | null | undefined} referenceTimeSec The server's
 *   clock, so the phone's own clock cannot skew the estimate.
 * @returns {number | null}
 */
export function arrivalEtaSeconds(arrival, referenceTimeSec) {
  const reference = finiteNumber(referenceTimeSec);
  if (!arrival || reference === null) return null;

  const epoch =
    finiteNumber(arrival.expectedarrivaltime) ??
    finiteNumber(arrival.expecteddeparturetime) ??
    finiteNumber(arrival.aimedarrivaltime) ??
    finiteNumber(arrival.aimeddeparturetime);

  return epoch === null ? null : Math.round(epoch - reference);
}

// A ride nobody ended: the passenger got off without tapping "I'm getting
// off", which is likely, since the alarm silences itself. Reopened hours
// later, it announced "Press STOP" again, and "Get off now" to someone
// waiting at that stop the next morning.
const RIDE_OVER_AFTER_SEC = 45 * 60;

/**
 * @param {RidePlan | null | undefined} plan
 * @param {EpochSeconds} nowSec
 * @returns {boolean}
 */
export function rideLongOver(plan, nowSec) {
  const targetEpoch = finiteNumber(plan?.targetPredictedEpochSec);
  const now = finiteNumber(nowSec);
  return (
    targetEpoch !== null && now !== null && now - targetEpoch > RIDE_OVER_AFTER_SEC
  );
}

/**
 * @param {RidePlan | null | undefined} plan
 * @param {EpochSeconds} nowSec
 * @returns {RidePlannedProgress}
 */
export function plannedRideProgress(plan, nowSec) {
  const now = finiteNumber(nowSec);
  if (!plan || now === null) {
    return { etaSec: null, remainingStops: null, beforeDeparture: false };
  }

  const targetEpoch = finiteNumber(plan.targetPredictedEpochSec);
  const etaSec = targetEpoch === null ? null : Math.round(targetEpoch - now);

  // Until the bus is due to leave the boarding stop, every stop is still
  // ahead, and counting them said "Your stop is next" on a one-stop ride set
  // up twenty minutes early. There is no count until then.
  const departureEpoch = finiteNumber(plan.boardingStop?.predictedEpochSec);
  const beforeDeparture = departureEpoch !== null && now < departureEpoch;

  const futureStops = Array.isArray(plan.stopsToTarget)
    ? plan.stopsToTarget.filter((stop) => {
        const predicted = finiteNumber(stop?.predictedEpochSec);
        return predicted === null || predicted >= now - 20;
      })
    : [];

  return {
    etaSec,
    remainingStops: beforeDeparture ? null : futureStops.length,
    beforeDeparture,
  };
}

// A fresh, accurate fix matched onto the trip's own shape: the only
// location evidence precise enough to place the passenger between stops.
/**
 * @param {RideSignals} signals
 * @returns {boolean}
 */
function shapeFixReliable(signals) {
  const gpsAccuracy = finiteNumber(signals.gpsAccuracyM);
  const gpsAge = finiteNumber(signals.gpsAgeSec);
  return (
    signals.gpsShapeUsable === true &&
    signals.gpsOnRoute === true &&
    finiteNumber(signals.gpsRouteDistanceM) !== null &&
    gpsAccuracy !== null &&
    gpsAccuracy <= 120 &&
    (gpsAge === null || gpsAge <= 60)
  );
}

// How far past a stop a fix must be to count as having left it: a bus
// standing at a long platform is still at it. A vague fix must be past it by
// its own accuracy too, or the phone may yet be standing there.
const LEFT_STOP_MARGIN_M = 40;
// Slower than this, the phone is standing or walking, not riding away.
const RIDING_AWAY_MPS = 2;

// One fix, on the route, clearly past a stop `stopRouteDistanceM` before the
// exit, and not standing still. The hook asks this of every fix, about the
// boarding stop and about the stop before the exit, and counts the answers.
//
// Pressing STOP asks for the next stop. Pressed before the bus leaves the
// stop before the exit, it stops the bus there instead and the request is
// spent, and a passenger who then waits for their stop rides past it. So
// "Press STOP now" needs evidence that the bus has left that stop: it was
// seen leaving it live, or fixes on the route are past it. A near exit alone
// is not that: in the city centre, stops are closer than the 600 m and 90 s
// that raise the stage.
/**
 * @param {RideSignals} [signals]
 * @param {number | null} [stopRouteDistanceM] Metres along the
 *   route from the stop to the exit.
 * @returns {boolean}
 */
export function fixLeftStop(signals = {}, stopRouteDistanceM) {
  const gpsRouteDistance = finiteNumber(signals.gpsRouteDistanceM);
  const stopRouteDistance = finiteNumber(stopRouteDistanceM);
  const accuracy = finiteNumber(signals.gpsAccuracyM);
  const speed = finiteNumber(signals.gpsSpeedMps);
  return (
    shapeFixReliable(signals) &&
    // Always true once the fix is reliable; says so to the type checker.
    gpsRouteDistance !== null &&
    stopRouteDistance !== null &&
    stopRouteDistance > 0 &&
    (speed === null || speed >= RIDING_AWAY_MPS) &&
    gpsRouteDistance <=
      stopRouteDistance - Math.max(LEFT_STOP_MARGIN_M, accuracy ?? 0)
  );
}

/**
 * @param {RideSignals & { currentAtLeastNext: boolean }} signals
 * @returns {RideStageDecision}
 */
function candidateStage(signals) {
  const liveEta = finiteNumber(signals.liveEtaSec);
  const scheduleEta = finiteNumber(signals.scheduleEtaSec);
  const remaining = finiteNumber(signals.remainingStops);
  const providerDistance = finiteNumber(signals.providerDistanceM);
  const providerAge = finiteNumber(signals.providerPositionAgeSec);
  const gpsDistance = finiteNumber(signals.gpsDistanceM);
  const gpsAccuracy = finiteNumber(signals.gpsAccuracyM);
  const gpsAge = finiteNumber(signals.gpsAgeSec);
  const gpsRouteDistance = finiteNumber(signals.gpsRouteDistanceM);
  const gpsRouteEta = finiteNumber(signals.gpsRouteEtaSec);

  const freshProviderPosition =
    providerDistance !== null &&
    providerAge !== null &&
    providerAge <= 120;
  // A fix is only evidence about where the passenger is now. Once the phone
  // stops reporting — tunnel, revoked permission, sleeping device — the last
  // known distance stays in state forever, and without this it could still
  // announce "get off now" many minutes and several kilometres later.
  const gpsFresh = gpsAge === null || gpsAge <= 60;
  const reliableGps =
    gpsDistance !== null &&
    gpsAccuracy !== null &&
    gpsAccuracy <= 120 &&
    gpsFresh;
  // The distance check always holds once the fix is reliable; it lets the
  // type checker see that the distance is a number wherever this is true.
  const reliableShapeGps =
    shapeFixReliable(signals) && gpsRouteDistance !== null;

  // The timetable is anchored at boarding, so it drifts by every minute the
  // bus loses in traffic. A fresh on-route fix is direct evidence about where
  // the passenger is right now, so a drifted clock is not allowed to raise
  // the alarm over it and send someone out a kilometre early. Straight-line
  // GPS does not count: 300 metres as the crow flies can be three kilometres
  // of one-way streets.
  // A page reloaded mid-ride starts with no live answer yet. Until the first
  // one comes back, or fails, the timetable alone may not raise the stage:
  // it said "Press STOP" two stops early for a bus running six minutes
  // late, and a stage is never taken back.
  const scheduleIsAuthoritative =
    liveEta === null && !reliableShapeGps && signals.scheduleMayRaise !== false;
  const scheduleSaysNext =
    scheduleIsAuthoritative &&
    ((remaining !== null && remaining <= 1) ||
      (scheduleEta !== null && scheduleEta <= 90));
  // Three stops out can still be eighteen minutes out where the last stops
  // are far apart, and "Get your things together" that early teaches the
  // passenger to ignore it. The count raises SOON only once the time is
  // near too, when there is a time.
  const scheduleSaysSoon =
    scheduleIsAuthoritative &&
    ((remaining !== null &&
      remaining <= 3 &&
      (scheduleEta === null || scheduleEta <= 420)) ||
      (scheduleEta !== null && scheduleEta <= 300));

  const shapeSaysNext =
    reliableShapeGps &&
    ((gpsRouteDistance >= -50 && gpsRouteDistance <= 600) ||
      (gpsRouteEta !== null && gpsRouteEta <= 90));
  const nextEvidence =
    signals.previousPassedConfirmed === true ||
    shapeSaysNext ||
    (liveEta !== null && liveEta <= 90) ||
    scheduleSaysNext;
  const nearEndOfRide =
    signals.currentAtLeastNext === true || nextEvidence;

  if (signals.targetAtStop === true) {
    return {
      stage: RIDE_STAGE.NOW,
      reason: "target-at-stop",
      confidence: "live",
    };
  }

  if (nearEndOfRide && freshProviderPosition && providerDistance <= 60) {
    return {
      stage: RIDE_STAGE.NOW,
      reason: "provider-near-target",
      confidence: "live",
    };
  }

  if (
    nearEndOfRide &&
    reliableShapeGps &&
    gpsRouteDistance >= -30 &&
    gpsRouteDistance <= 110
  ) {
    return {
      stage: RIDE_STAGE.NOW,
      reason: "gps-route-arrival",
      confidence: "location",
    };
  }

  if (
    nearEndOfRide &&
    signals.gpsShapeAvailable !== true &&
    reliableGps &&
    gpsDistance <= 60
  ) {
    return {
      stage: RIDE_STAGE.NOW,
      reason: "device-near-target",
      confidence: "location",
    };
  }

  if (nextEvidence) {
    const gpsDistanceNext =
      reliableShapeGps &&
      gpsRouteDistance >= -50 &&
      gpsRouteDistance <= 600;
    return {
      stage: RIDE_STAGE.NEXT,
      reason:
        signals.previousPassedConfirmed === true
          ? "previous-stop-passed"
          : gpsDistanceNext
            ? "gps-route-distance"
            : reliableShapeGps &&
                gpsRouteEta !== null &&
                gpsRouteEta <= 90
              ? "gps-route-eta"
              : liveEta !== null && liveEta <= 90
                ? "live-eta"
                : remaining !== null && remaining <= 1
                  ? "planned-stop-count"
                  : "schedule-fallback",
      confidence:
        signals.previousPassedConfirmed === true || liveEta !== null
          ? "live"
          : reliableShapeGps
            ? "location"
            : "schedule",
    };
  }

  const shapeSaysSoon =
    reliableShapeGps &&
    ((gpsRouteDistance >= 0 && gpsRouteDistance <= 1200) ||
      (gpsRouteEta !== null && gpsRouteEta <= 300));

  if (
    shapeSaysSoon ||
    (liveEta !== null && liveEta <= 300) ||
    scheduleSaysSoon
  ) {
    const gpsDistanceSoon =
      reliableShapeGps &&
      gpsRouteDistance >= 0 &&
      gpsRouteDistance <= 1200;
    return {
      stage: RIDE_STAGE.SOON,
      reason: gpsDistanceSoon
        ? "gps-route-distance"
        : reliableShapeGps &&
            gpsRouteEta !== null &&
            gpsRouteEta <= 300
          ? "gps-route-eta"
          : liveEta !== null && liveEta <= 300
            ? "live-eta"
            : remaining !== null && remaining <= 3
              ? "planned-stop-count"
              : "schedule-fallback",
      confidence: reliableShapeGps
        ? "location"
        : liveEta !== null
          ? "live"
          : "schedule",
    };
  }

  return {
    stage: RIDE_STAGE.BOARDED,
    reason: "tracking",
    confidence: "live",
  };
}

/**
 * @param {RideStage} currentStage
 * @param {RideSignals} [signals]
 * @returns {RideStageDecision} Monotonic except when a distinct fresh live
 *   observation for the same concrete ride arrives after MISSED and proves
 *   the bus is still at or approaching the target.
 */
export function evaluateRideStage(currentStage, signals = {}) {
  if (currentStage === RIDE_STAGE.MISSED) {
    const liveEta = finiteNumber(signals.liveEtaSec);
    const freshLiveContradiction =
      signals.liveTargetObservedAfterMiss === true &&
      signals.targetPassedConfirmed !== true &&
      (signals.targetAtStop === true || (liveEta !== null && liveEta >= 0));

    // MISSED is deliberately fail-closed. Timetable drift, GPS jitter, a
    // provider outage, or even the same old SIRI snapshot can never retract
    // it. Only a newer matched live target observation may correct a false
    // miss; candidateStage then resumes the ordinary safety thresholds.
    if (!freshLiveContradiction) {
      return {
        stage: currentStage,
        reason: "already-missed",
        confidence: "live",
      };
    }

    return candidateStage({ ...signals, currentAtLeastNext: false });
  }

  // Before the get-off alert has fired, the vehicle leaving the target means
  // the passenger is still aboard and has ridden past it.
  //
  // Once NOW has fired, the same evidence means the opposite. A passenger who
  // stepped off leaves behind exactly this: the bus departs the stop, and the
  // phone walks away from it. Treating that as a miss tells someone standing
  // at their own destination to get off at the next stop — the worst possible
  // advice for the person this feature exists for. After NOW, only positive
  // evidence of still travelling along the route past the target counts.
  //
  // Even that positive evidence has a walking twin: someone who got off and
  // walks on down the same street also ends up past the stop along the
  // route. Only riding pace tells the two apart, and without a speed from
  // the phone, only time does: a bus carrying someone on is well past the
  // stop within a minute and a half, where a walker is not.
  const reachedNow =
    rideStageRank(currentStage) >= rideStageRank(RIDE_STAGE.NOW);
  const speed = finiteNumber(signals.gpsSpeedMps);
  const stageAge = finiteNumber(signals.stageAgeSec);
  const stillRiding =
    speed !== null ? speed >= 3 : stageAge === null || stageAge <= 90;
  // Straight-line distance is not evidence of passing the stop when the
  // trip's shape is there to say where along the route the phone is: it
  // cannot raise NOW then either. A loop that swings back past the stop
  // looks exactly like having ridden on.
  const missedEvidence = reachedNow
    ? signals.gpsPassedTarget === true && stillRiding
    : signals.targetPassedConfirmed === true ||
      signals.gpsPassedTarget === true ||
      (signals.gpsMovedAwayAfterNear === true &&
        signals.gpsShapeAvailable !== true);

  if (
    rideStageRank(currentStage) >= rideStageRank(RIDE_STAGE.NEXT) &&
    missedEvidence
  ) {
    return {
      stage: RIDE_STAGE.MISSED,
      reason:
        !reachedNow && signals.targetPassedConfirmed === true
          ? "target-passed"
          : signals.gpsPassedTarget === true
            ? "gps-route-passed"
            : "device-moved-away",
      confidence:
        !reachedNow && signals.targetPassedConfirmed === true
          ? "live"
          : "location",
    };
  }

  const currentAtLeastNext =
    rideStageRank(currentStage) >= rideStageRank(RIDE_STAGE.NEXT);
  const candidate = candidateStage({ ...signals, currentAtLeastNext });

  return rideStageRank(candidate.stage) > rideStageRank(currentStage)
    ? candidate
    : {
        stage: currentStage,
        reason: signals.lastReason || "monotonic-hold",
        confidence: signals.lastConfidence || candidate.confidence,
      };
}
