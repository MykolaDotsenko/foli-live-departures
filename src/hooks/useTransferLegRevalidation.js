import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStopMonitor } from "../api/foliApi";
import { advanceServerTime } from "../utils/time";
import { evaluateTransferRevalidation } from "../utils/transferRevalidation";
import useClockTick from "./useClockTick";
import { reportProviderReached } from "./useOnlineStatus";

/** @import { ActiveDirectJourney, LiveState } from "../types/journey" */

const REFRESH_INTERVAL_MS = 30_000;

function emptyFeed(identityKey = "") {
  return {
    identityKey,
    arrivals: [],
    serverTime: null,
    receivedAtMs: null,
    error: false,
  };
}

/**
 * Live-only watcher for the already committed second transfer leg.
 * It intentionally disables timetable fallback: timetable data remains in
 * the transfer plan, while this hook answers only whether fresh SIRI changes
 * that plan.
 *
 * @param {{
 *   enabled?: boolean,
 *   journey?: ActiveDirectJourney | null,
 *   incomingArrivalAt?: number | null,
 *   incomingLiveState?: LiveState,
 *   cancelled?: boolean,
 *   legIndex?: number | null,
 * }} input
 */
export default function useTransferLegRevalidation({
  enabled = true,
  journey = null,
  incomingArrivalAt = null,
  incomingLiveState = "unknown",
  cancelled = false,
  legIndex = null,
} = {}) {
  const activeIndex = Number(journey?.activeLegIndex);
  const targetIndex =
    Number.isInteger(Number(legIndex)) && Number(legIndex) >= 1
      ? Number(legIndex)
      : Number.isInteger(activeIndex) && activeIndex >= 0
        ? activeIndex + 1
        : 1;
  const second =
    journey?.itinerary?.legs?.[targetIndex] ||
    (targetIndex === 1 &&
    journey?.transferPlan &&
    journey.transferLeg === 1
      ? journey.transferPlan.second
      : null);
  const stopId = String(second?.boardStopId || "");
  const identityKey = second
    ? [
        second.tripRef,
        second.boardStopId,
        second.aimedDepartureAt || second.departureAt,
        second.originAimedDepartureAt || "",
      ].join("|")
    : "";

  const [feed, setFeed] = useState(() => emptyFeed(""));
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const previousRef = useRef({ identityKey: "", state: null });

  const active = Boolean(enabled && journey && second && stopId);
  const nowMs = useClockTick(10_000, active);

  const refresh = useCallback(async () => {
    if (!active) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const next = await fetchStopMonitor(stopId, controller.signal, {
        scheduleFallback: false,
      });
      if (controller.signal.aborted) return null;

      const receivedAtMs = Date.now();
      setFeed({
        identityKey,
        arrivals: next.arrivals,
        serverTime: next.serverTime,
        receivedAtMs,
        error: false,
      });
      reportProviderReached();
      return true;
    } catch (error) {
      if (
        controller.signal.aborted ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return null;
      }

      setFeed((current) => ({ ...current, error: true }));
      return false;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [active, identityKey, stopId]);

  useEffect(() => {
    previousRef.current = { identityKey, state: null };
    setFeed(emptyFeed(identityKey));
    setLoading(false);

    if (!active) {
      abortRef.current?.abort();
      return undefined;
    }

    let mounted = true;
    let timeoutId = null;

    const scheduleNext = () => {
      if (!mounted) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await refresh();
        }
        scheduleNext();
      }, REFRESH_INTERVAL_MS);
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

  const state = useMemo(() => {
    if (!active) {
      return evaluateTransferRevalidation({ journey: null });
    }

    // During the render that switches committed legs, React still exposes the
    // previous leg's feed until the identity-reset effect runs. Treat that
    // payload as absent immediately; otherwise one transient evaluation can
    // attach the old leg's missingSinceMs to the new identity and falsely
    // confirm "missed" on the first new poll.
    const currentFeed =
      feed.identityKey === identityKey ? feed : emptyFeed(identityKey);

    return evaluateTransferRevalidation({
      journey,
      arrivals: currentFeed.arrivals,
      referenceTimeSec: advanceServerTime(
        currentFeed.serverTime,
        currentFeed.receivedAtMs,
        nowMs
      ),
      receivedAtMs: currentFeed.receivedAtMs,
      feedError: currentFeed.error,
      cancelled,
      incomingArrivalAt,
      incomingLiveState,
      previous:
        previousRef.current.identityKey === identityKey
          ? previousRef.current.state
          : null,
      legIndex: targetIndex,
    });
  }, [
    active,
    cancelled,
    feed,
    incomingArrivalAt,
    incomingLiveState,
    identityKey,
    journey,
    nowMs,
    targetIndex,
  ]);

  useEffect(() => {
    previousRef.current = { identityKey, state };
  }, [identityKey, state]);

  return {
    ...state,
    loading,
    refresh,
  };
}
