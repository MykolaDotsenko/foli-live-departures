import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchScheduledStopDepartures,
  fetchStopMonitor,
  fetchTripStopTimes,
} from "../api/foliApi";
import { classifyCatchability } from "../utils/catchability";
import { analyzeTripFit } from "../utils/destinationTripFit";
import { estimateFinalWalkSeconds } from "../utils/placeDestination";
import { getDepartureTime } from "../utils/time";
import {
  downstreamTransferOccurrences,
  transferBoardingCandidates,
} from "../utils/transferTopology";
import { assessTransfer } from "../utils/transferFeasibility";

/** @import { DestinationIntent, LiveState, TransferJourneyOption } from "../types/journey" */

const REFRESH_MS = 30_000;
const MAX_FIRST_DEPARTURES_PER_STOP = 4;
const MAX_FIRST_TRIPS = 18;
const FIRST_TRIP_BATCH = 6;
const MAX_TRANSFER_OCCURRENCES_PER_TRIP = 6;
const MAX_TRANSFER_TIMETABLE_LOOKUPS = 8;
const MAX_OUTGOING_PER_TRANSFER = 8;
const MAX_SECOND_TRIPS = 32;
const SECOND_TRIP_BATCH = 6;
const MAX_CONNECTION_POINTS = 96;
const MAX_OPTIONS = 3;
const TRANSFER_BUCKET_SEC = 5 * 60;

const TRANSFER_RISK_RANK = {
  comfortable: 0,
  acceptable: 1,
  tight: 2,
  unlikely: 3,
  broken: 4,
  unknown: 5,
};

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  throw error;
}

/** @param {any} arrival @param {number} serverTime @returns {LiveState} */
function observedLiveState(arrival, serverTime) {
  if (arrival?.monitored !== true) return "schedule";
  const recorded = Number(arrival?.recordedattime);
  if (!Number.isFinite(recorded) || recorded <= 0) return "delayed";
  return serverTime - recorded <= 120 ? "live" : "delayed";
}

/** @param {unknown} value */
function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** @param {string} stopId @param {any[]} stops */
function stopName(stopId, stops) {
  const stop = stops.find((item) => String(item?.id || "") === String(stopId));
  return String(stop?.name || stopId);
}

/**
 * Bounded client-side one-transfer search. It is deliberately invoked only
 * when direct Journey Assistant options are absent.
 *
 * @param {{
 *   originStops: readonly any[],
 *   allStops: readonly any[],
 *   destination: DestinationIntent,
 *   positionAccuracy?: number | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<TransferJourneyOption[]>}
 */
export async function loadTransferJourneyOptions({
  originStops,
  allStops,
  destination,
  positionAccuracy = null,
  signal,
}) {
  const origins = Array.isArray(originStops) ? originStops : [];
  const networkStops = Array.isArray(allStops) ? allStops : [];
  if (!destination || origins.length === 0) return [];

  const monitorResults = await Promise.allSettled(
    origins.map((stop) => fetchStopMonitor(String(stop.id), signal))
  );
  throwIfAborted(signal);

  const firstCandidates = [];
  const seenFirstTrips = new Set();

  for (
    let departureIndex = 0;
    departureIndex < MAX_FIRST_DEPARTURES_PER_STOP &&
    firstCandidates.length < MAX_FIRST_TRIPS;
    departureIndex += 1
  ) {
    for (let stopIndex = 0; stopIndex < origins.length; stopIndex += 1) {
      if (firstCandidates.length >= MAX_FIRST_TRIPS) break;
      const monitorResult = monitorResults[stopIndex];
      if (monitorResult.status !== "fulfilled") continue;

      const stop = origins[stopIndex];
      const monitor = monitorResult.value;
      const arrival = monitor.arrivals?.[departureIndex];
      if (!arrival) continue;

      const tripRef = String(arrival.tripref || "");
      if (!tripRef || seenFirstTrips.has(tripRef)) continue;

      const nowSec =
        Number.isFinite(Number(monitor.serverTime)) &&
        Number(monitor.serverTime) > 0
          ? Number(monitor.serverTime)
          : Math.floor(Date.now() / 1000);
      const departureAt = getDepartureTime(arrival, nowSec);
      if (!Number.isFinite(departureAt) || Number(departureAt) < nowSec - 30) {
        continue;
      }

      const catchability = classifyCatchability({
        distanceM: Number(stop.distanceMeters),
        accuracyM: positionAccuracy,
        departureAtSec: Number(departureAt),
        nowSec,
      });
      if (catchability === "too-late" || catchability === "unknown") continue;

      seenFirstTrips.add(tripRef);
      firstCandidates.push({
        stop,
        arrival,
        tripRef,
        departureAt: Number(departureAt),
        catchability,
        liveState: observedLiveState(arrival, nowSec),
      });
    }
  }

  if (firstCandidates.length === 0) return [];

  const firstTimes = new Map();
  for (let index = 0; index < firstCandidates.length; index += FIRST_TRIP_BATCH) {
    const batch = firstCandidates.slice(index, index + FIRST_TRIP_BATCH);
    const results = await Promise.allSettled(
      batch.map((item) => fetchTripStopTimes(item.tripRef, signal))
    );
    throwIfAborted(signal);
    results.forEach((result, resultIndex) => {
      firstTimes.set(
        batch[resultIndex].tripRef,
        result.status === "fulfilled" ? result.value : null
      );
    });
  }

  const connectionPoints = [];
  for (const first of firstCandidates) {
    const stopTimes = firstTimes.get(first.tripRef);
    if (!stopTimes) continue;

    const occurrences = downstreamTransferOccurrences({
      stopTimes,
      boardingStopId: String(first.stop.id),
      boardingAimedDepartureEpochSec:
        first.arrival?.aimeddeparturetime ?? first.departureAt,
      maxOccurrences: MAX_TRANSFER_OCCURRENCES_PER_TRIP,
    });

    for (const occurrence of occurrences) {
      const incomingArrivalAt =
        first.departureAt + Number(occurrence.rideDurationSec);
      const boards = transferBoardingCandidates({
        alightStopId: occurrence.stopId,
        stops: networkStops,
      });

      for (const board of boards) {
        const bucketRef =
          Math.floor(incomingArrivalAt / TRANSFER_BUCKET_SEC) *
          TRANSFER_BUCKET_SEC;
        connectionPoints.push({
          first,
          occurrence,
          board,
          incomingArrivalAt,
          scheduleKey: `${board.stopId}:${bucketRef}`,
          bucketRef,
        });
        if (connectionPoints.length >= MAX_CONNECTION_POINTS) break;
      }
      if (connectionPoints.length >= MAX_CONNECTION_POINTS) break;
    }
    if (connectionPoints.length >= MAX_CONNECTION_POINTS) break;
  }

  connectionPoints.sort(
    (left, right) =>
      left.incomingArrivalAt - right.incomingArrivalAt ||
      Number(right.board.sameStop) - Number(left.board.sameStop) ||
      left.board.walkingDistanceM - right.board.walkingDistanceM
  );

  const selectedScheduleKeys = new Set();
  const scheduleRequests = new Map();
  for (const point of connectionPoints) {
    if (selectedScheduleKeys.has(point.scheduleKey)) continue;
    if (selectedScheduleKeys.size >= MAX_TRANSFER_TIMETABLE_LOOKUPS) break;
    selectedScheduleKeys.add(point.scheduleKey);
    scheduleRequests.set(point.scheduleKey, {
      stopId: point.board.stopId,
      reference: point.bucketRef,
    });
  }

  const scheduleEntries = [...scheduleRequests.entries()];
  const scheduleResults = await Promise.allSettled(
    scheduleEntries.map(([, request]) =>
      fetchScheduledStopDepartures(
        request.stopId,
        request.reference,
        signal
      )
    )
  );
  throwIfAborted(signal);

  const schedules = new Map();
  scheduleResults.forEach((result, index) => {
    schedules.set(
      scheduleEntries[index][0],
      result.status === "fulfilled" ? result.value : null
    );
  });

  const outgoingSeeds = [];
  for (const point of connectionPoints) {
    if (!selectedScheduleKeys.has(point.scheduleKey)) continue;
    const schedule = schedules.get(point.scheduleKey);
    if (!schedule) continue;

    const departures = (schedule.departures || [])
      .filter(
        (row) =>
          Number(row?.aimeddeparturetime) >= point.incomingArrivalAt &&
          String(row?.tripref || "") !== point.first.tripRef
      )
      .slice(0, MAX_OUTGOING_PER_TRANSFER);

    for (const outgoing of departures) {
      const feasibility = assessTransfer({
        incomingArrivalAt: point.incomingArrivalAt,
        outgoingDepartureAt: outgoing.aimeddeparturetime,
        walkingDistanceM: point.board.walkingDistanceM,
        sameStop: point.board.sameStop,
        incomingLiveState: point.first.liveState,
      });
      if (!feasibility.recommendable) continue;

      outgoingSeeds.push({
        ...point,
        outgoing,
        feasibility,
      });
    }
  }

  outgoingSeeds.sort(
    (left, right) =>
      Number(left.outgoing.aimeddeparturetime) -
        Number(right.outgoing.aimeddeparturetime) ||
      (TRANSFER_RISK_RANK[left.feasibility.state] ?? 9) -
        (TRANSFER_RISK_RANK[right.feasibility.state] ?? 9)
  );

  const secondTripIds = [
    ...new Set(
      outgoingSeeds
        .map((seed) => String(seed.outgoing?.tripref || ""))
        .filter(Boolean)
    ),
  ].slice(0, MAX_SECOND_TRIPS);
  const allowedSecondTrips = new Set(secondTripIds);
  const secondTimes = new Map();

  for (let index = 0; index < secondTripIds.length; index += SECOND_TRIP_BATCH) {
    const batch = secondTripIds.slice(index, index + SECOND_TRIP_BATCH);
    const results = await Promise.allSettled(
      batch.map((tripId) => fetchTripStopTimes(tripId, signal))
    );
    throwIfAborted(signal);
    results.forEach((result, resultIndex) => {
      secondTimes.set(
        batch[resultIndex],
        result.status === "fulfilled" ? result.value : null
      );
    });
  }

  const candidates = [];
  const seen = new Set();

  for (const seed of outgoingSeeds) {
    const secondTripRef = String(seed.outgoing?.tripref || "");
    if (!allowedSecondTrips.has(secondTripRef)) continue;
    const stopTimes = secondTimes.get(secondTripRef);
    if (!stopTimes) continue;

    const fit = analyzeTripFit({
      stopTimes,
      boardingStopId: seed.board.stopId,
      boardingAimedDepartureEpochSec: seed.outgoing.aimeddeparturetime,
      destinationStopIds: destination.acceptableStopIds,
      destinationExtraSecByStop: null,
    });
    if (!fit.compatible || fit.rideDurationSec === null) continue;

    const secondDepartureAt = Number(seed.outgoing.aimeddeparturetime);
    const destinationArrivalAt =
      secondDepartureAt + Number(fit.rideDurationSec);
    const destinationStopId = String(fit.destination?.stopId || "");
    const finalWalkDistanceM = finiteNonNegative(
      destination.finalWalkDistanceByStop?.[destinationStopId]
    );
    const finalWalkSecEstimate = estimateFinalWalkSeconds(finalWalkDistanceM);
    const journeyArrivalAt =
      destinationArrivalAt + (finalWalkSecEstimate || 0);
    const originDistance = finiteNonNegative(seed.first.stop.distanceMeters) || 0;
    const transferDistance =
      finiteNonNegative(seed.board.walkingDistanceM) || 0;
    const finalDistance = finalWalkDistanceM || 0;

    const id = [
      seed.first.stop.id,
      seed.first.tripRef,
      seed.first.arrival?.aimeddeparturetime || seed.first.departureAt,
      seed.occurrence.stopId,
      seed.occurrence.stopSequence,
      seed.board.stopId,
      secondTripRef,
      secondDepartureAt,
      destinationStopId,
    ].join(":");
    if (seen.has(id)) continue;
    seen.add(id);

    candidates.push({
      id,
      originStopId: String(seed.first.stop.id),
      originStopName: String(seed.first.stop.name || seed.first.stop.id),
      originDistanceMeters: originDistance,
      first: {
        tripRef: seed.first.tripRef,
        lineRef: String(seed.first.arrival?.lineref || ""),
        boardStopId: String(seed.first.stop.id),
        boardStopSequence: null,
        exitStopId: String(seed.occurrence.stopId),
        exitStopSequence: Number(seed.occurrence.stopSequence),
        departureAt: seed.first.departureAt,
        arrivalAt: seed.incomingArrivalAt,
        aimedDepartureAt:
          Number.isFinite(Number(seed.first.arrival?.aimeddeparturetime))
            ? Number(seed.first.arrival.aimeddeparturetime)
            : null,
        originAimedDepartureAt:
          Number.isFinite(Number(seed.first.arrival?.originaimeddeparturetime))
            ? Number(seed.first.arrival.originaimeddeparturetime)
            : null,
        liveState: seed.first.liveState,
      },
      transfer: {
        alightStopId: String(seed.occurrence.stopId),
        alightStopSequence: Number(seed.occurrence.stopSequence),
        boardStopId: String(seed.board.stopId),
        boardStopName: String(
          seed.board.stopName ||
            stopName(seed.board.stopId, networkStops)
        ),
        walkingDistanceM: transferDistance,
        feasibility: seed.feasibility,
      },
      second: {
        tripRef: secondTripRef,
        lineRef: String(seed.outgoing?.lineref || ""),
        boardStopId: String(seed.board.stopId),
        boardStopSequence:
          Number.isFinite(Number(fit.boarding?.stopSequence))
            ? Number(fit.boarding.stopSequence)
            : null,
        exitStopId: destinationStopId,
        exitStopSequence:
          Number.isFinite(Number(fit.destination?.stopSequence))
            ? Number(fit.destination.stopSequence)
            : null,
        departureAt: secondDepartureAt,
        arrivalAt: destinationArrivalAt,
        aimedDepartureAt: secondDepartureAt,
        originAimedDepartureAt:
          Number.isFinite(Number(seed.outgoing?.originaimeddeparturetime))
            ? Number(seed.outgoing.originaimeddeparturetime)
            : null,
        liveState: "schedule",
      },
      destinationStopId,
      destinationArrivalAt,
      finalWalkDistanceM,
      finalWalkSecEstimate,
      journeyArrivalAt,
      totalWalkingDistanceM:
        originDistance + transferDistance + finalDistance,
      reliability:
        seed.feasibility.state === "tight" ||
        seed.first.liveState === "delayed"
          ? "low"
          : "medium",
    });
  }

  candidates.sort(
    (left, right) =>
      left.journeyArrivalAt - right.journeyArrivalAt ||
      (TRANSFER_RISK_RANK[left.transfer.feasibility.state] ?? 9) -
        (TRANSFER_RISK_RANK[right.transfer.feasibility.state] ?? 9) ||
      left.totalWalkingDistanceM - right.totalWalkingDistanceM ||
      left.first.departureAt - right.first.departureAt
  );

  return candidates.slice(0, MAX_OPTIONS);
}

/**
 * @param {{
 *   enabled?: boolean,
 *   originStops: readonly any[],
 *   allStops: readonly any[],
 *   destination: DestinationIntent | null,
 *   positionAccuracy?: number | null,
 * }} input
 */
export default function useTransferJourneyOptions({
  enabled = true,
  originStops,
  allStops,
  destination,
  positionAccuracy = null,
}) {
  /** @type {[TransferJourneyOption[], import("react").Dispatch<import("react").SetStateAction<TransferJourneyOption[]>>]} */
  const [options, setOptions] = useState([]);
  const [state, setState] = useState("idle");
  const requestRef = useRef({
    enabled,
    originStops,
    allStops,
    destination,
    positionAccuracy,
  });
  requestRef.current = {
    enabled,
    originStops,
    allStops,
    destination,
    positionAccuracy,
  };

  const signature = useMemo(
    () =>
      enabled && destination
        ? [
            destination.id,
            destination.primaryStopId,
            ...destination.acceptableStopIds,
            originStops.map((stop) => stop.id).join(","),
            Math.round(Number(positionAccuracy) || 0),
          ].join("|")
        : "",
    [destination, enabled, originStops, positionAccuracy]
  );

  useEffect(() => {
    if (!signature) {
      setOptions([]);
      setState("idle");
      return undefined;
    }

    let active = true;
    let timer = 0;
    let controller = new AbortController();
    setOptions([]);
    setState("loading");

    const run = async () => {
      controller.abort();
      controller = new AbortController();

      try {
        const request = requestRef.current;
        const next = await loadTransferJourneyOptions({
          originStops: request.originStops,
          allStops: request.allStops,
          destination: request.destination,
          positionAccuracy: request.positionAccuracy,
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        setOptions(next);
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
        setOptions([]);
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

  return { options, state };
}
