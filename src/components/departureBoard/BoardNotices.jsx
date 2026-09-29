import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";
import { formatClock, formatElapsedAge } from "../../utils/time";

// What the board says about its own times, around the departures: how many
// are live, whether they are older than they look, when only the timetable
// is speaking, and what "live" means. The board decides when each is shown;
// these only say it.

export function DepartureSummary({ visibleCount, realtimeCount }) {
  return (
    <div
      className={styles.summary}
      aria-label={t("Departure data summary")}
    >
      <span>{t("{count} upcoming", { count: visibleCount })}</span>
      <span>
        <strong>{realtimeCount}</strong>{" "}
        {t("live", { count: realtimeCount })}
      </span>
      <span>
        {t("{count} scheduled", {
          count: visibleCount - realtimeCount,
        })}
      </span>
    </div>
  );
}

export function OfflineNotice({ serverTime }) {
  return (
    <p className={styles.staleNotice} role="status">
      {t("Offline · last updated {time}", { time: formatClock(serverTime) })}
    </p>
  );
}

export function StaleNotice({ error, receiptAgeSeconds }) {
  return (
    <p className={styles.staleNotice} role="status">
      {error ? t("Live update failed") : t("Live data is getting old")}
      {receiptAgeSeconds !== null
        ? ` · ${t("last successful update {age}", {
            age: formatElapsedAge(receiptAgeSeconds),
          })}`
        : ""}
    </p>
  );
}

export function ScheduleNotice({ realtimeAvailable, scheduleIncomplete }) {
  return (
    <p className={styles.staleNotice} role="status">
      {realtimeAvailable === false
        ? t("Live updates are unavailable · showing scheduled Föli times.")
        : t(
            "No live departure is published right now · showing the next scheduled Föli times."
          )}
      {scheduleIncomplete
        ? ` ${t(
            "Later departures could not be checked, so more buses may run after these."
          )}`
        : ""}
    </p>
  );
}

export function LiveEstimatesLegend() {
  return (
    <details className={styles.legend}>
      <summary>{t("About live estimates")}</summary>
      <p>
        {t(
          "Live times are Föli’s estimates from the buses themselves. A bus’s distance is a straight line from its last reported position. Scheduled means Föli has no live data for that trip right now."
        )}
      </p>
    </details>
  );
}
