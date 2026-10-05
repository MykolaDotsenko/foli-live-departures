import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchScheduledStopDepartures,
  fetchStopMonitor,
  fetchTripStopTimes,
} from "../api/foliApi";
import { classifyCatchability } from "../utils/catchability";
import { analyzeTripFit } from "../utils/destinationTripFit";
import { getDepartureTime } from "../utils/time";
import {
  estimateFinalWalkSeconds,
  finalWalkSecondsByStop,
} from "../utils/placeDestination";
import {
  compareJourneyTimeCandidates,
  journeyTimeAllows,
  normalizeJourneyTimeConstraint,
} from "../utils/journeyTime";

/** @import { DestinationIntent, JourneyTimeConstraint, NearbyFitMap, NearbyDepartureFit, LiveState } from "../types/journey" */

const REFRESH_MS = 30_000;
const MAX_DEPARTURES_PER_STOP = 16;
const MAX_TRIP_LOOKUPS = 96;
const MAX_TARGET_MONITOR_LOOKUPS = 8;
const TRIP_BATCH_SIZE = 8;

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  throw error;
}

/**
 * @param {any} arrival
 * @param {number} serverTime
 * @returns {LiveState}
 */
function liveState(arrival, serverTime) {
  if (arrival?.monitored !== true) return "schedule";
  const recorded = Number(arrival?.recordedattime);
  if (!Number.isFinite(recorded) || recorded <= 0) return "delayed";
  return serverTime - recorded <= 120 ? "live" : "delayed";
}

/**
 * Prefer a destination-stop prediction only while the provider observation
 * itself is fresh. Repeated stale HTTP responses therefore age out naturally.
 *
 * @param {any} monitor
 * @param {string} tripRef
 * @returns {number | null}
 */
/**
 * @param {NearbyDepartureFit} candidate
 * @returns {number}
 */
function journeyArrivalRank(candidate) {
  const journeyArrival = Number(candidate.journeyArrivalAt);
  if (Number.isFinite(journeyArrival) && journeyArrival > 0) {
    return journeyArrival;
  }

  const stopArrival = Number(candidate.destinationArrivalAt);
  return Number.isFinite(stopArrival) && stopArrival > 0
    ? stopArrival
    : Number.POSITIVE_INFINITY;
}

/**
 * @param {NearbyDepartureFit} candidate
 * @param {DestinationIntent} destination
 */
function applyFinalWalk(candidate, destination) {
  const rawDistance =
    destination.finalWalkDistanceByStop?.[candidate.destinationStopId];
  const distance = Number(rawDistance);
  const walkSeconds = estimateFinalWalkSeconds(rawDistance);

  candidate.finalWalkDistanceM =
    Number.isFinite(distance) && distance >= 0 ? distance : null;
  candidate.finalWalkSecEstimate = walkSeconds;

  const stopArrival = Number(candidate.destinationArrivalAt);
  candidate.journeyArrivalAt =
    Number.isFinite(stopArrival) && stopArrival > 0
      ? stopArrival + (walkSeconds || 0)
      : null;
}

function freshTargetArrival(monitor, candidate) {
  const serverTime = Number(monitor?.serverTime);
  if (!Number.isFinite(serverTime) || serverTime <= 0) return null;

  const plannedTarget =
    Number.isFinite(Number(candidate?.aimedDepartureAt)) &&
    Number.isFinite(Number(candidate?.rideDurationSec))
      ? Number(candidate.aimedDepartureAt) + Number(candidate.rideDurationSec)
      : null;
  const plannedOrigin = Number(candidate?.originAimedDepartureAt);

  const matches = (Array.isArray(monitor?.arrivals) ? monitor.arrivals : [])
    .filter(
      (row) =>
        String(row?.tripref || "") === String(candidate?.tripRef || "") &&
        row?.monitored === true
    )
    .filter((row) => {
      const rowOrigin = Number(row?.originaimeddeparturetime);
      if (
        Number.isFinite(plannedOrigin) &&
        plannedOrigin > 0 &&
        Number.isFinite(rowOrigin) &&
        rowOrigin > 0 &&
        Math.abs(rowOrigin - plannedOrigin) > 60
      ) {
        return false;
      }

      const rowTarget = Number(
        row?.aimedarrivaltime ?? row?.aimeddeparturetime
      );
      return !(
        plannedTarget !== null &&
        Number.isFinite(rowTarget) &&
        rowTarget > 0 &&
        Math.abs(rowTarget - plannedTarget) > 10 * 60
      );
    });

  if (matches.length === 0) return null;

  let row = matches[0];
  if (matches.length > 1) {
    if (plannedTarget === null) return null;

    const ranked = matches
      .map((item) => {
        const aimed = Number(
          item?.aimedarrivaltime ?? item?.aimeddeparturetime
        );
        return {
          item,
          delta:
            Number.isFinite(aimed) && aimed > 0
              ? Math.abs(aimed - plannedTarget)
              : Number.POSITIVE_INFINITY,
        };
      })
      .sort((left, right) => left.delta - right.delta);

    if (
      !Number.isFinite(ranked[0].delta) ||
      ranked[0].delta > 10 * 60 ||
      ranked[1]?.delta === ranked[0].delta
    ) {
      return null;
    }
    row = ranked[0].item;
  }

  const recordedAt = Number(row.recordedattime);
  if (
    !Number.isFinite(recordedAt) ||
    recordedAt <= 0 ||
    serverTime - recordedAt > 120
  ) {
    return null;
  }

  const expectedArrival = Number(row.expectedarrivaltime);
  if (Number.isFinite(expectedArrival) && expectedArrival > 0) {
    return expectedArrival;
  }

  const expectedDeparture = Number(row.expecteddeparturetime);
  return Number.isFinite(expectedDeparture) && expectedDeparture > 0
    ? expectedDeparture
    : null;
}

/**
 * @param {NearbyDepartureFit[]} candidates
 * @returns {NearbyDepartureFit | null}
 */
function chooseBestDeparture(candidates, timeConstraint = null) {
  const usable = candidates
    .filter((candidate) => candidate.catchability !== "too-late")
    .sort((a, b) =>
      compareJourneyTimeCandidates(a, b, timeConstraint) ||
      journeyArrivalRank(a) - journeyArrivalRank(b)
    );

  if (usable.length === 0) return null;

  const first = usable[0];
  if (first.catchability !== "tight") return first;

  // A connection with seconds of margin is not worth preferring over a
  // comfortably catchable bus arriving within five minutes of it.
  const safer = usable.find(
    (candidate) =>
      candidate.catchability !== "tight" &&
      candidate.catchability !== "unknown" &&
      Number.isFinite(journeyArrivalRank(candidate)) &&
      Number.isFinite(journeyArrivalRank(first)) &&
      journeyArrivalRank(candidate) -
        journeyArrivalRank(first) <=
        5 * 60
  );

  return safer || first;
}

/**
 * @param {{
 *   stops: readonly ({ id: string, distanceMeters?: number } & Record<string, any>)[],
 *   destination: DestinationIntent,
 *   positionAccuracy?: number | null,
 *   journeyPlan?: import("../types/journey").JourneyPlan | null,
 *   timeConstraint?: JourneyTimeConstraint | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<NearbyFitMap>}
 */
export async function loadDestinationAwareNearby({
  stops,
  destination,
  positionAccuracy = null,
  journeyPlan = null,
  timeConstraint = null,
  signal,
}) {
  const candidates = Array.isArray(stops) ? stops : [];
  if (!destination || candidates.length === 0) return {};

  const effectiveTimeConstraint = journeyPlan || timeConstraint;
  const normalizedTime = normalizeJourneyTimeConstraint(effectiveTimeConstraint);
  if (!normalizedTime.valid) return {};
  const scheduledPlanning = normalizedTime.mode !== "leave-now";

  const destinationExtraSecByStop = finalWalkSecondsByStop(destination);

  const monitorResults = await Promise.allSettled(
    candidates.map(async (stop) => {
      if (!scheduledPlanning) {
        return fetchStopMonitor(String(stop.id), signal);
      }

      const schedule = await fetchScheduledStopDepartures(
        String(stop.id),
        normalizedTime.referenceTimeSec,
        signal
      );
      return {
        stopName: String(stop.name || stop.id),
        arrivals: schedule.departures || [],
        serverTime: normalizedTime.referenceTimeSec,
        realtimeAvailable: false,
        scheduleAvailable: true,
        scheduleFailed: false,
        scheduleIncomplete: schedule.complete === false,
      };
    })
  );
  throwIfAborted(signal);

  // Round-robin across stops so an expanded dense-hub search does not let
  // the nearest platforms consume the entire trip-detail budget. The cap is
  // the same order of work as the original six-stop P0 worst case.
  const uniqueTripIds = new Set();
  for (
    let departureIndex = 0;
    departureIndex < MAX_DEPARTURES_PER_STOP &&
    uniqueTripIds.size < MAX_TRIP_LOOKUPS;
    departureIndex += 1
  ) {
    for (const result of monitorResults) {
      if (
        result.status !== "fulfilled" ||
        uniqueTripIds.size >= MAX_TRIP_LOOKUPS
      ) {
        continue;
      }

      const arrival = result.value.arrivals[departureIndex];
      const tripId = String(arrival?.tripref || "");
      if (tripId) uniqueTripIds.add(tripId);
    }
  }

  /** @type {Map<string, import("../types/foli").TripStopTime[] | null>} */
  const tripTimes = new Map();
  const ids = [...uniqueTripIds];

  for (let index = 0; index < ids.length; index += TRIP_BATCH_SIZE) {
    const batch = ids.slice(index, index + TRIP_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((tripId) => fetchTripStopTimes(tripId, signal))
    );
    throwIfAborted(signal);

    batchResults.forEach((result, resultIndex) => {
      tripTimes.set(
        batch[resultIndex],
        result.status === "fulfilled" ? result.value : null
      );
    });
  }

  /** @type {NearbyFitMap} */
  const fits = {};
  /** @type {Map<string, Promise<any | null>>} */
  const targetMonitorPromises = new Map();

  const targetMonitor = (stopId) => {
    const id = String(stopId || "");
    if (!id) return Promise.resolve(null);

    if (!targetMonitorPromises.has(id)) {
      targetMonitorPromises.set(
        id,
        fetchStopMonitor(id, signal).catch(() => null)
      );
    }
    return targetMonitorPromises.get(id);
  };

  for (let stopIndex = 0; stopIndex < candidates.length; stopIndex += 1) {
    const stop = candidates[stopIndex];
    const monitorResult = monitorResults[stopIndex];
    if (monitorResult.status !== "fulfilled") {
      fits[String(stop.id)] = {
        stopId: String(stop.id),
        status: "unavailable",
        best: null,
        departures: [],
        additionalCount: 0,
        checkedAt: Date.now(),
      };
      continue;
    }

    const monitor = monitorResult.value;
    const nowSec =
      Number.isFinite(Number(monitor.serverTime)) &&
      Number(monitor.serverTime) > 0
        ? Number(monitor.serverTime)
        : Math.floor(Date.now() / 1000);

    /** @type {NearbyDepartureFit[]} */
    const compatible = [];
    let sawDestinationBehind = false;
    let sawUnknown = false;

    for (const arrival of monitor.arrivals.slice(0, MAX_DEPARTURES_PER_STOP)) {
      const departureAt = getDepartureTime(arrival, nowSec);
      if (
        !Number.isFinite(departureAt) ||
        Number(departureAt) < nowSec - 30
      ) {
        continue;
      }

      const tripRef = String(arrival?.tripref || "");
      if (!tripRef) {
        sawUnknown = true;
        continue;
      }

      const stopTimes = tripTimes.get(tripRef);
      if (!stopTimes) {
        sawUnknown = true;
        continue;
      }

      const fit = analyzeTripFit({
        stopTimes,
        boardingStopId: String(stop.id),
        boardingSequence: null,
        boardingAimedDepartureEpochSec: arrival?.aimeddeparturetime ?? null,
        destinationStopIds: destination.acceptableStopIds,
        destinationExtraSecByStop,
      });

      if (!fit.compatible) {
        if (fit.reason === "destination-not-downstream") {
          sawDestinationBehind = true;
        }
        continue;
      }

      const catchability = classifyCatchability({
        distanceM: Number(stop.distanceMeters),
        accuracyM: positionAccuracy,
        departureAtSec: Number(departureAt),
        nowSec,
      });

      compatible.push({
        tripRef,
        lineRef: String(arrival?.lineref || ""),
        destinationStopId: String(fit.destination?.stopId || ""),
        departureAt: Number(departureAt),
        aimedDepartureAt:
          Number.isFinite(Number(arrival?.aimeddeparturetime)) &&
          Number(arrival.aimeddeparturetime) > 0
            ? Number(arrival.aimeddeparturetime)
            : null,
        originAimedDepartureAt:
          Number.isFinite(Number(arrival?.originaimeddeparturetime)) &&
          Number(arrival.originaimeddeparturetime) > 0
            ? Number(arrival.originaimeddeparturetime)
            : null,
        destinationArrivalAt:
          fit.rideDurationSec === null
            ? null
            : Number(departureAt) + fit.rideDurationSec,
        catchability,
        liveState: liveState(arrival, nowSec),
        rideDurationSec: fit.rideDurationSec,
      });
    }

    compatible.forEach((candidate) =>
      applyFinalWalk(candidate, destination)
    );

    // External-place planning may consider many destination platforms, but
    // realtime target polling must stay bounded. Keep every candidate
    // eligible with schedule/propagated timing and enrich only the strongest
    // unique alighting stops.
    const targetIdsToEnrich = new Set();
    for (const candidate of compatible
      .slice()
      .sort(
        (left, right) =>
          journeyArrivalRank(left) - journeyArrivalRank(right) ||
          left.departureAt - right.departureAt
      )) {
      if (targetIdsToEnrich.size >= MAX_TARGET_MONITOR_LOOKUPS) break;
      if (candidate.destinationStopId) {
        targetIdsToEnrich.add(candidate.destinationStopId);
      }
    }

    if (!scheduledPlanning) {
      await Promise.all(
        compatible.map(async (candidate) => {
          if (!targetIdsToEnrich.has(candidate.destinationStopId)) return;

          const destinationMonitor = await targetMonitor(
            candidate.destinationStopId
          );
          throwIfAborted(signal);

          const liveArrival = freshTargetArrival(
            destinationMonitor,
            candidate
          );
          if (
            liveArrival !== null &&
            liveArrival >= candidate.departureAt
          ) {
            candidate.destinationArrivalAt = liveArrival;
            candidate.liveState = "live";
          }
          applyFinalWalk(candidate, destination);
        })
      );
    }

    const timeCompatible = compatible.filter((candidate) =>
      journeyTimeAllows(candidate, effectiveTimeConstraint, nowSec)
    );
    const best = chooseBestDeparture(timeCompatible, effectiveTimeConstraint);
    /** @type {import("../types/journey").NearbyFitStatus} */
    let status = "no-direct";
    if (best) {
      status =
        best.catchability === "tight"
          ? "tight"
          : best.catchability === "unknown"
            ? "uncertain"
            : "good";
    }
    else if (
      timeCompatible.length > 0 &&
      timeCompatible.every((candidate) => candidate.catchability === "too-late")
    ) {
      status = "too-late";
    }
    else if (sawUnknown) status = "uncertain";
    else if (sawDestinationBehind) status = "other-direction";

    fits[String(stop.id)] = {
      stopId: String(stop.id),
      status,
      best,
      departures: timeCompatible
        .slice()
        .sort((left, right) =>
          compareJourneyTimeCandidates(left, right, effectiveTimeConstraint) ||
          journeyArrivalRank(left) - journeyArrivalRank(right)
        ),
      additionalCount: Math.max(
        0,
        timeCompatible.filter((candidate) => candidate !== best).length
      ),
      checkedAt: Date.now(),
    };
  }

  return fits;
}

/**
 * @param {{
 *   stops: readonly any[],
 *   destination: DestinationIntent | null,
 *   positionAccuracy?: number | null,
 *   journeyPlan?: import("../types/journey").JourneyPlan | null,
 *   timeConstraint?: JourneyTimeConstraint | null,
 * }} input
 */
export default function useDestinationAwareNearby({
  stops,
  destination,
  positionAccuracy = null,
  journeyPlan = null,
  timeConstraint = null,
}) {
  /** @type {[NearbyFitMap, import("react").Dispatch<import("react").SetStateAction<NearbyFitMap>>]} */
  const [fitsByStop, setFitsByStop] = useState({});
  const [state, setState] = useState("idle");
  const effectiveTimeConstraint = journeyPlan || timeConstraint;
  const requestRef = useRef({
    stops,
    destination,
    positionAccuracy,
    journeyPlan,
    timeConstraint: effectiveTimeConstraint,
  });
  requestRef.current = {
    stops,
    destination,
    positionAccuracy,
    journeyPlan,
    timeConstraint: effectiveTimeConstraint,
  };

  const signature = useMemo(
    () =>
      destination
        ? [
            destination.id,
            destination.primaryStopId,
            ...destination.acceptableStopIds,
            stops.map((stop) => stop.id).join(","),
            Math.round(Number(positionAccuracy) || 0),
            effectiveTimeConstraint?.mode || "leave-now",
            effectiveTimeConstraint?.targetTimeSec || "",
          ].join("|")
        : "",
    [
      destination,
      positionAccuracy,
      stops,
      effectiveTimeConstraint?.mode,
      effectiveTimeConstraint?.targetTimeSec,
    ]
  );

  useEffect(() => {
    if (!requestRef.current.destination || requestRef.current.stops.length === 0) {
      setFitsByStop({});
      setState("idle");
      return undefined;
    }

    let active = true;
    let timer = 0;
    let controller = new AbortController();
    setFitsByStop({});
    setState("loading");

    const run = async () => {
      controller.abort();
      controller = new AbortController();

      try {
        // The polling identity intentionally ignores distance-only object
        // churn, but each refresh must still use the latest distances and
        // destination metadata. Capturing the first request here left
        // catchability frozen while the passenger walked toward the stop.
        const request = requestRef.current;
        const next = await loadDestinationAwareNearby({
          ...request,
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        setFitsByStop(next);
        setState("ready");
      } catch (error) {
        if (
          !active ||
          controller.signal.aborted ||
          error?.name === "AbortError" ||
          error?.name === "CanceledError"
        ) {
          return;
        }
        setState("error");
      } finally {
        if (active) timer = window.setTimeout(tick, REFRESH_MS);
      }
    };

    // Realtime is polled only while the page is seen. Hidden, a refresh
    // that falls due waits, and runs as soon as the page is back.
    let refreshWaiting = false;
    const tick = () => {
      if (document.visibilityState === "hidden") {
        refreshWaiting = true;
        return;
      }
      run();
    };
    const handleVisibilityChange = () => {
      if (!active || !refreshWaiting) return;
      if (document.visibilityState === "hidden") return;
      refreshWaiting = false;
      window.clearTimeout(timer);
      run();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    run();

    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controller.abort();
    };
  }, [signature]);

  return { fitsByStop, state };
}
