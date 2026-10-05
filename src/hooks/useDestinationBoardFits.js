import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTripStopTimes } from "../api/foliApi";
import { analyzeTripFit } from "../utils/destinationTripFit";
import { finalWalkSecondsByStop } from "../utils/placeDestination";

/** @import { DestinationIntent } from "../types/journey" */

const TRIP_BATCH_SIZE = 8;

/**
 * @typedef {{
 *   status: "compatible" | "other-direction" | "not-serving" | "unknown",
 *   destinationStopId: string,
 *   destinationStopSequence: number | null,
 *   rideDurationSec?: number | null,
 * }} BoardDestinationFit
 */

/**
 * @param {{
 *   stopId: string,
 *   arrivals: readonly any[],
 *   rowKeys: readonly string[],
 *   destination: DestinationIntent | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<Record<string, BoardDestinationFit>>}
 */
export async function loadDestinationBoardFits({
  stopId,
  arrivals,
  rowKeys,
  destination,
  signal,
}) {
  if (!destination || !stopId || arrivals.length === 0) return {};

  const tripIds = [
    ...new Set(
      arrivals
        .map((arrival) => String(arrival?.tripref || "").trim())
        .filter(Boolean)
    ),
  ];

  /** @type {Map<string, import("../types/foli").TripStopTime[] | null>} */
  const stopTimesByTrip = new Map();

  for (let index = 0; index < tripIds.length; index += TRIP_BATCH_SIZE) {
    if (signal?.aborted) {
      const error = new Error("The request was cancelled.");
      error.name = "AbortError";
      throw error;
    }

    const batch = tripIds.slice(index, index + TRIP_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((tripId) => fetchTripStopTimes(tripId, signal))
    );

    results.forEach((result, resultIndex) => {
      stopTimesByTrip.set(
        batch[resultIndex],
        result.status === "fulfilled" ? result.value : null
      );
    });
  }

  /** @type {Record<string, BoardDestinationFit>} */
  const fits = {};
  // A place's stops are weighed by the walk after them, as the planner
  // weighs them, so the board and the get-off alert name the stop it would.
  const destinationExtraSecByStop = finalWalkSecondsByStop(destination);

  arrivals.forEach((arrival, index) => {
    const rowKey = String(rowKeys[index] || "");
    if (!rowKey) return;

    const tripRef = String(arrival?.tripref || "").trim();
    const stopTimes = tripRef ? stopTimesByTrip.get(tripRef) : null;

    if (!tripRef || !stopTimes) {
      fits[rowKey] = {
        status: "unknown",
        destinationStopId: "",
        destinationStopSequence: null,
      };
      return;
    }

    const fit = analyzeTripFit({
      stopTimes,
      boardingStopId: String(stopId),
      boardingSequence: null,
      boardingAimedDepartureEpochSec: arrival?.aimeddeparturetime ?? null,
      destinationStopIds: destination.acceptableStopIds,
      destinationExtraSecByStop,
    });

    if (fit.compatible && fit.destination) {
      fits[rowKey] = {
        status: "compatible",
        destinationStopId: String(fit.destination.stopId),
        destinationStopSequence: Number.isFinite(
          Number(fit.destination.stopSequence)
        )
          ? Number(fit.destination.stopSequence)
          : null,
        rideDurationSec: fit.rideDurationSec,
      };
      return;
    }

    fits[rowKey] = {
      status:
        fit.reason === "destination-not-downstream"
          ? "other-direction"
          : "not-serving",
      destinationStopId: "",
      destinationStopSequence: null,
    };
  });

  return fits;
}

/**
 * @param {{
 *   stopId: string,
 *   arrivals: readonly any[],
 *   rowKeys: readonly string[],
 *   destination: DestinationIntent | null,
 * }} input
 */
export default function useDestinationBoardFits({
  stopId,
  arrivals,
  rowKeys,
  destination,
}) {
  const [fitsByRowKey, setFitsByRowKey] = useState({});
  const [state, setState] = useState("idle");
  const fitsForRef = useRef("");
  const requestRef = useRef({ stopId, arrivals, rowKeys, destination });
  requestRef.current = { stopId, arrivals, rowKeys, destination };

  const signature = useMemo(
    () =>
      destination
        ? [
            destination.id,
            destination.primaryStopId,
            ...destination.acceptableStopIds,
            stopId,
            ...arrivals.map(
              (arrival, index) =>
                `${rowKeys[index] || ""}:${arrival?.tripref || ""}:${arrival?.aimeddeparturetime || ""}`
            ),
          ].join("|")
        : "",
    [arrivals, destination, rowKeys, stopId]
  );

  useEffect(() => {
    const request = requestRef.current;
    if (
      !request.destination ||
      !request.stopId ||
      request.arrivals.length === 0
    ) {
      setFitsByRowKey({});
      setState("idle");
      fitsForRef.current = "";
      return undefined;
    }

    // While the same board is checked again after a bus has left, what it
    // knew stays up, so its answer does not blink away. Checked for another
    // stop or destination, it said a bus went somewhere it may not.
    const fitsFor = [
      request.stopId,
      request.destination.id,
      ...request.destination.acceptableStopIds,
    ].join("|");
    if (fitsForRef.current !== fitsFor) {
      fitsForRef.current = fitsFor;
      setFitsByRowKey({});
    }

    const controller = new AbortController();
    setState("loading");

    loadDestinationBoardFits({
      ...request,
      signal: controller.signal,
    })
      .then((fits) => {
        if (controller.signal.aborted) return;
        setFitsByRowKey(fits);
        setState("ready");
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError" ||
          error?.name === "CanceledError"
        ) {
          return;
        }
        setFitsByRowKey({});
        setState("error");
      });

    return () => controller.abort();
  }, [signature]);

  return { fitsByRowKey, state };
}
