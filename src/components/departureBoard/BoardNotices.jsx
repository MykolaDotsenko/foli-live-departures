import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";
import { formatClock, formatElapsedAge } from "../../utils/time";

// What the board says about its own times, around the departures: how many
// are live, whether they are older than they look, when only the timetable
// is speaking, and what "live" means. The board decides when each is shown;
// these only say it.

export function DepartureSummary({ visibleCount, realtimeCount }) {
  return (
    // A group, so its name is read: on a plain div the label was ignored.
    <div
      className={styles.summary}
      role="group"
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

// How fresh the times below are, when that needs saying. Offline and a
// failed or ageing update are one status, reworded in place: a screen
// reader announces a change inside a live region it already knows, and may
// say nothing about a new one.
export function FreshnessNotice({ offlineSince, error, receiptAgeSeconds }) {
  return (
    <p className={styles.staleNotice} role="status">
      {offlineSince !== null ? (
        t("Offline · last updated {time}", { time: formatClock(offlineSince) })
      ) : (
        <>
          {error ? t("Live update failed") : t("Live data is getting old")}
          {receiptAgeSeconds !== null
            ? ` · ${t("last successful update {age}", {
                age: formatElapsedAge(receiptAgeSeconds),
              })}`
            : ""}
        </>
      )}
    </p>
  );
}

export function ScheduleNotice({ realtimeAvailable, scheduleIncomplete }) {
  return (
    <p className={styles.staleNotice} role="status">
      {realtimeAvailable === false
        ? t("Live times aren’t available · showing the timetable.")
        : t("No live times right now · showing the timetable.")}
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
