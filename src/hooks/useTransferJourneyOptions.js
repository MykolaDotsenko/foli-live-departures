import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchScheduledStopDepartures,
  fetchStopMonitor,
  fetchTripStopTimes,
} from "../api/foliApi";
import { classifyCatchability } from "../utils/catchability";
import {
  analyzeTripFit,
  resolveBoardingOccurrence,
} from "../utils/destinationTripFit";
import { compareItineraries } from "../utils/itinerary";
import { selectDiverseItineraries } from "../utils/itineraryDiversity";
import {
  compareJourneyOptions,
  journeyPlanAllowsOption,
} from "../utils/journeyPlanning";
import { normalizeJourneyTimeConstraint } from "../utils/journeyTime";
import { estimateFinalWalkSeconds } from "../utils/placeDestination";
import { getDepartureTime } from "../utils/time";
import {
  downstreamTransferOccurrences,
  transferBoardingCandidates,
} from "../utils/transferTopology";
import { assessTransfer } from "../utils/transferFeasibility";

/** @import { DestinationIntent, JourneyPlan, JourneyTimeConstraint, LiveState, MultiLegJourneyOption } from "../types/journey" */

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
const MAX_SECOND_TRANSFER_OCCURRENCES_PER_TRIP = 4;
const MAX_SECOND_CONNECTION_POINTS = 64;
const MAX_THIRD_TRANSFER_TIMETABLE_LOOKUPS = 8;
const MAX_OUTGOING_PER_SECOND_TRANSFER = 6;
const MAX_THIRD_TRIPS = 24;
const THIRD_TRIP_BATCH = 6;
const MAX_OPTIONS = 3;
const TRANSFER_BUCKET_SEC = 5 * 60;
const EXCLUDED_RUN_TIME_TOLERANCE_SEC = 30;

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

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Exclude one concrete failed committed run without hiding another departure
 * on the same line. Trip ref is primary; origin planned time disambiguates
 * providers that may reuse identifiers.
 *
 * @param {any} candidate
 * @param {{tripRef?: string, originAimedDepartureAt?: number | null} | null | undefined} excludedRun
 */
function matchesExcludedRun(candidate, excludedRun) {
  if (
    !excludedRun ||
    String(candidate?.tripref || candidate?.tripRef || "") !==
      String(excludedRun.tripRef || "")
  ) {
    return false;
  }

  const excludedOrigin = positive(excludedRun.originAimedDepartureAt);
  const candidateOrigin = positive(
    candidate?.originaimeddeparturetime ?? candidate?.originAimedDepartureAt
  );
  return !(
    excludedOrigin !== null &&
    candidateOrigin !== null &&
    Math.abs(excludedOrigin - candidateOrigin) >
      EXCLUDED_RUN_TIME_TOLERANCE_SEC
  );
}

/**
 * @param {MultiLegJourneyOption[]} candidates
 * @param {JourneyPlan | JourneyTimeConstraint | null | undefined} plan
 */
function finalizeOptions(candidates, plan) {
  const filtered = plan
    ? candidates.filter((candidate) =>
        journeyPlanAllowsOption(candidate, plan)
      )
    : [...candidates];

  filtered.sort((left, right) =>
    plan
      ? compareJourneyOptions(left, right, plan)
      : compareItineraries(left, right)
  );

  return selectDiverseItineraries(filtered, MAX_OPTIONS);
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
 *   maxTransitLegs?: 2 | 3,
 *   excludedRun?: {tripRef?: string, originAimedDepartureAt?: number | null} | null,
 *   journeyPlan?: JourneyPlan | null,
 *   timeConstraint?: JourneyTimeConstraint | null,
 *   routingPreference?: import("../types/journey").RoutingPreference | string,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<MultiLegJourneyOption[]>}
 */
export async function loadTransferJourneyOptions({
  originStops,
  allStops,
  destination,
  positionAccuracy = null,
  maxTransitLegs = 3,
  excludedRun = null,
  journeyPlan = null,
  timeConstraint = null,
  routingPreference = "balanced",
  signal,
}) {
  const origins = Array.isArray(originStops) ? originStops : [];
  const legLimit = Number(maxTransitLegs) <= 2 ? 2 : 3;
  const networkStops = Array.isArray(allStops) ? allStops : [];
  if (!destination || origins.length === 0) return [];

  const effectivePlan =
    journeyPlan ||
    (timeConstraint || routingPreference !== "balanced"
      ? {
          mode: timeConstraint?.mode || "leave-now",
          targetTimeSec: timeConstraint?.targetTimeSec ?? null,
          preference: routingPreference,
        }
      : null);
  const normalizedTime = normalizeJourneyTimeConstraint(effectivePlan);
  if (effectivePlan && !normalizedTime.valid) return [];
  const scheduledPlanning =
    Boolean(effectivePlan) && normalizedTime.mode !== "leave-now";

  const monitorTasks = origins.map((stop) => {
    if (!scheduledPlanning) {
      // Keep synchronous adapter/programming failures visible to the hook.
      // Normal network/provider failures are promises and are still isolated
      // below with allSettled so one bad origin cannot poison the search.
      return fetchStopMonitor(String(stop.id), signal);
    }
    return (async () => {
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
    })();
  });
  const monitorResults = await Promise.allSettled(monitorTasks);
  throwIfAborted(signal);

  const firstCandidates = [];
  const seenFirstOccurrences = new Set();

  for (
    let departureIndex = 0;
    departureIndex <
      (scheduledPlanning ? Math.max(MAX_FIRST_DEPARTURES_PER_STOP, 12) : MAX_FIRST_DEPARTURES_PER_STOP) &&
    firstCandidates.length < (scheduledPlanning ? Math.max(MAX_FIRST_TRIPS, 36) : MAX_FIRST_TRIPS);
    departureIndex += 1
  ) {
    for (let stopIndex = 0; stopIndex < origins.length; stopIndex += 1) {
      if (
        firstCandidates.length >=
        (scheduledPlanning ? Math.max(MAX_FIRST_TRIPS, 36) : MAX_FIRST_TRIPS)
      ) {
        break;
      }
      const monitorResult = monitorResults[stopIndex];
      if (monitorResult.status !== "fulfilled") continue;

      const stop = origins[stopIndex];
      const monitor = monitorResult.value;
      const arrival = monitor.arrivals?.[departureIndex];
      if (!arrival) continue;

      const tripRef = String(arrival.tripref || "");
      if (!tripRef || matchesExcludedRun(arrival, excludedRun)) {
        continue;
      }

      const nowSec =
        Number.isFinite(Number(monitor.serverTime)) &&
        Number(monitor.serverTime) > 0
          ? Number(monitor.serverTime)
          : Math.floor(Date.now() / 1000);
      const departureAt = getDepartureTime(arrival, nowSec);
      if (!Number.isFinite(departureAt) || Number(departureAt) < nowSec - 30) {
        continue;
      }

      // A GTFS trip_id identifies the timetable trip definition, not one
      // physical run. The same trip can appear again on another service date
      // inside the 36-hour planning window, and the same physical run may be
      // boardable from more than one nearby origin stop. Deduping on tripRef
      // alone hid later/closer valid journey options.
      const occurrenceKey = [
        String(stop.id),
        tripRef,
        Number.isFinite(Number(arrival?.aimeddeparturetime))
          ? Number(arrival.aimeddeparturetime)
          : Number(departureAt),
        Number.isFinite(Number(arrival?.originaimeddeparturetime))
          ? Number(arrival.originaimeddeparturetime)
          : "",
      ].join("|");
      if (seenFirstOccurrences.has(occurrenceKey)) continue;

      const catchability = classifyCatchability({
        distanceM: Number(stop.distanceMeters),
        accuracyM: positionAccuracy,
        departureAtSec: Number(departureAt),
        nowSec,
      });
      if (catchability === "too-late" || catchability === "unknown") continue;

      seenFirstOccurrences.add(occurrenceKey);
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
          String(row?.tripref || "") !== point.first.tripRef &&
          !matchesExcludedRun(row, excludedRun)
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

  /** @type {MultiLegJourneyOption[]} */
  const candidates = [];
  const seen = new Set();

  const firstLegFor = (seed) => ({
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
  });

  const firstTransferFor = (seed) => ({
    alightStopId: String(seed.occurrence.stopId),
    alightStopSequence: Number(seed.occurrence.stopSequence),
    boardStopId: String(seed.board.stopId),
    boardStopName: String(
      seed.board.stopName || stopName(seed.board.stopId, networkStops)
    ),
    walkingDistanceM:
      finiteNonNegative(seed.board.walkingDistanceM) || 0,
    feasibility: seed.feasibility,
  });

  // First collect all valid one-transfer arrivals. The same committed second
  // trips are also the bounded frontier for the optional second transfer.
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
    const originDistance =
      finiteNonNegative(seed.first.stop.distanceMeters) || 0;
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

    const first = firstLegFor(seed);
    const transfer = firstTransferFor(seed);
    const second = {
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
    };

    candidates.push({
      id,
      originStopId: String(seed.first.stop.id),
      originStopName: String(seed.first.stop.name || seed.first.stop.id),
      originDistanceMeters: originDistance,
      legs: [first, second],
      transfers: [transfer],
      // Compatibility aliases; orchestration below uses legs/transfers.
      first,
      transfer,
      second,
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

  if (legLimit === 2) {
    return finalizeOptions(candidates, effectivePlan);
  }

  // Build a strictly bounded second-transfer frontier from the already
  // selected second trips. No unbounded graph search is allowed in-browser.
  const secondConnectionPoints = [];
  for (const seed of outgoingSeeds) {
    if (secondConnectionPoints.length >= MAX_SECOND_CONNECTION_POINTS) break;
    const secondTripRef = String(seed.outgoing?.tripref || "");
    if (!allowedSecondTrips.has(secondTripRef)) continue;
    const stopTimes = secondTimes.get(secondTripRef);
    if (!stopTimes) continue;

    const secondDepartureAt = Number(seed.outgoing?.aimeddeparturetime);
    const secondBoarding = resolveBoardingOccurrence(
      stopTimes,
      String(seed.board.stopId),
      null,
      secondDepartureAt
    );
    if (!secondBoarding) continue;

    const occurrences = downstreamTransferOccurrences({
      stopTimes,
      boardingStopId: String(seed.board.stopId),
      boardingSequence: Number(secondBoarding.stopSequence),
      boardingAimedDepartureEpochSec: secondDepartureAt,
      maxOccurrences: MAX_SECOND_TRANSFER_OCCURRENCES_PER_TRIP,
    });

    for (const occurrence of occurrences) {
      if (destination.acceptableStopIds.includes(String(occurrence.stopId))) {
        continue;
      }
      const incomingArrivalAt =
        secondDepartureAt + Number(occurrence.rideDurationSec);
      const boards = transferBoardingCandidates({
        alightStopId: occurrence.stopId,
        stops: networkStops,
      });
      for (const board of boards) {
        const bucketRef =
          Math.floor(incomingArrivalAt / TRANSFER_BUCKET_SEC) *
          TRANSFER_BUCKET_SEC;
        secondConnectionPoints.push({
          seed,
          secondTripRef,
          secondBoarding,
          occurrence,
          board,
          incomingArrivalAt,
          scheduleKey: `third:${board.stopId}:${bucketRef}`,
          bucketRef,
        });
        if (secondConnectionPoints.length >= MAX_SECOND_CONNECTION_POINTS) {
          break;
        }
      }
      if (secondConnectionPoints.length >= MAX_SECOND_CONNECTION_POINTS) break;
    }
  }

  secondConnectionPoints.sort(
    (left, right) =>
      left.incomingArrivalAt - right.incomingArrivalAt ||
      Number(right.board.sameStop) - Number(left.board.sameStop) ||
      left.board.walkingDistanceM - right.board.walkingDistanceM
  );

  const thirdScheduleKeys = new Set();
  const thirdScheduleRequests = new Map();
  for (const point of secondConnectionPoints) {
    if (thirdScheduleKeys.has(point.scheduleKey)) continue;
    if (
      thirdScheduleKeys.size >= MAX_THIRD_TRANSFER_TIMETABLE_LOOKUPS
    ) {
      break;
    }
    thirdScheduleKeys.add(point.scheduleKey);
    thirdScheduleRequests.set(point.scheduleKey, {
      stopId: point.board.stopId,
      reference: point.bucketRef,
    });
  }

  const thirdScheduleEntries = [...thirdScheduleRequests.entries()];
  const thirdScheduleResults = await Promise.allSettled(
    thirdScheduleEntries.map(([, request]) =>
      fetchScheduledStopDepartures(
        request.stopId,
        request.reference,
        signal
      )
    )
  );
  throwIfAborted(signal);

  const thirdSchedules = new Map();
  thirdScheduleResults.forEach((result, index) => {
    thirdSchedules.set(
      thirdScheduleEntries[index][0],
      result.status === "fulfilled" ? result.value : null
    );
  });

  const thirdSeeds = [];
  for (const point of secondConnectionPoints) {
    if (!thirdScheduleKeys.has(point.scheduleKey)) continue;
    const schedule = thirdSchedules.get(point.scheduleKey);
    if (!schedule) continue;

    const departures = (schedule.departures || [])
      .filter(
        (row) =>
          Number(row?.aimeddeparturetime) >= point.incomingArrivalAt &&
          String(row?.tripref || "") !== point.secondTripRef &&
          String(row?.tripref || "") !== point.seed.first.tripRef &&
          !matchesExcludedRun(row, excludedRun)
      )
      .slice(0, MAX_OUTGOING_PER_SECOND_TRANSFER);

    for (const outgoing of departures) {
      const feasibility = assessTransfer({
        incomingArrivalAt: point.incomingArrivalAt,
        outgoingDepartureAt: outgoing.aimeddeparturetime,
        walkingDistanceM: point.board.walkingDistanceM,
        sameStop: point.board.sameStop,
        incomingLiveState: "schedule",
      });
      if (!feasibility.recommendable) continue;
      thirdSeeds.push({ ...point, outgoing, feasibility });
    }
  }

  thirdSeeds.sort(
    (left, right) =>
      Number(left.outgoing.aimeddeparturetime) -
        Number(right.outgoing.aimeddeparturetime) ||
      (TRANSFER_RISK_RANK[left.feasibility.state] ?? 9) -
        (TRANSFER_RISK_RANK[right.feasibility.state] ?? 9)
  );

  const thirdTripIds = [
    ...new Set(
      thirdSeeds
        .map((seed) => String(seed.outgoing?.tripref || ""))
        .filter(Boolean)
    ),
  ].slice(0, MAX_THIRD_TRIPS);
  const allowedThirdTrips = new Set(thirdTripIds);
  const thirdTimes = new Map();

  for (let index = 0; index < thirdTripIds.length; index += THIRD_TRIP_BATCH) {
    const batch = thirdTripIds.slice(index, index + THIRD_TRIP_BATCH);
    const results = await Promise.allSettled(
      batch.map((tripId) => fetchTripStopTimes(tripId, signal))
    );
    throwIfAborted(signal);
    results.forEach((result, resultIndex) => {
      thirdTimes.set(
        batch[resultIndex],
        result.status === "fulfilled" ? result.value : null
      );
    });
  }

  for (const point of thirdSeeds) {
    const thirdTripRef = String(point.outgoing?.tripref || "");
    if (!allowedThirdTrips.has(thirdTripRef)) continue;
    const thirdStopTimes = thirdTimes.get(thirdTripRef);
    const secondStopTimes = secondTimes.get(point.secondTripRef);
    if (!thirdStopTimes || !secondStopTimes) continue;

    const thirdFit = analyzeTripFit({
      stopTimes: thirdStopTimes,
      boardingStopId: point.board.stopId,
      boardingAimedDepartureEpochSec: point.outgoing.aimeddeparturetime,
      destinationStopIds: destination.acceptableStopIds,
      destinationExtraSecByStop: null,
    });
    if (!thirdFit.compatible || thirdFit.rideDurationSec === null) continue;

    const thirdDepartureAt = Number(point.outgoing.aimeddeparturetime);
    const destinationArrivalAt =
      thirdDepartureAt + Number(thirdFit.rideDurationSec);
    const destinationStopId = String(thirdFit.destination?.stopId || "");
    const finalWalkDistanceM = finiteNonNegative(
      destination.finalWalkDistanceByStop?.[destinationStopId]
    );
    const finalWalkSecEstimate = estimateFinalWalkSeconds(finalWalkDistanceM);
    const journeyArrivalAt =
      destinationArrivalAt + (finalWalkSecEstimate || 0);
    const originDistance =
      finiteNonNegative(point.seed.first.stop.distanceMeters) || 0;
    const firstTransferDistance =
      finiteNonNegative(point.seed.board.walkingDistanceM) || 0;
    const secondTransferDistance =
      finiteNonNegative(point.board.walkingDistanceM) || 0;
    const finalDistance = finalWalkDistanceM || 0;

    const first = firstLegFor(point.seed);
    const firstTransfer = firstTransferFor(point.seed);
    const second = {
      tripRef: point.secondTripRef,
      lineRef: String(point.seed.outgoing?.lineref || ""),
      boardStopId: String(point.seed.board.stopId),
      boardStopSequence: Number(point.secondBoarding.stopSequence),
      exitStopId: String(point.occurrence.stopId),
      exitStopSequence: Number(point.occurrence.stopSequence),
      departureAt: Number(point.seed.outgoing.aimeddeparturetime),
      arrivalAt: point.incomingArrivalAt,
      aimedDepartureAt: Number(point.seed.outgoing.aimeddeparturetime),
      originAimedDepartureAt:
        Number.isFinite(
          Number(point.seed.outgoing?.originaimeddeparturetime)
        )
          ? Number(point.seed.outgoing.originaimeddeparturetime)
          : null,
      liveState: "schedule",
    };
    const secondTransfer = {
      alightStopId: String(point.occurrence.stopId),
      alightStopSequence: Number(point.occurrence.stopSequence),
      boardStopId: String(point.board.stopId),
      boardStopName: String(
        point.board.stopName || stopName(point.board.stopId, networkStops)
      ),
      walkingDistanceM: secondTransferDistance,
      feasibility: point.feasibility,
    };
    const third = {
      tripRef: thirdTripRef,
      lineRef: String(point.outgoing?.lineref || ""),
      boardStopId: String(point.board.stopId),
      boardStopSequence:
        Number.isFinite(Number(thirdFit.boarding?.stopSequence))
          ? Number(thirdFit.boarding.stopSequence)
          : null,
      exitStopId: destinationStopId,
      exitStopSequence:
        Number.isFinite(Number(thirdFit.destination?.stopSequence))
          ? Number(thirdFit.destination.stopSequence)
          : null,
      departureAt: thirdDepartureAt,
      arrivalAt: destinationArrivalAt,
      aimedDepartureAt: thirdDepartureAt,
      originAimedDepartureAt:
        Number.isFinite(Number(point.outgoing?.originaimeddeparturetime))
          ? Number(point.outgoing.originaimeddeparturetime)
          : null,
      liveState: "schedule",
    };

    const id = [
      first.tripRef,
      first.exitStopId,
      second.tripRef,
      second.exitStopId,
      third.tripRef,
      third.exitStopId,
      third.departureAt,
    ].join(":");
    if (seen.has(id)) continue;
    seen.add(id);

    candidates.push({
      id,
      originStopId: String(point.seed.first.stop.id),
      originStopName: String(
        point.seed.first.stop.name || point.seed.first.stop.id
      ),
      originDistanceMeters: originDistance,
      legs: [first, second, third],
      transfers: [firstTransfer, secondTransfer],
      // Legacy aliases remain for one-transfer UI/tests while generic
      // orchestration consumes legs/transfers.
      first,
      transfer: firstTransfer,
      second,
      destinationStopId,
      destinationArrivalAt,
      finalWalkDistanceM,
      finalWalkSecEstimate,
      journeyArrivalAt,
      totalWalkingDistanceM:
        originDistance +
        firstTransferDistance +
        secondTransferDistance +
        finalDistance,
      reliability:
        point.seed.feasibility.state === "tight" ||
        point.feasibility.state === "tight" ||
        point.seed.first.liveState === "delayed"
          ? "low"
          : "medium",
    });
  }

  return finalizeOptions(candidates, effectivePlan);
}

/**
 * @param {{
 *   enabled?: boolean,
 *   originStops: readonly any[],
 *   allStops: readonly any[],
 *   destination: DestinationIntent | null,
 *   positionAccuracy?: number | null,
 *   journeyPlan?: JourneyPlan | null,
 *   timeConstraint?: JourneyTimeConstraint | null,
 *   routingPreference?: import("../types/journey").RoutingPreference | string,
 * }} input
 */
export default function useTransferJourneyOptions({
  enabled = true,
  originStops,
  allStops,
  destination,
  positionAccuracy = null,
  journeyPlan = null,
  timeConstraint = null,
  routingPreference = "balanced",
}) {
  /** @type {[MultiLegJourneyOption[], import("react").Dispatch<import("react").SetStateAction<MultiLegJourneyOption[]>>]} */
  const [options, setOptions] = useState([]);
  const [state, setState] = useState("idle");
  const effectivePlan =
    journeyPlan ||
    (timeConstraint || routingPreference !== "balanced"
      ? {
          mode: timeConstraint?.mode || "leave-now",
          targetTimeSec: timeConstraint?.targetTimeSec ?? null,
          preference: routingPreference,
        }
      : null);
  const effectivePreference =
    effectivePlan && "preference" in effectivePlan
      ? effectivePlan.preference || "balanced"
      : "balanced";
  const requestRef = useRef({
    enabled,
    originStops,
    allStops,
    destination,
    positionAccuracy,
    journeyPlan,
    timeConstraint: effectivePlan,
    routingPreference,
  });
  requestRef.current = {
    enabled,
    originStops,
    allStops,
    destination,
    positionAccuracy,
    journeyPlan,
    timeConstraint: effectivePlan,
    routingPreference,
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
            effectivePlan?.mode || "leave-now",
            effectivePlan?.targetTimeSec || "",
            effectivePreference,
          ].join("|")
        : "",
    [
      destination,
      enabled,
      originStops,
      positionAccuracy,
      effectivePlan?.mode,
      effectivePlan?.targetTimeSec,
      effectivePreference,
    ]
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
          journeyPlan: request.journeyPlan,
          timeConstraint: request.timeConstraint,
          routingPreference: request.routingPreference,
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

  return { options, state };
}
