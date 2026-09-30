import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { formatClock, formatDue } from "../utils/time";
import styles from "./DirectJourneyOptions.module.css";

function optionTitle(kind) {
  if (kind === "less-walking") return t("Less walking");
  if (kind === "easier-to-catch") return t("Easier to catch");
  return t("Fastest");
}

function liveLabel(state) {
  if (state === "live") return t("Live");
  if (state === "delayed") return t("Live data is aging");
  if (state === "schedule") return t("Schedule");
  return t("Estimate");
}

function comparisonText(option, fastest) {
  if (!fastest || option.id === fastest.id) return "";

  const slowerBySec =
    Number(option.destinationArrivalAt) -
    Number(fastest.destinationArrivalAt);
  const slowerMinutes = Math.max(0, Math.round(slowerBySec / 60));

  if (option.kind === "less-walking") {
    const walkSaving = Math.max(
      0,
      Math.round(
        Number(fastest.distanceMeters) - Number(option.distanceMeters)
      )
    );
    if (slowerMinutes > 0) {
      return t("{distance} less walking · about {minutes} min slower", {
        distance: formatDistance(walkSaving),
        minutes: slowerMinutes,
      });
    }
    return t("{distance} less walking", {
      distance: formatDistance(walkSaving),
    });
  }

  if (option.kind === "easier-to-catch") {
    return slowerMinutes > 0
      ? t("More time to catch · about {minutes} min slower", {
          minutes: slowerMinutes,
        })
      : t("More time to catch");
  }

  return "";
}

export default function DirectJourneyOptions({
  destinationLabel,
  options,
  onChoose,
}) {
  useLanguage();
  if (!Array.isArray(options) || options.length === 0) return null;

  const fastest = options.find((option) => option.kind === "fastest") || options[0];

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="direct-journey-options-title"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>{t("Best routes")}</p>
          <h3 id="direct-journey-options-title">
            {t("Best ways to {destination}", {
              destination: destinationLabel,
            })}
          </h3>
        </div>
        <p className={styles.summary}>
          {t("Compared by realistic arrival, walking and catchability.")}
        </p>
      </div>

      <div className={styles.grid}>
        {options.map((option) => {
          const comparison = comparisonText(option, fastest);
          return (
            <article
              key={option.id}
              className={styles.card}
              data-primary={option.kind === "fastest" ? "true" : undefined}
            >
              <button
                type="button"
                className={styles.cardButton}
                onClick={() => onChoose(option)}
                aria-label={t(
                  "{label}: line {line}, stop {stop}, arrive about {time}",
                  {
                    label: optionTitle(option.kind),
                    line: option.lineRef || "—",
                    stop: option.stopName,
                    time: formatClock(option.destinationArrivalAt),
                  }
                )}
              >
                <span className={styles.titleRow}>
                  <strong className={styles.title}>
                    {option.kind === "fastest" && (
                      <span aria-hidden="true">★ </span>
                    )}
                    {optionTitle(option.kind)}
                  </strong>
                  <span className={styles.arrival}>
                    {t("Arrive {time}", {
                      time: formatClock(option.destinationArrivalAt),
                    })}
                  </span>
                </span>

                <span className={styles.routeRow}>
                  <strong>{t("Line {line}", { line: option.lineRef || "—" })}</strong>
                  <span aria-hidden="true">·</span>
                  <span>{formatDue(option.departureAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{liveLabel(option.liveState)}</span>
                </span>

                <span className={styles.walkRow}>
                  {t("Walk {distance} to {stop}", {
                    distance: formatDistance(option.distanceMeters),
                    stop: option.stopName,
                  })}
                </span>

                {comparison && (
                  <span className={styles.comparison}>{comparison}</span>
                )}

                <span className={styles.action}>{t("Use this option")}</span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
