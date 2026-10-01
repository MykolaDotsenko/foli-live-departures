import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { formatClock, formatDue } from "../utils/time";
import styles from "./JourneyOptions.module.css";

function labelText(label) {
  if (label === "less-walking") return t("Less walking");
  if (label === "easier-to-catch") return t("Easier to catch");
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

function estimateSourceText(liveState) {
  if (liveState === "live") return t("Live estimate");
  if (liveState === "schedule") return t("Timetable estimate");
  if (liveState === "delayed") return t("Realtime uncertain");
  return t("Estimate");
}

function tradeoffText(option) {
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

  return t("Earliest arrival we found");
}

export default function JourneyOptions({
  options,
  destinationLabel,
  onSelectJourney = null,
  onOpenStop = null,
}) {
  useLanguage();

  if (!Array.isArray(options) || options.length === 0) return null;

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="direct-journey-options-title"
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>{t("Direct options")}</p>
          <h3 id="direct-journey-options-title">
            {t("Best ways to {destination}", {
              destination: destinationLabel,
            })}
          </h3>
        </div>
        <span className={styles.count}>
          {options.length === 1
            ? t("1 option")
            : t("{count} options", { count: options.length })}
        </span>
      </div>

      <div className={styles.grid}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.card}
            data-primary={option.label === "fastest" ? "true" : undefined}
            onClick={() => {
              if (onSelectJourney) onSelectJourney(option);
              else onOpenStop?.(option.stopId);
            }}
          >
            <span className={styles.badge}>{labelText(option.label)}</span>

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
              <strong>
                {t("Line {line}", {
                  line: option.departure.lineRef || "—",
                })}
              </strong>
              <span aria-hidden="true"> · </span>
              {t("from {stop}", { stop: option.stopName })}
            </span>

            <span className={styles.meta}>
              {formatDistance(option.distanceMeters)} {t("to stop")} ·{" "}
              {formatDue(option.departure.departureAt)} ·{" "}
              {estimateSourceText(option.departure.liveState)}
              {hasFinalWalk(option.departure) && (
                <>
                  {" · "}
                  {t("final walk ≈ {distance}", {
                    distance: formatDistance(
                      Number(option.departure.finalWalkDistanceM)
                    ),
                  })}
                </>
              )}
            </span>

            <span className={styles.tradeoff}>{tradeoffText(option)}</span>
          </button>
        ))}
      </div>

      <p className={styles.note}>
        {options.some((option) => hasFinalWalk(option.departure))
          ? t(
              "Arrival includes an approximate final walk based on straight-line distance; the real walking route can be longer."
            )
          : t(
              "Direct options use current Föli data and approximate straight-line distance to the boarding stop."
            )}
      </p>
    </section>
  );
}
