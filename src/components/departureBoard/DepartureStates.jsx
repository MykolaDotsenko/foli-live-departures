import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";

// What the board says in place of departures, and only what it can stand
// behind: still loading, a stop Föli does not have, an answer that failed,
// a timetable that could not be read, or a stop with nothing more today.
// When none of these applies, the departures themselves (its children) are
// shown.
function DepartureStates({
  stopId,
  loading,
  unknownStop,
  error,
  answerWasEmpty,
  scheduleFailed,
  scheduleIncomplete,
  upcomingCount,
  visibleCount,
  followedLines,
  timetableStatus,
  onRetryTimetable,
  onRefresh,
  onShowAllLines,
  children,
}) {
  // An empty board is only "no more buses" when a fresh answer says so.
  // A saved board whose buses have all left is no answer: while this
  // visit's first update loads, or after it fails, it said "No upcoming
  // departures" about a stop nobody had checked.
  return loading && upcomingCount === 0 ? (
    <div className={styles.state} role="status">
      <span className={styles.stateKicker}>{t("Connecting to Föli")}</span>
      <strong>{t("Loading departures…")}</strong>
    </div>
  ) : unknownStop && upcomingCount === 0 ? (
    // Not an empty stop: a number Föli's stop list does not have.
    <div className={styles.state} role="status">
      <strong>{t("Föli has no stop {id}.", { id: stopId })}</strong>
      <span>{t("Check the number, or search by the stop’s name.")}</span>
    </div>
  ) : error && upcomingCount === 0 && !answerWasEmpty ? (
    <div className={styles.state} role="alert">
      <strong>{t("Couldn’t load departures.")}</strong>
      <span>{t("Föli’s live times aren’t loading right now. Try again in a moment.")}</span>
      <button type="button" className={styles.retryButton} onClick={onRefresh}>
        {t("Try again")}
      </button>
    </div>
  ) : upcomingCount === 0 && (scheduleFailed || scheduleIncomplete) ? (
    // The live feed only looks an hour or so ahead. With the timetable
    // unread, or read only up to a trip that could not be checked, an
    // empty board is not "no more buses".
    <div className={styles.state} role="status">
      <strong>{t("No live departures right now.")}</strong>
      <span>
        {t(
          "The timetable could not be checked just now, so later buses may still run."
        )}
      </span>
      <button type="button" className={styles.retryButton} onClick={onRefresh}>
        {t("Try again")}
      </button>
    </div>
  ) : upcomingCount === 0 && !answerWasEmpty ? (
    <div className={styles.state} role="status">
      <span className={styles.stateKicker}>{t("Updating")}</span>
      <strong>{t("Checking for the next departures…")}</strong>
    </div>
  ) : upcomingCount === 0 ? (
    <div className={styles.state} role="status">
      <strong>{t("No upcoming departures.")}</strong>
      <span>{t("Try refreshing or choosing another nearby stop.")}</span>
    </div>
  ) : visibleCount === 0 &&
    (loading || timetableStatus === "loading") ? (
    // Buses are leaving here, and the followed lines' timetable is on
    // its way: nothing is known about them yet.
    <div className={styles.state} role="status">
      <span className={styles.stateKicker}>{t("Updating")}</span>
      <strong>
        {followedLines.length === 1
          ? t("Checking the timetable for line {line}…", {
              line: followedLines[0],
            })
          : t("Checking the timetable for lines {lines}…", {
              lines: followedLines.join(", "),
            })}
      </strong>
    </div>
  ) : visibleCount === 0 &&
    (error || timetableStatus === "error") ? (
    // Neither the live feed nor the timetable could say, so no claim
    // that the line is not running.
    <div className={styles.state} role="status">
      <strong>
        {followedLines.length === 1
          ? t("Line {line} is not in Föli’s live times right now.", {
              line: followedLines[0],
            })
          : t("Lines {lines} are not in Föli’s live times right now.", {
              lines: followedLines.join(", "),
            })}
      </strong>
      <span>
        {t("Its timetable could not be checked either, so buses may still run.")}
      </span>
      <div className={styles.stateActions}>
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => {
            onRetryTimetable();
            onRefresh?.();
          }}
        >
          {t("Try again")}
        </button>
        <button
          type="button"
          className={styles.retryButton}
          onClick={onShowAllLines}
        >
          {t("Show all lines")}
        </button>
      </div>
    </div>
  ) : visibleCount === 0 ? (
    // Buses are leaving here, and the timetable has nothing on the lines
    // followed either.
    <div className={styles.state} role="status">
      <strong>
        {followedLines.length === 1
          ? t("No departures on line {line} from this stop in the next 36 hours.", {
              line: followedLines[0],
            })
          : t("No departures on lines {lines} from this stop in the next 36 hours.", {
              lines: followedLines.join(", "),
            })}
      </strong>
      <span>{t("Other lines are leaving from this stop.")}</span>
      <button
        type="button"
        className={styles.retryButton}
        onClick={onShowAllLines}
      >
        {t("Show all lines")}
      </button>
    </div>
  ) : (
    children
  );
}

export default DepartureStates;
