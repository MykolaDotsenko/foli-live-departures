import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";
import { formatClock, formatElapsedAge } from "../../utils/time";
import { LineFilterButton } from "./LineFilter";

// The top of the board: which stop this is, whether it is saved, how old
// its times are, and the controls that change what the board shows. The
// meta line is a live region, so a screen reader hears the stop change and
// the board refresh without leaving the departures.
function BoardHeader({
  stopId,
  stopName,
  loading,
  refreshing,
  serverTime,
  receiptAgeSeconds,
  isFavorite,
  onToggleFavorite,
  filterable,
  followedLines,
  lineFilterOpen,
  onToggleLineFilter,
  onRefresh,
}) {
  return (
    <header
      className={styles.header}
      data-filterable={filterable ? "true" : "false"}
    >
      <div className={styles.stopHeading}>
        <div className={styles.stopTitleRow}>
          {/* Focusable from code only: choosing a saved stop, or ending a
              ride, brings focus here once the button pressed is gone. */}
          <h1
            id="departures-title"
            className={styles.stopName}
            tabIndex={-1}
          >
            {stopName ? (
              <span lang="fi">{stopName}</span>
            ) : loading ? (
              t("Loading…")
            ) : (
              t("Stop {id}", { id: stopId })
            )}
          </h1>
          {stopName && (
            <button
              type="button"
              className={styles.favoriteButton}
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={
                isFavorite
                  ? t("Remove {name} from favourites", { name: stopName })
                  : t("Save {name} to favourites", { name: stopName })
              }
              title={isFavorite ? t("Remove favourite") : t("Save favourite")}
            >
              <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
            </button>
          )}
        </div>
        <p className={styles.stopMeta} aria-live="polite">
          {[
            // Without Föli's name the heading already says "Stop {id}".
            stopName || loading ? t("Stop {id}", { id: stopId }) : "",
            serverTime ? t("Updated {time}", { time: formatClock(serverTime) }) : "",
            receiptAgeSeconds !== null && receiptAgeSeconds >= 60
              ? formatElapsedAge(receiptAgeSeconds)
              : "",
            refreshing ? t("Refreshing…") : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Beside the stop's name, not in a row of its own: on an iPhone
          with the service updates open, that row pushed the first
          departure off the screen. */}
      <div className={styles.headerActions}>
        {filterable && (
          <LineFilterButton
            followedLines={followedLines}
            open={lineFilterOpen}
            onToggle={onToggleLineFilter}
          />
        )}
        {/* Busy rather than disabled: a disabled button drops keyboard
            focus to the page, and this one is busy every half minute. */}
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => {
            if (!loading && !refreshing) onRefresh?.();
          }}
          aria-disabled={loading || refreshing ? "true" : undefined}
        >
          {refreshing ? t("Refreshing…") : t("Refresh")}
        </button>
      </div>
    </header>
  );
}

export default BoardHeader;
