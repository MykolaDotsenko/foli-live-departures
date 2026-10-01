import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDestinationAwareNearby } from "./useDestinationAwareNearby";
import { selectDirectJourneyOptions } from "../utils/directJourneyOptions";
import {
  canSearchTransferRecovery,
  transferRecoveryOriginStops,
  withoutFailedTransferRun,
} from "../utils/transferRecovery";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption } from "../types/journey" */

const REFRESH_MS = 30_000;

/**
 * @param {{
 *   journey?: ActiveDirectJourney | null,
 *   destination?: DestinationIntent | null,
 *   allStops?: readonly any[],
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<DirectJourneyOption[]>}
 */
export async function loadTransferRecoveryOptions({
  journey = null,
  destination = null,
  allStops = [],
  signal,
} = {}) {
  if (!destination || !canSearchTransferRecovery(journey)) return [];

  const originStops = transferRecoveryOriginStops(journey, allStops);
  if (originStops.length === 0) return [];

  const fitsByStop = await loadDestinationAwareNearby({
    stops: originStops,
    destination,
    // Stop-to-stop transfer geometry is known from the static catalogue; no
    // device-location uncertainty is involved in this recovery search.
    positionAccuracy: 0,
    signal,
  });

  return selectDirectJourneyOptions({
    stops: originStops,
    fitsByStop: withoutFailedTransferRun(fitsByStop, journey),
  });
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
  const [state, setState] = useState("idle");
  const abortRef = useRef(null);

  const active = Boolean(
    enabled &&
      destination &&
      canSearchTransferRecovery(journey)
  );
  const identityKey = useMemo(
    () =>
      active
        ? [
            journey?.id || "",
            journey?.recoveryReason || "",
            journey?.tripRef || "",
            journey?.originAimedDepartureAt || "",
            destination?.id || "",
          ].join("|")
        : "",
    [
      active,
      destination?.id,
      journey?.id,
      journey?.originAimedDepartureAt,
      journey?.recoveryReason,
      journey?.tripRef,
    ]
  );

  const refresh = useCallback(async () => {
    if (!active) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const next = await loadTransferRecoveryOptions({
        journey,
        destination,
        allStops,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      setOptions(next);
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
      setState("error");
      return null;
    }
  }, [active, allStops, destination, journey]);

  useEffect(() => {
    abortRef.current?.abort();
    setOptions([]);

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

  return { options, state, refresh };
}
