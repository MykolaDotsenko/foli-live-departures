import { useCallback, useEffect, useRef, useState } from "react";
import { fetchScheduledLineDepartures } from "../api/foliApi";

const EMPTY_REFRESH_BUCKET_SEC = 10 * 60;

// The next timetable departures of followed lines that the live board has
// no row for. Asked once per stop and set of lines, again once the first
// departure it gave has left, and again on request.
export default function useLineTimetable(stopId, lines, referenceTime) {
  const key =
    stopId && lines.length > 0 ? `${stopId}|${[...lines].sort().join(",")}` : "";
  const [answer, setAnswer] = useState({ key: "", status: "idle", rows: [] });
  const [attempt, setAttempt] = useState(0);
  const referenceRef = useRef(referenceTime);
  referenceRef.current = referenceTime;
  const emptyRefreshRef = useRef({ key: "", bucket: null });

  const current = answer.key === key;
  const firstLeaves = current ? answer.rows[0]?.aimeddeparturetime : undefined;
  // Changes only when that first departure has gone, not on every tick.
  const firstGone =
    Number.isFinite(firstLeaves) && Number(referenceTime) > firstLeaves + 30
      ? firstLeaves
      : 0;

  const referenceNumber = Number(referenceTime);
  const referenceBucket =
    Number.isFinite(referenceNumber) && referenceNumber > 0
      ? Math.floor(referenceNumber / EMPTY_REFRESH_BUCKET_SEC)
      : 0;

  // A successful empty 36-hour window is still time-relative. Without a
  // bounded recheck it stayed empty forever on a long-running board because
  // there is no first departure whose expiry can invalidate the result.
  // BusStopDisplay's clock pauses while hidden, so this does not create
  // background provider traffic.
  useEffect(() => {
    if (!key || !current || answer.status !== "ready") return;

    if (answer.rows.length > 0) {
      emptyRefreshRef.current = { key: "", bucket: null };
      return;
    }

    const tracked = emptyRefreshRef.current;
    if (tracked.key !== key || tracked.bucket === null) {
      emptyRefreshRef.current = { key, bucket: referenceBucket };
      return;
    }

    if (referenceBucket > 0 && tracked.bucket !== referenceBucket) {
      emptyRefreshRef.current = { key, bucket: referenceBucket };
      setAttempt((count) => count + 1);
    }
  }, [
    answer.rows.length,
    answer.status,
    current,
    key,
    referenceBucket,
  ]);

  useEffect(() => {
    if (!key) return undefined;
    const [id, joined] = key.split("|");
    const controller = new AbortController();

    setAnswer((previous) => ({
      key,
      status: "loading",
      rows: previous.key === key ? previous.rows : [],
    }));
    fetchScheduledLineDepartures(
      id,
      joined.split(","),
      referenceRef.current,
      controller.signal
    )
      .then((rows) => {
        if (!controller.signal.aborted) setAnswer({ key, status: "ready", rows });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ key, status: "error", rows: [] });
      });

    return () => controller.abort();
  }, [key, firstGone, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return {
    status: !key ? "idle" : current ? answer.status : "loading",
    rows: current ? answer.rows : [],
    retry,
  };
}
