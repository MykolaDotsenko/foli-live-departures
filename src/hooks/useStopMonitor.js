import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStopMonitor } from "../api/foliApi";
import { reportProviderReached } from "./useOnlineStatus";

const REFRESH_INTERVAL_MS = 30_000;
const MAX_RETRY_INTERVAL_MS = 5 * 60_000;

const SNAPSHOT_KEY = "foli-last-departures-v1";
// Old enough to survive a reopen or a tunnel, short enough that every stored
// row is still a plausible departure rather than a misleading empty board.
const SNAPSHOT_TTL_MS = 15 * 60_000;
const MAX_SNAPSHOT_STOPS = 5;
// Enough that a followed line a dozen rows down survives an offline reopen.
const MAX_SNAPSHOT_ARRIVALS = 40;

function readSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function readSnapshot(stopId, nowMs = Date.now()) {
  const entry = readSnapshots()[String(stopId)];
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.arrivals)) {
    return null;
  }

  const receivedAtMs = Number(entry.receivedAtMs);
  if (
    !Number.isFinite(receivedAtMs) ||
    receivedAtMs <= 0 ||
    receivedAtMs > nowMs ||
    nowMs - receivedAtMs > SNAPSHOT_TTL_MS
  ) {
    return null;
  }

  const serverTime = Number(entry.serverTime);

  return {
    stopId: String(stopId),
    stopName: typeof entry.stopName === "string" ? entry.stopName : "",
    // A stored row that is not a row crashed the board on every reopen.
    arrivals: entry.arrivals.filter(
      (arrival) => Boolean(arrival) && typeof arrival === "object"
    ),
    serverTime:
      Number.isFinite(serverTime) && serverTime > 0 ? serverTime : null,
    realtimeAvailable:
      typeof entry.realtimeAvailable === "boolean"
        ? entry.realtimeAvailable
        : null,
    scheduleAvailable: entry.scheduleAvailable === true,
    // Without these a reopened board took an unchecked timetable at its word
    // and said "No upcoming departures".
    scheduleFailed: entry.scheduleFailed === true,
    scheduleIncomplete: entry.scheduleIncomplete === true,
    receivedAtMs,
  };
}

function writeSnapshot(data) {
  try {
    const snapshots = readSnapshots();
    snapshots[data.stopId] = {
      stopName: data.stopName,
      arrivals: data.arrivals.slice(0, MAX_SNAPSHOT_ARRIVALS),
      serverTime: data.serverTime,
      realtimeAvailable: data.realtimeAvailable,
      scheduleAvailable: data.scheduleAvailable,
      scheduleFailed: data.scheduleFailed === true,
      scheduleIncomplete: data.scheduleIncomplete === true,
      receivedAtMs: data.receivedAtMs,
    };

    // Boards past their 15 minutes go now, as About says, rather than
    // staying until five newer ones push them out.
    const mostRecent = Object.entries(snapshots)
      .filter(
        ([, entry]) =>
          Date.now() - (Number(entry?.receivedAtMs) || 0) <= SNAPSHOT_TTL_MS
      )
      .sort(
        ([, a], [, b]) =>
          (Number(b?.receivedAtMs) || 0) - (Number(a?.receivedAtMs) || 0)
      )
      .slice(0, MAX_SNAPSHOT_STOPS);

    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify(Object.fromEntries(mostRecent))
    );
  } catch {
    // Offline continuity is a bonus. Live departures never depend on it.
  }
}

export function pollDelayMs(consecutiveFailures) {
  const failures = Math.max(0, Number(consecutiveFailures) || 0);
  if (failures <= 1) return REFRESH_INTERVAL_MS;

  return Math.min(
    REFRESH_INTERVAL_MS * 2 ** (failures - 1),
    MAX_RETRY_INTERVAL_MS
  );
}

function emptyData(stopId) {
  return {
    stopId,
    stopName: "",
    arrivals: [],
    serverTime: null,
    realtimeAvailable: null,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
    receivedAtMs: null,
  };
}

// The last payload this browser saw for the same stop, so reopening offline
// shows the recent board with its real age instead of nothing at all.
function startingData(stopId) {
  return readSnapshot(stopId) || emptyData(stopId);
}

export default function useStopMonitor(stopId) {
  const [data, setData] = useState(() => startingData(stopId));
  const [loading, setLoading] = useState(Boolean(stopId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef(null);
  const consecutiveFailuresRef = useRef(0);

  const refresh = useCallback(
    // `quiet`: the half-minute poll. Only a refresh the passenger asked for
    // says "Refreshing…": every poll turned the focused Refresh button into
    // "Refreshing…" and back, which a screen reader read out each time.
    async ({ initial = false, quiet = false } = {}) => {
      if (!stopId) return null;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // A retry the passenger asked for clears the failure so they see it
      // being tried. The half-minute poll does not: during an outage it
      // took "Couldn't load departures" off screen for every quiet retry
      // and a screen reader announced it afresh each time it came back.
      if (!quiet) setError(false);
      if (initial) setLoading(true);
      else if (!quiet) setRefreshing(true);

      try {
        const next = await fetchStopMonitor(stopId, controller.signal);
        // Superseded while it was on its way: a newer request, or another
        // stop, owns the board now. Applying it put the old stop's answer
        // back on screen.
        if (controller.signal.aborted) return null;
        const received = { stopId, ...next, receivedAtMs: Date.now() };
        consecutiveFailuresRef.current = 0;
        reportProviderReached();
        setError(false);
        setData(received);
        writeSnapshot(received);
        return true;
      } catch (err) {
        // A cancelled request is not a failed one, however it surfaced.
        if (
          controller.signal.aborted ||
          err?.name === "CanceledError" ||
          err?.name === "AbortError"
        ) {
          return null;
        }

        consecutiveFailuresRef.current += 1;
        setError(true);
        return false;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [stopId]
  );

  useEffect(() => {
    if (!stopId) {
      abortRef.current?.abort();
      consecutiveFailuresRef.current = 0;
      setData(emptyData(""));
      setLoading(false);
      setRefreshing(false);
      setError(false);
      return undefined;
    }

    let active = true;
    let timeoutId = null;

    const scheduleNext = () => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await refresh({ quiet: true });
        }
        scheduleNext();
      }, pollDelayMs(consecutiveFailuresRef.current));
    };

    const runInitial = async () => {
      consecutiveFailuresRef.current = 0;
      setData(startingData(stopId));
      setError(false);
      setRefreshing(false);
      await refresh({ initial: true });
      scheduleNext();
    };

    const refreshNowAndReschedule = async () => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      await refresh({ quiet: true });
      scheduleNext();
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshNowAndReschedule();
    };

    const handleOnline = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshNowAndReschedule();
    };

    runInitial();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      abortRef.current?.abort();
    };
  }, [refresh, stopId]);

  const isCurrentStop = data.stopId === stopId;
  // Allocating this per render would give `arrivals` a new identity on every
  // render while a newly selected stop loads, which re-triggers every consumer
  // memo/effect keyed on it and can spin a synchronous re-render loop.
  const pendingData = useMemo(() => startingData(stopId), [stopId]);

  return {
    ...(isCurrentStop ? data : pendingData),
    loading: !isCurrentStop || loading,
    refreshing: isCurrentStop && refreshing,
    error: isCurrentStop && error,
    refresh,
  };
}
