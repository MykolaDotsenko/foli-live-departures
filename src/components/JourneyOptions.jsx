import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import {
  boardingDecision,
  directJourneyConfidence,
} from "../utils/journeyConfidence";
import { stopLabel } from "../utils/stopNames";
import { formatClock, formatLeaves } from "../utils/time";
import styles from "./JourneyOptions.module.css";

function labelText(label) {
  if (label === "latest-departure") return t("Latest departure");
  if (label === "less-walking") return t("Less walking");
  if (label === "easier-to-catch") return t("Easier to catch");
  if (label === "next-bus") return t("Next bus");
  if (label === "earlier-bus") return t("Earlier bus");
  return t("Fastest");
}

function displayedArrivalAt(departure) {
  const journeyArrival = Number(departure?.journeyArrivalAt);
  if (Number.isFinite(journeyArrival) && journeyArrival > 0) {
    return journeyArrival;
  }
  return departure?.destinationArrivalAt;
}

function hasFinalWalk(departure) {
  const raw = departure?.finalWalkDistanceM;
  if (raw === null || raw === undefined || raw === "") return false;
  const distance = Number(raw);
  return Number.isFinite(distance) && distance >= 0;
}

function estimateSourceText(liveState, includesFinalWalk = false) {
  if (includesFinalWalk) {
    if (liveState === "live") return t("Live transit + approximate walk");
    if (liveState === "schedule") {
      return t("Timetable + approximate walk");
    }
    if (liveState === "delayed") {
      return t("Realtime uncertain + approximate walk");
    }
    return t("Transit + approximate walk");
  }

  if (liveState === "live") return t("Live estimate");
  if (liveState === "schedule") return t("Timetable estimate");
  if (liveState === "delayed") return t("Realtime uncertain");
  return t("Estimate");
}

function confidenceText(option) {
  const confidence = directJourneyConfidence(option);
  if (confidence.level === "high") return t("High confidence");
  if (confidence.level === "medium") return t("Medium confidence");
  return t("Low confidence");
}

function boardingText(option) {
  const line = option?.departure?.lineRef || "—";
  const decision = boardingDecision(option?.departure?.catchability);
  // At the stop is where the passenger is, not the bus: "Board line 1 now"
  // stood over a bus still five minutes away.
  if (decision === "at-stop") {
    return t("Line {line} · you’re at its stop", { line });
  }
  if (decision === "comfortable") {
    return t("Line {line} · you should make it", { line });
  }
  if (decision === "likely") {
    return t("Line {line} · likely catchable", { line });
  }
  if (decision === "tight") {
    return t("Line {line} · tight — move now", { line });
  }
  return t("Line {line} · boarding confidence unavailable", { line });
}

function tradeoffText(option, single) {
  if (option.label === "less-walking") {
    const saved = Math.max(0, Math.round(-option.walkingDeltaMeters));
    const delayMin = Math.max(
      0,
      Math.round(Number(option.arrivalDeltaSec || 0) / 60)
    );
    return delayMin > 0
      ? t("{distance} less walking · about {minutes} min later", {
          distance: formatDistance(saved),
          minutes: delayMin,
        })
      : t("{distance} less walking", {
          distance: formatDistance(saved),
        });
  }

  if (option.label === "easier-to-catch") {
    const delayMin = Math.max(
      0,
      Math.round(Number(option.arrivalDeltaSec || 0) / 60)
    );
    return delayMin > 0
      ? t("More time to catch · about {minutes} min later", {
          minutes: delayMin,
        })
      : t("More time to catch");
  }

  // How much later the backup gets there, or, for arrive-by, earlier.
  const minutes = Math.round(Math.abs(Number(option.arrivalDeltaSec || 0)) / 60);
  if (option.label === "next-bus") {
    return minutes > 0
      ? t("If you miss the first one · about {minutes} min later", {
          minutes,
        })
      : t("If you miss the first one");
  }

  if (option.label === "earlier-bus") {
    return minutes > 0
      ? t("More margin · arrives about {minutes} min earlier", { minutes })
      : t("More margin");
  }

  if (option.label === "latest-departure") {
    return t("Latest departure we found that meets your arrival time");
  }

  // Beside its "Fastest", "Earliest arrival we found" said it twice. Alone,
  // what is worth the line is that nothing else goes there.
  return single ? t("The only bus there we found") : "";
}

// Where to get off, how long on the bus and the walk after it: what the
// card left to the get-off alert, and a newcomer wants before choosing.
function exitText(departure, stopsById) {
  const parts = [];
  const exitStop = stopsById?.get(String(departure?.destinationStopId || ""));
  if (exitStop) {
    parts.push(t("Get off at {name}", { name: stopLabel(exitStop) }));
  }
  const ride = Number(departure?.rideDurationSec);
  if (Number.isFinite(ride) && ride > 0) {
    parts.push(
      t("about {minutes} min on the bus", {
        minutes: Math.max(1, Math.round(ride / 60)),
      })
    );
  }
  if (hasFinalWalk(departure)) {
    parts.push(
      t("final walk ≈ {distance}", {
        distance: formatDistance(Number(departure.finalWalkDistanceM)),
      })
    );
  }
  return parts.join(" · ");
}

export default function JourneyOptions({
  options,
  destinationLabel,
  stopsById = null,
  onSelectJourney = null,
  onOpenStop = null,
  mode = "default",
  showBoardingConfidence = true,
}) {
  useLanguage();

  if (!Array.isArray(options) || options.length === 0) return null;
  // A label and a count compare options: with one, "Fastest" and "1
  // option" compared it with nothing.
  const several = options.length > 1;

  const recovery = mode === "recovery";
  const titleId = recovery
    ? "recovery-journey-options-title"
    : "direct-journey-options-title";

  return (
    <section
      className={styles.wrapper}
      aria-labelledby={titleId}
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>
            {recovery ? t("Fresh transfer options") : t("Direct options")}
          </p>
          <h3 id={titleId} tabIndex={recovery ? -1 : undefined}>
            {recovery
              ? t("Continue to {destination}", {
                  destination: destinationLabel,
                })
              : t("Best ways to {destination}", {
                  destination: destinationLabel,
                })}
          </h3>
        </div>
        {several && (
          <span className={styles.count}>
            {t("{count} options", { count: options.length })}
          </span>
        )}
      </div>

      <div className={styles.grid}>
        {options.map((option) => {
          const exit = exitText(option.departure, stopsById);
          const tradeoff = tradeoffText(option, !several);
          return (
            <button
              key={option.id}
              type="button"
              className={styles.card}
              data-primary={
                ["fastest", "latest-departure"].includes(option.label)
                  ? "true"
                  : undefined
              }
              onClick={() => {
                if (onSelectJourney) onSelectJourney(option);
                else onOpenStop?.(option.stopId);
              }}
            >
              {several && (
                <span className={styles.badge}>{labelText(option.label)}</span>
              )}

              <span className={styles.arrival}>
                {hasFinalWalk(option.departure)
                  ? t("Reach destination about {time}", {
                      time: formatClock(displayedArrivalAt(option.departure)),
                    })
                  : t("Arrive about {time}", {
                      time: formatClock(displayedArrivalAt(option.departure)),
                    })}
              </span>

              <span className={styles.route}>
                {/* The sign on the bus, so it is the one boarded. */}
                <strong>
                  {t("Line {line}", {
                    line: option.departure.lineRef || "—",
                  })}
                  {option.departure.headsign
                    ? ` → ${option.departure.headsign}`
                    : ""}
                </strong>
                <span aria-hidden="true"> · </span>
                {t("from {stop}", { stop: option.stopName })}
              </span>

              {exit && <span className={styles.route}>{exit}</span>}

              <span className={styles.meta}>
                {formatLeaves(option.departure.departureAt)} ·{" "}
                {formatDistance(option.distanceMeters)} {t("to stop")} ·{" "}
                {estimateSourceText(
                  option.departure.liveState,
                  hasFinalWalk(option.departure)
                )}
              </span>

              {showBoardingConfidence && (
                <span className={styles.decision}>
                  <strong>{boardingText(option)}</strong>
                  <span
                    className={styles.confidence}
                    data-confidence={directJourneyConfidence(option).level}
                  >
                    {confidenceText(option)}
                  </span>
                </span>
              )}

              {tradeoff && (
                <span className={styles.tradeoff}>{tradeoff}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Only what changes how to read the cards. A note that the options
          used "current Föli data and approximate straight-line distance"
          repeated the distance note under the stop list below them. */}
      {(recovery ||
        options.some((option) => hasFinalWalk(option.departure))) && (
        <p className={styles.note}>
          {recovery
            ? t(
                "These options start from the transfer area. Your journey changes only after you choose one."
              )
            : t(
                "Arrival includes an approximate final walk based on straight-line distance; the real walking route can be longer."
              )}
        </p>
      )}
    </section>
  );
}
