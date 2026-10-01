import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { formatClock, formatDue } from "../utils/time";
import styles from "./TransferJourneyOptions.module.css";

function riskText(feasibility) {
  if (feasibility?.state === "comfortable") return t("Comfortable transfer");
  if (feasibility?.state === "acceptable") return t("Reasonable transfer");
  return t("Tight transfer");
}

function marginText(feasibility) {
  const slack = Number(feasibility?.slackSec);
  if (!Number.isFinite(slack) || slack < 0) return "";
  const minutes = Math.max(1, Math.floor(slack / 60));
  return t("about {minutes} min transfer margin", { minutes });
}

function hasFinalWalk(option) {
  const distance = Number(option?.finalWalkDistanceM);
  return (
    option?.finalWalkDistanceM !== null &&
    option?.finalWalkDistanceM !== undefined &&
    Number.isFinite(distance) &&
    distance >= 0
  );
}

export default function TransferJourneyOptions({
  options,
  destinationLabel,
  onSelectJourney,
}) {
  useLanguage();
  if (!Array.isArray(options) || options.length === 0) return null;

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="transfer-journey-options-title"
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>{t("One-transfer options")}</p>
          <h3 id="transfer-journey-options-title">
            {t("Ways to {destination} with one change", {
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
        {options.map((option) => {
          const margin = marginText(option.transfer?.feasibility);
          const sameStop =
            String(option.transfer?.alightStopId || "") ===
            String(option.transfer?.boardStopId || "");
          return (
            <button
              key={option.id}
              type="button"
              className={styles.card}
              data-risk={option.transfer?.feasibility?.state || "unknown"}
              onClick={() => onSelectJourney?.(option)}
            >
              <span className={styles.badge}>{t("1 transfer")}</span>

              <span className={styles.arrival}>
                {hasFinalWalk(option)
                  ? t("Reach destination about {time}", {
                      time: formatClock(option.journeyArrivalAt),
                    })
                  : t("Arrive about {time}", {
                      time: formatClock(option.journeyArrivalAt),
                    })}
              </span>

              <span className={styles.route}>
                <strong>
                  {t("Line {first} → line {second}", {
                    first: option.first?.lineRef || "—",
                    second: option.second?.lineRef || "—",
                  })}
                </strong>
              </span>

              <span className={styles.transfer}>
                {sameStop
                  ? t("Change at {stop} · same stop", {
                      stop: option.transfer?.boardStopName || option.transfer?.boardStopId,
                    })
                  : t("Change at {stop} · transfer walk ≈ {distance}", {
                      stop: option.transfer?.boardStopName || option.transfer?.boardStopId,
                      distance: formatDistance(option.transfer?.walkingDistanceM || 0),
                    })}
              </span>

              <span className={styles.meta}>
                {formatDistance(option.originDistanceMeters)} {t("to first stop")} ·{" "}
                {formatDue(option.first?.departureAt)}
                {" · "}
                {t("total walking ≈ {distance}", {
                  distance: formatDistance(option.totalWalkingDistanceM || 0),
                })}
              </span>

              <span className={styles.risk}>
                {riskText(option.transfer?.feasibility)}
                {margin ? <> · {margin}</> : null}
              </span>

              {hasFinalWalk(option) && (
                <span className={styles.finalWalk}>
                  {t("final walk ≈ {distance}", {
                    distance: formatDistance(Number(option.finalWalkDistanceM)),
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className={styles.note}>
        {t(
          "The second bus is based on timetable data. Live changes can reduce the transfer margin, so the app only recommends connections with conservative walking and uncertainty allowance."
        )}
      </p>
    </section>
  );
}
