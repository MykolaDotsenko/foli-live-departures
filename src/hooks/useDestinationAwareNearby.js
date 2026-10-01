import { useEffect, useMemo, useRef, useState } from "react";
import { fetchStopMonitor, fetchTripStopTimes } from "../api/foliApi";
import { classifyCatchability } from "../utils/catchability";
import { analyzeTripFit } from "../utils/destinationTripFit";
import { getDepartureTime } from "../utils/time";

/** @import { DestinationIntent, NearbyFitMap, NearbyDepartureFit, LiveState } from "../types/journey" */

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
function freshTargetArrival(monitor, tripRef) {
  const serverTime = Number(monitor?.serverTime);
  if (!Number.isFinite(serverTime) || serverTime <= 0) return null;

  const row = (Array.isArray(monitor?.arrivals) ? monitor.arrivals : []).find(
    (arrival) =>
      String(arrival?.tripref || "") === String(tripRef) &&
      arrival?.monitored === true
  );
  if (!row) return null;

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
 * @param {NearbyDepartureFit} candidate
 */
function effectiveArrivalAt(candidate) {
  const value = Number(
    candidate?.finalArrivalAt ?? candidate?.destinationArrivalAt
  );
  return Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY;
}

/**
 * @param {NearbyDepartureFit[]} candidates
 * @returns {NearbyDepartureFit | null}
 */
function chooseBestDeparture(candidates) {
  const usable = candidates
    .filter((candidate) => candidate.catchability !== "too-late")
    .sort((a, b) => {
      return (
        effectiveArrivalAt(a) - effectiveArrivalAt(b) ||
        a.departureAt - b.departureAt
      );
    });

  if (usable.length === 0) return null;

  const first = usable[0];
  if (first.catchability !== "tight") return first;

  // A connection with seconds of margin is not worth preferring over a
  // comfortably catchable bus arriving within five minutes of it.
  const safer = usable.find(
    (candidate) =>
      candidate.catchability !== "tight" &&
      candidate.catchability !== "unknown" &&
      Number.isFinite(effectiveArrivalAt(candidate)) &&
      Number.isFinite(effectiveArrivalAt(first)) &&
      effectiveArrivalAt(candidate) -
        effectiveArrivalAt(first) <=
        5 * 60
  );

  return safer || first;
}

/**
 * @param {{
 *   stops: readonly ({ id: string, distanceMeters?: number } & Record<string, any>)[],
 *   destination: DestinationIntent,
 *   positionAccuracy?: number | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<NearbyFitMap>}
 */
export async function loadDestinationAwareNearby({
  stops,
  destination,
  positionAccuracy = null,
  signal,
}) {
  const candidates = Array.isArray(stops) ? stops : [];
  if (!destination || candidates.length === 0) return {};

  const monitorResults = await Promise.allSettled(
    candidates.map((stop) => fetchStopMonitor(String(stop.id), signal))
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
        destinationStopDistances:
          destination.destinationStopDistances || null,
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
        finalWalkDistanceM: fit.finalWalkDistanceM ?? null,
        finalWalkDurationSec: fit.finalWalkDurationSec ?? null,
        finalArrivalAt:
          fit.rideDurationSec === null
            ? null
            : Number(departureAt) +
              fit.rideDurationSec +
              (fit.finalWalkDurationSec ?? 0),
        catchability,
        liveState: liveState(arrival, nowSec),
        rideDurationSec: fit.rideDurationSec,
      });
    }

    // Final-walk planning may consider many local destination platforms,
    // but realtime enrichment must stay bounded. Rank concrete departures
    // using the schedule/live-at-origin estimate, then enrich only the most
    // promising unique alighting stops. The remaining candidates still stay
    // eligible with their conservative propagated estimate.
    const targetIdsToEnrich = new Set();
    for (const candidate of compatible
      .slice()
      .sort(
        (left, right) =>
          effectiveArrivalAt(left) - effectiveArrivalAt(right) ||
          left.departureAt - right.departureAt
      )) {
      if (targetIdsToEnrich.size >= MAX_TARGET_MONITOR_LOOKUPS) break;
      if (candidate.destinationStopId) {
        targetIdsToEnrich.add(candidate.destinationStopId);
      }
    }

    await Promise.all(
      compatible.map(async (candidate) => {
        if (!targetIdsToEnrich.has(candidate.destinationStopId)) return;

        const destinationMonitor = await targetMonitor(
          candidate.destinationStopId
        );
        throwIfAborted(signal);

        const liveArrival = freshTargetArrival(
          destinationMonitor,
          candidate.tripRef
        );
        if (
          liveArrival !== null &&
          liveArrival >= candidate.departureAt
        ) {
          candidate.destinationArrivalAt = liveArrival;
          candidate.finalArrivalAt =
            liveArrival + (candidate.finalWalkDurationSec ?? 0);
          candidate.liveState = "live";
        }
      })
    );

    const best = chooseBestDeparture(compatible);
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
      compatible.length > 0 &&
      compatible.every((candidate) => candidate.catchability === "too-late")
    ) {
      status = "too-late";
    }
    else if (sawUnknown) status = "uncertain";
    else if (sawDestinationBehind) status = "other-direction";

    fits[String(stop.id)] = {
      stopId: String(stop.id),
      status,
      best,
      departures: compatible
        .slice()
        .sort(
          (left, right) =>
            (Number(left.finalArrivalAt ?? left.destinationArrivalAt) ||
              Number.POSITIVE_INFINITY) -
              (Number(right.finalArrivalAt ?? right.destinationArrivalAt) ||
                Number.POSITIVE_INFINITY) ||
            left.departureAt - right.departureAt
        ),
      additionalCount: Math.max(
        0,
        compatible.filter((candidate) => candidate !== best).length
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
 * }} input
 */
export default function useDestinationAwareNearby({
  stops,
  destination,
  positionAccuracy = null,
}) {
  /** @type {[NearbyFitMap, import("react").Dispatch<import("react").SetStateAction<NearbyFitMap>>]} */
  const [fitsByStop, setFitsByStop] = useState({});
  const [state, setState] = useState("idle");
  const requestRef = useRef({ stops, destination, positionAccuracy });
  requestRef.current = { stops, destination, positionAccuracy };

  const signature = useMemo(
    () =>
      destination
        ? [
            destination.id,
            destination.primaryStopId,
            ...destination.acceptableStopIds,
            ...Object.entries(
              destination.destinationStopDistances || {}
            )
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([id, distance]) => `${id}:${Math.round(Number(distance) || 0)}`),
            stops.map((stop) => stop.id).join(","),
            Math.round(Number(positionAccuracy) || 0),
          ].join("|")
        : "",
    [destination, positionAccuracy, stops]
  );

  useEffect(() => {
    const request = requestRef.current;
    if (!request.destination || request.stops.length === 0) {
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
        if (active) timer = window.setTimeout(run, REFRESH_MS);
      }
    };

    run();

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [signature]);

  return { fitsByStop, state };
}
