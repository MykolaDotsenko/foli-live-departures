import { useEffect, useMemo, useState } from "react";
import { fetchStopMonitor, fetchTripStopTimes } from "../api/foliApi";
import { classifyCatchability } from "../utils/catchability";
import { analyzeTripFit } from "../utils/destinationTripFit";
import { getDepartureTime } from "../utils/time";

/** @import { DestinationIntent, NearbyFitMap, NearbyDepartureFit, LiveState } from "../types/journey" */

const REFRESH_MS = 30_000;
const MAX_DEPARTURES_PER_STOP = 16;
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
 * @param {NearbyDepartureFit[]} candidates
 * @returns {NearbyDepartureFit | null}
 */
function chooseBestDeparture(candidates) {
  const usable = candidates
    .filter((candidate) => candidate.catchability !== "too-late")
    .sort((a, b) => {
      const left = Number.isFinite(a.destinationArrivalAt)
        ? Number(a.destinationArrivalAt)
        : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(b.destinationArrivalAt)
        ? Number(b.destinationArrivalAt)
        : Number.POSITIVE_INFINITY;
      return left - right || a.departureAt - b.departureAt;
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
      Number.isFinite(candidate.destinationArrivalAt) &&
      Number.isFinite(first.destinationArrivalAt) &&
      Number(candidate.destinationArrivalAt) -
        Number(first.destinationArrivalAt) <=
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

  const uniqueTripIds = new Set();
  monitorResults.forEach((result) => {
    if (result.status !== "fulfilled") return;
    for (const arrival of result.value.arrivals.slice(
      0,
      MAX_DEPARTURES_PER_STOP
    )) {
      const tripId = String(arrival?.tripref || "");
      if (tripId) uniqueTripIds.add(tripId);
    }
  });

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

  candidates.forEach((stop, stopIndex) => {
    const monitorResult = monitorResults[stopIndex];
    if (monitorResult.status !== "fulfilled") {
      fits[String(stop.id)] = {
        stopId: String(stop.id),
        status: "unavailable",
        best: null,
        additionalCount: 0,
        checkedAt: Date.now(),
      };
      return;
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
        destinationArrivalAt:
          fit.rideDurationSec === null
            ? null
            : Number(departureAt) + fit.rideDurationSec,
        catchability,
        liveState: liveState(arrival, nowSec),
        rideDurationSec: fit.rideDurationSec,
      });
    }

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
      additionalCount: Math.max(
        0,
        compatible.filter((candidate) => candidate !== best).length
      ),
      checkedAt: Date.now(),
    };
  });

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

  const signature = useMemo(
    () =>
      destination
        ? `${destination.id}|${stops
            .map((stop) => stop.id)
            .join(",")}|${Math.round(Number(positionAccuracy) || 0)}`
        : "",
    [destination, positionAccuracy, stops]
  );

  useEffect(() => {
    if (!destination || stops.length === 0) {
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
          stops,
          destination,
          positionAccuracy,
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
  }, [destination, positionAccuracy, signature, stops]);

  return { fitsByStop, state };
}
