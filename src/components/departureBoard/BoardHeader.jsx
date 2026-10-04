import { useEffect, useState } from "react";
import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";
import { formatClock, formatElapsedAge } from "../../utils/time";
import { LineFilterButton } from "./LineFilter";

// How long the word after ★ stays.
const FAVORITE_NOTE_MS = 8000;

// Ticking ★ filled the star and nothing else: a favourite is listed under
// the stop search, but never while its own board is open, so nothing on
// screen said it had worked or where to find it.
function favoriteNoteText(note) {
  if (note === "saved") return t("Saved. You’ll find it under the stop search.");
  if (note === "removed") return t("Removed from favourites.");
  return "";
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" />
    </svg>
  );
}

// The top of the board: which stop this is, whether it is saved, how old
// its times are, and the controls that change what the board shows.
//
// A screen reader hears a change of stop from App, in a line of its own
// that changes only with the stop. This meta line used to be that live
// region, and every 30-second refresh read it out twice: "Refreshing…",
// then "Updated 08:11". Refreshing is said by the button alone.
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
  unknownStop = false,
  showRefresh = true,
}) {
  const [favoriteNote, setFavoriteNote] = useState({ stopId: "", note: "" });
  const shownNote =
    favoriteNote.stopId === stopId ? favoriteNoteText(favoriteNote.note) : "";

  useEffect(() => {
    if (!favoriteNote.note) return undefined;
    const timer = globalThis.setTimeout(
      () => setFavoriteNote({ stopId: "", note: "" }),
      FAVORITE_NOTE_MS
    );
    return () => globalThis.clearTimeout(timer);
  }, [favoriteNote]);

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
              onClick={() => {
                onToggleFavorite?.();
                setFavoriteNote({
                  stopId,
                  note: isFavorite ? "removed" : "saved",
                });
              }}
              // One name, and pressed says whether it is saved. A name that
              // changed with the state as well read "Remove Kauppatori from
              // favourites, pressed", which says the opposite of itself.
              aria-pressed={isFavorite}
              aria-label={t("Save {name} to favourites", { name: stopName })}
              title={isFavorite ? t("Remove favourite") : t("Save favourite")}
            >
              <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
            </button>
          )}
        </div>
        <p className={styles.stopMeta}>
          {[
            // Without Föli's name the heading already says "Stop {id}".
            stopName || loading ? t("Stop {id}", { id: stopId }) : "",
            serverTime ? t("Updated {time}", { time: formatClock(serverTime) }) : "",
            receiptAgeSeconds !== null && receiptAgeSeconds >= 60
              ? formatElapsedAge(receiptAgeSeconds)
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {/* Heard from a region always in the page, so it is announced: a
            live region added at that moment often is not. Seen only while
            there is something to say, so an empty line takes no room. */}
        <p className={styles.srOnly} role="status">
          {shownNote}
        </p>
        {shownNote && (
          <p className={styles.favoriteNote} aria-hidden="true">
            {shownNote}
          </p>
        )}
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
        {/* A number Föli does not have gets nothing new from asking again. */}
        {/* An icon: the board refreshes itself every half minute, and a
            "Refresh" button as large as "Filter lines" took half the
            header for something rarely needed. */}
        {!unknownStop && showRefresh && (
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              if (!loading && !refreshing) onRefresh?.();
            }}
            aria-disabled={loading || refreshing ? "true" : undefined}
            aria-label={refreshing ? t("Refreshing…") : t("Refresh")}
            title={refreshing ? t("Refreshing…") : t("Refresh")}
          >
            <RefreshIcon />
          </button>
        )}
      </div>
    </header>
  );
}

export default BoardHeader;
