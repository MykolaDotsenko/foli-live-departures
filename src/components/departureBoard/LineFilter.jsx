import styles from "../BusStopDisplay.module.css";
import { t } from "../../i18n";
import { routeBadgeStyle } from "./rowPresentation";

// The lines a passenger follows at this stop: the button in the board's
// header that says which are followed, and the chips it opens to choose
// them. What is followed is kept per stop by useLineFilter; this only shows
// and changes it.

export function LineFilterButton({ followedLines, open, onToggle }) {
  return (
    <button
      type="button"
      className={styles.filterButton}
      aria-expanded={open}
      aria-controls="line-filter"
      data-active={followedLines.length > 0 ? "true" : "false"}
      onClick={onToggle}
    >
      {followedLines.length === 1
        ? t("Only line {line}", { line: followedLines[0] })
        : followedLines.length > 1
          ? t("Only lines {lines}", { lines: followedLines.join(", ") })
          : t("Filter lines")}
    </button>
  );
}

function LineFilter({
  linesOnOffer,
  followedLines,
  onFollowedLinesChange,
  routesByShortName,
}) {
  const toggleLine = (line) =>
    onFollowedLinesChange(
      followedLines.includes(line)
        ? followedLines.filter((followed) => followed !== line)
        : [...followedLines, line]
    );

  return (
    <div
      id="line-filter"
      className={styles.lineFilter}
      role="group"
      aria-label={t("Show only these lines")}
    >
      <button
        type="button"
        className={styles.lineChip}
        aria-pressed={followedLines.length === 0}
        onClick={() => onFollowedLinesChange([])}
      >
        {t("All lines")}
      </button>
      {linesOnOffer.map((line) => {
        const followed = followedLines.includes(line);
        return (
          <button
            key={line}
            type="button"
            className={styles.lineChip}
            aria-pressed={followed}
            aria-label={t("Line {line}", { line })}
            onClick={() => toggleLine(line)}
          >
            <span
              className={styles.lineChipBadge}
              style={routeBadgeStyle(routesByShortName?.get(line))}
              aria-hidden="true"
            >
              {line}
            </span>
            {followed && (
              <span className={styles.lineChipCheck} aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default LineFilter;
