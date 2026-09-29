import { useEffect, useMemo, useState } from "react";
import { fetchTripStopTimes } from "../api/foliApi";
import { t, tc } from "../i18n";
import { resolveRideBoardingIndex } from "../utils/rideProgress";
import styles from "./TripJourneyDetails.module.css";
import StopName from "./StopName";

const MAX_VISIBLE_NEXT_STOPS = 7;

function formatGtfsClock(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{1,3}):(\d{2}):\d{2}$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return "";
  }

  return `${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )}`;
}

export default function TripJourneyDetails({
  tripId,
  currentStopId,
  aimedDepartureTime = null,
  stopsById,
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("idle");
  const [stopTimes, setStopTimes] = useState([]);

  useEffect(() => {
    if (!expanded || !tripId) return undefined;

    const controller = new AbortController();
    setStatus("loading");

    fetchTripStopTimes(tripId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setStopTimes(items);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });

    return () => controller.abort();
  }, [expanded, tripId]);

  const journey = useMemo(() => {
    // A loop serves some stops twice, so the departure's own planned time
    // picks the pass being boarded; the first match used to list stops the
    // bus had already served. Only a pass that cannot be told apart falls
    // back to the first.
    const resolvedIndex = resolveRideBoardingIndex(
      stopTimes,
      currentStopId,
      aimedDepartureTime
    );
    const currentIndex =
      resolvedIndex >= 0
        ? resolvedIndex
        : stopTimes.findIndex((item) => item.stopId === String(currentStopId));
    const remaining =
      currentIndex >= 0 ? stopTimes.slice(currentIndex + 1) : stopTimes;

    return {
      visible: remaining.slice(0, MAX_VISIBLE_NEXT_STOPS),
      remainingCount: Math.max(
        0,
        remaining.length - MAX_VISIBLE_NEXT_STOPS
      ),
      finalStop: remaining.at(-1) || null,
    };
  }, [aimedDepartureTime, currentStopId, stopTimes]);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={expanded ? t("Hide stops") : t("Next stops")}
      >
        {/* A narrow phone gets the short Finnish label, so this and the
            get-off alert share one line; its words stay in the name. Open,
            it stays as short: "Hide next stops" pushed the alert button
            onto a line of its own. The name says what is on screen, so a
            passenger who speaks "Hide stops" to voice control reaches it;
            aria-expanded says it is the list below. */}
        <span className={styles.toggleLong} aria-hidden="true">
          {expanded ? t("Hide stops") : t("Next stops")}
        </span>
        <span className={styles.toggleShort} aria-hidden="true">
          {expanded ? t("Hide stops") : tc("short", "Next stops")}
        </span>
      </button>

      {expanded && (
        <div className={styles.panel}>
          <p className={styles.kicker}>{t("Next stops · timetable times")}</p>

          {status === "loading" && (
            <p className={styles.status} role="status">
              {t("Loading planned stops…")}
            </p>
          )}

          {status === "error" && (
            <p className={styles.status} role="status">
              {t("Next stops are temporarily unavailable.")}
            </p>
          )}

          {status === "ready" && journey.visible.length === 0 && (
            <p className={styles.status}>{t("No later stops are listed.")}</p>
          )}

          {status === "ready" && journey.visible.length > 0 && (
            <>
              <ol className={styles.list}>
                {journey.visible.map((item) => {
                  const clock = formatGtfsClock(
                    item.departureTime || item.arrivalTime
                  );
                  const approximate = item.timepoint === 0;

                  return (
                    <li key={`${item.stopId}-${item.stopSequence}`}>
                      <span><StopName stop={stopsById.get(item.stopId)} id={item.stopId} /></span>
                      <small>
                        {clock
                          ? approximate
                            ? t("around {time}", { time: clock })
                            : clock
                          : t("planned")}
                        {item.dropOffType === 1 ? ` · ${t("no drop-off")}` : ""}
                      </small>
                    </li>
                  );
                })}
              </ol>

              {journey.remainingCount > 0 && journey.finalStop && (
                <p className={styles.more}>
                  {t("+{count} more · final stop", {
                    count: journey.remainingCount,
                  })}{" "}
                  <strong><StopName stop={stopsById.get(journey.finalStop.stopId)} id={journey.finalStop.stopId} /></strong>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
