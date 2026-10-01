import useClockTick from "../hooks/useClockTick";
import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import { formatClock, formatDue } from "../utils/time";
import styles from "./ActiveJourney.module.css";

function phaseTitle(journey) {
  if (journey.phase === "recovery") return t("Choose another route");
  if (journey.phase === "waiting") {
    return t("Wait for line {line}", { line: journey.lineRef || "—" });
  }
  return t("Walk to {stop}", { stop: journey.stopName });
}

function destinationText(journey) {
  return journey.destinationKind === "saved-place"
    ? t(journey.destinationLabel)
    : journey.destinationLabel;
}

function recoveryText(journey) {
  return journey.recoveryReason === "cancelled"
    ? t("Your selected bus was cancelled.")
    : t("Your selected bus is no longer a reliable option.");
}

export default function ActiveJourney({
  journey,
  stop,
  online = true,
  monitoringState = "active",
  onConfirmAtStop,
  onShowDeparture,
  onChooseAnother,
  onOpenStop,
}) {
  useLanguage();
  const nowMs = useClockTick(10_000);

  if (!journey) return null;

  const walkingUrl = online ? buildWalkingDirectionsUrl(stop) : "";

  return (
    <section
      className={styles.wrapper}
      data-phase={journey.phase}
      aria-labelledby="active-journey-title"
    >
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{t("Active journey")}</p>
          <h2 id="active-journey-title" tabIndex={-1}>
            {phaseTitle(journey)}
          </h2>
        </div>
        <span className={styles.destination}>
          {t("To {destination}", {
            destination: destinationText(journey),
          })}
        </span>
      </div>

      <div className={styles.summary}>
        <strong>
          {t("Line {line}", { line: journey.lineRef || "—" })}
        </strong>
        <span>
          {t("Leaves {due}", {
            due: formatDue(journey.departureAt, nowMs),
          })}
        </span>
        {journey.destinationKind === "external-place" &&
        journey.journeyArrivalAt ? (
          <span>
            {t("Reach destination about {time}", {
              time: formatClock(journey.journeyArrivalAt),
            })}
          </span>
        ) : journey.destinationArrivalAt ? (
          <span>
            {t("Arrive about {time}", {
              time: formatClock(journey.destinationArrivalAt),
            })}
          </span>
        ) : null}
        {journey.destinationKind === "external-place" &&
          journey.finalWalkDistanceM !== null && (
            <span>
              {t("final walk ≈ {distance}", {
                distance: formatDistance(journey.finalWalkDistanceM),
              })}
            </span>
          )}
      </div>

      {journey.destinationKind === "external-place" && (
        <p className={styles.note}>
          {t(
            "Final walk is approximate straight-line based guidance. The real walking route can be longer."
          )}
        </p>
      )}

      {journey.phase === "walking-to-stop" && (
        <>
          <p className={styles.primaryStatus}>
            {t("About {distance} to the boarding stop.", {
              distance: formatDistance(journey.distanceMeters),
            })}
          </p>
          <p className={styles.note}>
            {t(
              "When you reach the stop, confirm it here. The app will not assume your physical location."
            )}
          </p>
        </>
      )}

      {journey.phase === "waiting" && (
        <>
          <p className={styles.primaryStatus}>
            {t("Your selected bus is pinned first in the departure board.")}
          </p>
          <p className={styles.note}>
            {t(
              "When you board, use Get-off alert on that departure. Ride Mode remains in control after that."
            )}
          </p>
        </>
      )}

      {journey.phase === "recovery" && (
        <p className={styles.recovery} role="status">
          {recoveryText(journey)}
        </p>
      )}

      {!online && journey.phase !== "recovery" && (
        <p className={styles.offline}>
          {t("Offline: this selected plan may be out of date.")}
        </p>
      )}

      {online &&
        journey.phase !== "recovery" &&
        monitoringState === "paused" && (
          <p className={styles.monitoringNotice} role="status">
            {t(
              "Live monitoring is paused while another stop is open. Return to the selected stop to resume it."
            )}
          </p>
        )}

      {online &&
        journey.phase !== "recovery" &&
        monitoringState === "degraded" && (
          <p className={styles.monitoringNotice} role="status">
            {t(
              "Live monitoring is temporarily unavailable. The selected departure may be out of date."
            )}
          </p>
        )}

      <div className={styles.actions}>
        {journey.phase !== "recovery" &&
          monitoringState === "paused" && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onOpenStop}
            >
              {t("Return to selected stop")}
            </button>
          )}

        {journey.phase === "walking-to-stop" &&
          monitoringState !== "paused" && (
            <>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onConfirmAtStop}
              >
                {t("I'm at the stop")}
              </button>
              {walkingUrl && (
                <a
                  className={styles.secondaryLink}
                  href={walkingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Walk there")}
                </a>
              )}
            </>
          )}

        {journey.phase === "waiting" &&
          monitoringState !== "paused" && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onShowDeparture}
            >
              {t("Show selected departure")}
            </button>
          )}

        {journey.phase === "recovery" && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onChooseAnother}
          >
            {t("Find another option")}
          </button>
        )}

        {journey.phase !== "recovery" && (
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onChooseAnother}
          >
            {t("Choose another route")}
          </button>
        )}

        {journey.phase === "recovery" && (
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onOpenStop}
          >
            {t("View selected stop")}
          </button>
        )}
      </div>
    </section>
  );
}
