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

function transferCount(option) {
  if (Array.isArray(option?.transfers)) return option.transfers.length;
  return option?.transfer ? 1 : 0;
}

function legs(option) {
  if (Array.isArray(option?.legs) && option.legs.length) return option.legs;
  return [option?.first, option?.second].filter(Boolean);
}

function transfers(option) {
  if (Array.isArray(option?.transfers)) return option.transfers;
  return option?.transfer ? [option.transfer] : [];
}

function transferSummary(option) {
  return transfers(option)
    .map((transfer, index) => {
      const sameStop =
        String(transfer?.alightStopId || "") ===
        String(transfer?.boardStopId || "");
      const stop =
        transfer?.boardStopName || transfer?.boardStopId || "—";
      return sameStop
        ? t("Change {number}: {stop} · same stop", {
            number: index + 1,
            stop,
          })
        : t("Change {number}: {stop} · walk ≈ {distance}", {
            number: index + 1,
            stop,
            distance: formatDistance(transfer?.walkingDistanceM || 0),
          });
    })
    .join(" · ");
}

function worstFeasibility(option) {
  const all = transfers(option).map((item) => item?.feasibility).filter(Boolean);
  if (all.some((item) => item.state === "tight")) {
    return all.find((item) => item.state === "tight");
  }
  if (all.some((item) => item.state === "acceptable")) {
    return all.find((item) => item.state === "acceptable");
  }
  return all[0] || null;
}

export default function TransferJourneyOptions({
  options,
  destinationLabel,
  onSelectJourney,
  mode = "default",
}) {
  useLanguage();
  if (!Array.isArray(options) || options.length === 0) return null;

  const maxTransfers = Math.max(...options.map(transferCount));
  const recovery = mode === "recovery";
  const headingId = recovery
    ? "recovery-transfer-journey-options-title"
    : "transfer-journey-options-title";

  return (
    <section
      className={styles.wrapper}
      aria-labelledby={headingId}
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>
            {recovery ? t("Fresh transfer options") : t("Transfer options")}
          </p>
          <h3 id={headingId} tabIndex={recovery ? -1 : undefined}>
            {recovery
              ? t("Continue to {destination} with a new connection", {
                  destination: destinationLabel,
                })
              : maxTransfers > 1
              ? t("Ways to {destination} with up to two changes", {
                  destination: destinationLabel,
                })
              : t("Ways to {destination} with one change", {
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
          const optionTransfers = transferCount(option);
          const routeLegs = legs(option);
          const feasibility = worstFeasibility(option);
          const margin = marginText(feasibility);
          return (
            <button
              key={option.id}
              type="button"
              className={styles.card}
              data-risk={feasibility?.state || "unknown"}
              onClick={() => onSelectJourney?.(option)}
            >
              <span className={styles.badge}>
                {optionTransfers === 1
                  ? t("1 transfer")
                  : t("{count} transfers", { count: optionTransfers })}
              </span>

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
                  {routeLegs
                    .map((leg) => t("Line {line}", { line: leg?.lineRef || "—" }))
                    .join(" → ")}
                </strong>
              </span>

              <span className={styles.transfer}>
                {transferSummary(option)}
              </span>

              <span className={styles.meta}>
                {formatDistance(option.originDistanceMeters)} {t("to first stop")} ·{" "}
                {formatDue(routeLegs[0]?.departureAt)}
                {" · "}
                {t("total walking ≈ {distance}", {
                  distance: formatDistance(option.totalWalkingDistanceM || 0),
                })}
              </span>

              <span className={styles.risk}>
                {riskText(feasibility)}
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
        {recovery
          ? t(
              "This replacement starts from the transfer area. Nothing changes until you choose it."
            )
          : t(
              "Future buses are rechecked against fresh live data. The app keeps each committed leg explicit and never silently switches you to another journey."
            )}
      </p>
    </section>
  );
}

