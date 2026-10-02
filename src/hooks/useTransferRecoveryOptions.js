import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDestinationAwareNearby } from "./useDestinationAwareNearby";
import { loadTransferJourneyOptions } from "./useTransferJourneyOptions";
import { selectDirectJourneyOptions } from "../utils/directJourneyOptions";
import {
  canSearchTransferRecovery,
  failedTransferRunIdentity,
  transferRecoveryContext,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "../utils/transferRecovery";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption, MultiLegJourneyOption } from "../types/journey" */

const REFRESH_MS = 30_000;

/**
 * Recovery may offer either a direct replacement or one more transfer.
 * Both searches are bounded and neither commits a journey automatically.
 *
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

  const excludedRun = failedTransferRunIdentity(journey);
  const [directResult, transferResult] = await Promise.allSettled([
    loadDestinationAwareNearby({
      stops: originStops,
      destination,
      // Stop-to-stop recovery geometry is catalogue geometry, not a device
      // location estimate.
      positionAccuracy: 0,
      signal,
    }),
    loadTransferJourneyOptions({
      originStops,
      allStops,
      destination,
      positionAccuracy: 0,
      // Recovery is intentionally narrower than initial planning: at most
      // one new transfer from the authoritative recovery area.
      maxTransitLegs: 2,
      excludedRun,
      signal,
    }),
  ]);

  if (signal?.aborted) {
    const error = new Error("The request was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  if (directResult.status === "rejected" && transferResult.status === "rejected") {
    throw directResult.reason || transferResult.reason || new Error("Recovery search failed.");
  }

  const directOptions =
    directResult.status === "fulfilled"
      ? selectDirectJourneyOptions({
          stops: originStops,
          fitsByStop: withoutFailedTransferRun(directResult.value, journey),
        })
      : [];

  const transferOptions =
    transferResult.status === "fulfilled"
      ? transferResult.value.filter(
          (option) =>
            Array.isArray(option?.legs) &&
            option.legs.length === 2
        )
      : [];

  return { directOptions, transferOptions };
}

/**
 * Auto-searches fresh alternatives after a committed transfer failure only
 * when Ride Mode has already established the recovery area. Search prepares
 * choices; the passenger still selects a replacement explicitly.
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
  const [directOptions, setDirectOptions] = useState([]);
  /** @type {[MultiLegJourneyOption[], import("react").Dispatch<import("react").SetStateAction<MultiLegJourneyOption[]>>]} */
  const [transferOptions, setTransferOptions] = useState([]);
  const [state, setState] = useState("idle");
  const abortRef = useRef(null);
  const requestRef = useRef({ journey, destination, allStops });
  requestRef.current = { journey, destination, allStops };

  const context = transferRecoveryContext(journey);
  const failedRun = failedTransferRunIdentity(journey);
  const active = Boolean(enabled && destination && context);

  const identityKey = useMemo(
    () =>
      active
        ? [
            journey?.id || "",
            journey?.recoveryReason || "",
            context?.activeIndex ?? "",
            journey?.stopId || "",
            journey?.atStopConfirmedAt || "",
            context?.previousTransfer?.alightStopId || "",
            context?.previousTransfer?.boardStopId || "",
            failedRun?.tripRef || "",
            failedRun?.originAimedDepartureAt || "",
            destination?.id || "",
          ].join("|")
        : "",
    [
      active,
      context?.activeIndex,
      context?.previousTransfer?.alightStopId,
      context?.previousTransfer?.boardStopId,
      destination?.id,
      failedRun?.originAimedDepartureAt,
      failedRun?.tripRef,
      journey?.atStopConfirmedAt,
      journey?.id,
      journey?.recoveryReason,
      journey?.stopId,
    ]
  );

  const clearOptions = useCallback(() => {
    setDirectOptions([]);
    setTransferOptions([]);
  }, []);

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
      setDirectOptions(next.directOptions);
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
      clearOptions();
      setState("error");
      return null;
    }
  }, [active, clearOptions]);

  useEffect(() => {
    abortRef.current?.abort();
    clearOptions();

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
      // Recovery choices are time-sensitive. Hide stale cards until a fresh
      // provider response proves they are still usable.
      clearOptions();
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
  }, [active, clearOptions, identityKey, refresh]);

  return {
    // Compatibility alias while callers migrate.
    options: directOptions,
    directOptions,
    transferOptions,
    state,
    refresh,
  };
}
