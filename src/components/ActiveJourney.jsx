import useClockTick from "../hooks/useClockTick";
import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import { formatClock, formatLeaves } from "../utils/time";
import styles from "./ActiveJourney.module.css";

function itineraryContext(journey) {
  const activeIndex = Number(journey?.activeLegIndex);
  if (
    journey?.itinerary &&
    Number.isInteger(activeIndex) &&
    activeIndex >= 0
  ) {
    const legs = journey.itinerary.legs || [];
    return {
      activeIndex,
      totalLegs: legs.length,
      current: legs[activeIndex] || null,
      previousTransfer:
        activeIndex > 0
          ? journey.itinerary.transfers?.[activeIndex - 1] || null
          : null,
      nextTransfer: journey.itinerary.transfers?.[activeIndex] || null,
      next: legs[activeIndex + 1] || null,
    };
  }

  if (journey?.transferPlan) {
    const legacyIndex = journey.transferLeg === 2 ? 1 : 0;
    return {
      activeIndex: legacyIndex,
      totalLegs: 2,
      current:
        legacyIndex === 0
          ? journey.transferPlan.first || null
          : journey.transferPlan.second || null,
      previousTransfer:
        legacyIndex === 1 ? journey.transferPlan.transfer || null : null,
      nextTransfer:
        legacyIndex === 0 ? journey.transferPlan.transfer || null : null,
      next:
        legacyIndex === 0 ? journey.transferPlan.second || null : null,
    };
  }

  return null;
}

function isTransferContinuationLeg(journey) {
  return (itineraryContext(journey)?.activeIndex || 0) > 0;
}

function currentLegUsesSameTransferStop(journey) {
  const transfer = itineraryContext(journey)?.previousTransfer;
  return Boolean(
    transfer &&
      String(transfer.alightStopId || "") ===
        String(transfer.boardStopId || "")
  );
}

// Chosen beside the boarding stop, on a fix accurate enough to tell (see
// activeJourneyFromOption): telling the passenger to walk there read as if
// they were somewhere else. Arrival is still theirs to confirm.
function isNearBoardingStop(journey) {
  return (
    journey?.nearStopAtSelection === true && !isTransferContinuationLeg(journey)
  );
}

function phaseTitle(journey) {
  if (journey.phase === "recovery") return t("Choose another route");
  if (journey.phase === "waiting") {
    return t("Wait for line {line}", { line: journey.lineRef || "—" });
  }
  if (currentLegUsesSameTransferStop(journey)) {
    return t("Stay at {stop}", { stop: journey.stopName });
  }
  if (isNearBoardingStop(journey)) {
    return t("You’re near {stop}", { stop: journey.stopName });
  }
  return t("Walk to {stop}", { stop: journey.stopName });
}

// "Leaves 5 min" and, a minute before, "Leaves Due" put a departure-board
// cell into a sentence.
function destinationText(journey) {
  return journey.destinationKind === "saved-place"
    ? t(journey.destinationLabel)
    : journey.destinationLabel;
}

function recoveryText(journey) {
  if (journey.recoveryReason === "cancelled") {
    return t("Your selected bus was cancelled.");
  }
  const totalLegs = itineraryContext(journey)?.totalLegs || 0;
  if (journey.recoveryReason === "transfer-cancelled") {
    return totalLegs > 2
      ? t("A committed future bus was cancelled. Choose a fresh option.")
      : t("Your second bus was cancelled. Choose a fresh option.");
  }
  if (journey.recoveryReason === "transfer-missed") {
    return totalLegs > 2
      ? t(
          "A committed future bus has probably been missed. Choose a fresh option."
        )
      : t("The second bus has probably been missed. Choose a fresh option.");
  }
  if (journey.recoveryReason === "transfer-risk") {
    return t(
      "The selected transfer can no longer be continued safely. Choose a fresh option."
    );
  }
  return t("Your selected bus is no longer a reliable option.");
}

function transferPlanText(journey) {
  const context = itineraryContext(journey);
  if (!context || context.totalLegs < 2) return "";

  const current = context.activeIndex + 1;
  if (context.next && context.nextTransfer) {
    return t(
      "Leg {current} of {total} · change at {stop} to line {line}",
      {
        current,
        total: context.totalLegs,
        stop:
          context.nextTransfer.boardStopName ||
          context.nextTransfer.boardStopId ||
          "—",
        line: context.next.lineRef || "—",
      }
    );
  }

  return t("Leg {current} of {total} · continue on line {line}", {
    current,
    total: context.totalLegs,
    line: journey.lineRef || context.current?.lineRef || "—",
  });
}

function transferLiveStatusText(journey) {
  const context = itineraryContext(journey);
  const state =
    context?.next
      ? journey.futureLegRevalidations?.[context.activeIndex + 1] ||
        journey.transferRevalidation
      : null;
  if (
    !context?.next ||
    journey.phase === "recovery" ||
    !state
  ) {
    return "";
  }

  const line = context.next.lineRef || "—";
  const slackSec = Number(state.feasibility?.slackSec);
  const marginMinutes =
    Number.isFinite(slackSec) && slackSec >= 0
      ? Math.floor(slackSec / 60)
      : null;

  if (state.providerState === "live" && state.decision === "good") {
    return marginMinutes === null
      ? t("Live check: line {line} still looks catchable.", { line })
      : t(
          "Live check: line {line} still looks catchable · about {minutes} min transfer margin.",
          { line, minutes: marginMinutes }
        );
  }

  if (state.providerState === "live" && state.decision === "tight") {
    if (marginMinutes === null) {
      return t("Live check: the transfer to line {line} is tight.", { line });
    }
    if (marginMinutes < 1) {
      return t(
        "Live check: the transfer to line {line} is tight · less than 1 min margin.",
        { line }
      );
    }
    return t(
      "Live check: the transfer to line {line} is tight · about {minutes} min margin.",
      { line, minutes: marginMinutes }
    );
  }

  if (
    state.providerState === "degraded" ||
    state.providerState === "stale" ||
    state.providerState === "missing"
  ) {
    return t(
      "Live check for line {line} is uncertain. Keeping the selected connection until stronger evidence.",
      { line }
    );
  }

  return "";
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

  const transferLiveStatus = transferLiveStatusText(journey);
  const itinerary = itineraryContext(journey);
  const continuationLeg = isTransferContinuationLeg(journey);
  const sameTransferStop = currentLegUsesSameTransferStop(journey);
  const hasFutureLeg = Boolean(itinerary?.next && itinerary?.nextTransfer);
  const walkingUrl =
    online && !sameTransferStop && !isNearBoardingStop(journey)
      ? buildWalkingDirectionsUrl(stop)
      : "";

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

      {itinerary?.totalLegs > 1 && (
        <p className={styles.transferPlan}>{transferPlanText(journey)}</p>
      )}

      {transferLiveStatus && (
        <p className={styles.monitoringNotice} aria-live="polite">
          {transferLiveStatus}
        </p>
      )}

      <div className={styles.summary}>
        <strong>
          {t("Line {line}", { line: journey.lineRef || "—" })}
        </strong>
        <span>{formatLeaves(journey.departureAt, nowMs)}</span>
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
          {(continuationLeg ||
            isNearBoardingStop(journey) ||
            Number(journey.distanceMeters) > 0) && (
            <p className={styles.primaryStatus}>
              {continuationLeg
                ? sameTransferStop
                  ? t("Stay here for line {line}.", {
                      line: journey.lineRef || "—",
                    })
                  : t("Walk about {distance} to {stop} for line {line}.", {
                      distance: formatDistance(journey.distanceMeters),
                      stop: journey.stopName,
                      line: journey.lineRef || "—",
                    })
                : t("About {distance} to the boarding stop.", {
                    distance: formatDistance(journey.distanceMeters),
                  })}
            </p>
          )}
          {/* Arrival is never assumed from a location; the note names the
              button that confirms it instead of explaining that policy. */}
          <p className={styles.note}>
            {continuationLeg
              ? sameTransferStop
                ? t(
                    "You are at the transfer stop. Confirm it below before waiting for the next bus."
                  )
                : t("When you get to the transfer stop, tap “I'm at the stop”.")
              : t("When you get to the stop, tap “I'm at the stop”.")}
          </p>
        </>
      )}

      {journey.phase === "waiting" && (
        <>
          <p className={styles.primaryStatus}>
            {continuationLeg
              ? t("Wait here for line {line}.", {
                  line: journey.lineRef || "—",
                })
              : t("Your selected bus is pinned first in the departure board.")}
          </p>
          <p className={styles.note}>
            {hasFutureLeg
              ? itinerary?.totalLegs > 2
                ? t(
                    "When you board, start the Get-off alert for this leg. Ride Mode stays in control until you get off, then Journey Assistant resumes with the next leg."
                  )
                : t(
                    "When you board, start the Get-off alert for the selected transfer stop. Ride Mode stays in control until you get off, then Journey Assistant resumes with leg 2."
                  )
              : continuationLeg
                ? t(
                    "When line {line} arrives, open the selected departure and start the Get-off alert.",
                    { line: journey.lineRef || "—" }
                  )
                : t(
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
            {t("Your bus isn’t updated while another stop is open.")}
          </p>
        )}

      {online &&
        journey.phase !== "recovery" &&
        monitoringState === "degraded" && (
          <p className={styles.monitoringNotice} role="status">
            {t("Can’t update your bus right now. Its time may be out of date.")}
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
              {t("Back to {stop}", { stop: journey.stopName })}
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
              {continuationLeg
                ? t("Show line {line} departure", {
                    line: journey.lineRef || "—",
                  })
                : t("Show selected departure")}
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
