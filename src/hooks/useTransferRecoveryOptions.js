import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDestinationAwareNearby } from "./useDestinationAwareNearby";
import { selectDirectJourneyOptions } from "../utils/directJourneyOptions";
import { loadTransferJourneyOptions } from "./useTransferJourneyOptions";
import {
  canSearchTransferRecovery,
  failedRecoveryLeg,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "../utils/transferRecovery";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption, MultiLegJourneyOption } from "../types/journey" */

const REFRESH_MS = 30_000;

/**
 * @param {{
 *   journey?: ActiveDirectJourney | null,
 *   destination?: DestinationIntent | null,
 *   allStops?: readonly any[],
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<{directOptions: DirectJourneyOption[], transferOptions: MultiLegJourneyOption[]}>}
 */
export async function loadTransferRecoveryOptions({
  journey = null,
  destination = null,
  allStops = [],
  signal,
} = {}) {
  if (!destination || !canSearchTransferRecovery(journey)) {
    return { directOptions: [], transferOptions: [] };
  }

  const originStops = transferRecoveryOriginStops(journey, allStops);
  if (originStops.length === 0) {
    return { directOptions: [], transferOptions: [] };
  }

  const failed = failedRecoveryLeg(journey);
  const [directResult, transferResult] = await Promise.allSettled([
    loadDestinationAwareNearby({
      stops: originStops,
      destination,
      // Stop-to-stop transfer geometry is known from the static catalogue; no
      // device-location uncertainty is involved in this recovery search.
      positionAccuracy: 0,
      signal,
    }),
    loadTransferJourneyOptions({
      originStops,
      allStops,
      destination,
      positionAccuracy: 0,
      // The original journey already consumed at least one transit leg.
      // Recovery may add one further transfer, but never exceed the product's
      // overall two-transfer ceiling.
      maxTransitLegs: 2,
      excludedRun: failed
        ? {
            tripRef: failed.tripRef,
            originAimedDepartureAt: failed.originAimedDepartureAt,
          }
        : null,
      signal,
    }),
  ]);

  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  const directOptions =
    directResult.status === "fulfilled"
      ? selectDirectJourneyOptions({
          stops: originStops,
          fitsByStop: withoutFailedTransferRun(directResult.value, journey),
        })
      : [];

  const transferOptions =
    transferResult.status === "fulfilled" ? transferResult.value : [];

  // If both providers failed, expose a real error. A partial success remains
  // useful and truthful: direct and transfer recovery are independent paths.
  if (
    directResult.status === "rejected" &&
    transferResult.status === "rejected"
  ) {
    throw directResult.reason || transferResult.reason || new Error("Recovery search failed.");
  }

  return { directOptions, transferOptions };
}

/**
 * Auto-searches fresh direct alternatives after a transfer failure only when
 * Ride Mode has authoritatively established that the passenger reached the
 * transfer area. Search prepares choices; it never commits one automatically.
 *
 * @param {{
 *   enabled?: boolean,
 *   journey?: ActiveDirectJourney | null,
 *   destination?: DestinationIntent | null,
 *   allStops?: readonly any[],
 * }} input
 */
export default function useTransferRecoveryOptions({
  enabled = true,
  journey = null,
  destination = null,
  allStops = [],
} = {}) {
  /** @type {[DirectJourneyOption[], import("react").Dispatch<import("react").SetStateAction<DirectJourneyOption[]>>]} */
  const [options, setOptions] = useState([]);
  /** @type {[MultiLegJourneyOption[], import("react").Dispatch<import("react").SetStateAction<MultiLegJourneyOption[]>>]} */
  const [transferOptions, setTransferOptions] = useState([]);
  const [state, setState] = useState("idle");
  const abortRef = useRef(null);
  const requestRef = useRef({ journey, destination, allStops });
  requestRef.current = { journey, destination, allStops };

  const active = Boolean(
    enabled &&
      destination &&
      canSearchTransferRecovery(journey)
  );
  const identityKey = useMemo(() => {
    if (!active) return "";
    const index = Number(journey?.activeLegIndex);
    const transfer =
      Number.isInteger(index) && index > 0
        ? journey?.itinerary?.transfers?.[index - 1]
        : null;
    const failed = failedRecoveryLeg(journey);
    return [
      journey?.id || "",
      journey?.recoveryReason || "",
      Number.isInteger(index) ? index : "",
      journey?.stopId || "",
      journey?.atStopConfirmedAt || "",
      transfer?.alightStopId || "",
      transfer?.boardStopId || "",
      failed?.tripRef || "",
      failed?.originAimedDepartureAt || "",
      destination?.id || "",
    ].join("|");
  }, [
    active,
    destination?.id,
    journey,
  ]);

  const refresh = useCallback(async () => {
    if (!active) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request = requestRef.current;
      const next = await loadTransferRecoveryOptions({
        journey: request.journey,
        destination: request.destination,
        allStops: request.allStops,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      setOptions(next.directOptions);
      setTransferOptions(next.transferOptions);
      setState("ready");
      return next;
    } catch (error) {
      if (
        controller.signal.aborted ||
        error?.name === "AbortError" ||
        error?.name === "CanceledError"
      ) {
        return null;
      }
      setOptions([]);
      setTransferOptions([]);
      setState("error");
      return null;
    }
  }, [active]);

  useEffect(() => {
    abortRef.current?.abort();
    setOptions([]);
    setTransferOptions([]);

    if (!active) {
      setState("idle");
      return undefined;
    }

    let mounted = true;
    let timeoutId = null;
    setState("loading");

    const scheduleNext = () => {
      if (!mounted) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        scheduleNext();
      }, REFRESH_MS);
    };

    const run = async () => {
      await refresh();
      scheduleNext();
    };

    const refreshNow = async () => {
      if (!mounted || document.visibilityState !== "visible") return;
      window.clearTimeout(timeoutId);
      // Returning to a previously hidden tab can leave time-sensitive bus
      // options minutes out of date. Fail closed: hide them until a fresh
      // provider response proves which replacements are still catchable.
      setOptions([]);
      setTransferOptions([]);
      setState("loading");
      await refresh();
      scheduleNext();
    };

    run();
    document.addEventListener("visibilitychange", refreshNow);
    window.addEventListener("online", refreshNow);

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshNow);
      window.removeEventListener("online", refreshNow);
      abortRef.current?.abort();
    };
  }, [active, identityKey, refresh]);

  return { options, transferOptions, state, refresh };
}
