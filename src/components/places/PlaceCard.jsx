// One saved place on the page: the button that gets a passenger there, the
// stop to open, the card to show the driver, and any backup stops. On a
// phone it folds down to a one-line summary until tapped.
import { useState } from "react";
import { t } from "../../i18n";
import { hasCoordinates } from "../../utils/geo";
import { buildTransitDirectionsUrl } from "../../utils/maps";
import { placeLabel } from "../../hooks/useSavedPlaces";
import { stopLabel } from "../../utils/stopNames";
import SafePlaceDriverCard from "../SafePlaceDriverCard";
import styles from "../MyPlaces.module.css";
import PlaceIcon from "../PlaceIcon";
import StopName from "../StopName";
import { journeyAction, PLACE_PHRASES } from "./placePhrases";
import { primaryStopOf, resolvePlaceStops } from "./placeStops";
import PlaceManage from "./PlaceManage";

export default function PlaceCard({
  place,
  stops,
  online,
  onOpenStop,
  onSetPrimaryStop,
  onReplace,
  onRemove,
  locating = false,
}) {
  const [showDriver, setShowDriver] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const label = placeLabel(place);
  const resolvedStops = resolvePlaceStops(place, stops);
  const primaryStop = primaryStopOf(resolvedStops, place.primaryStopId);
  // A place with no stop has nowhere to send anyone, and reading the id of
  // the stop it does not have took the whole page down with it.
  if (!primaryStop) return null;

  const backupCount = resolvedStops.length - 1;
  const transitUrl =
    online && hasCoordinates(primaryStop)
      ? buildTransitDirectionsUrl(primaryStop)
      : "";

  return (
    <article
      className={styles.placeCard}
      data-mobile-expanded={mobileExpanded ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.mobileSummary}
        onClick={() =>
          setMobileExpanded((current) => {
            if (current) setShowDriver(false);
            return !current;
          })
        }
        aria-expanded={mobileExpanded}
      >
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={place.id} />
        </span>
        <span className={styles.mobileSummaryText}>
          <strong>{label}</strong>
          <small>
            {place.needsReview ? `${t("Needs review")} · ` : ""}
            <StopName stop={primaryStop} /> · {t("stop {id}", { id: primaryStop.id })}
          </small>
        </span>
        <span className={styles.mobileSummaryAction} aria-hidden="true">
          {mobileExpanded ? "−" : "›"}
        </span>
      </button>

      <div className={styles.placeHeading}>
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={place.id} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>
            {t("Main stop: {name} · stop {id}", {
              name: stopLabel(primaryStop),
              id: primaryStop.id,
            })}
          </p>
        </div>
      </div>

      {place.needsReview && (
        <p className={styles.reviewNotice} role="status">
          {t(
            "One or more of its stops are no longer in Föli’s stop list. Check this place before you rely on it."
          )}
        </p>
      )}

      <div className={styles.placeActions}>
        {transitUrl ? (
          <a
            className={styles.goButton}
            href={transitUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("{action} by public transit", {
              action: journeyAction(place),
            })}
          >
            {journeyAction(place)}
          </a>
        ) : (
          <button type="button" className={styles.goButton} disabled>
            {journeyAction(place)}
          </button>
        )}

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onOpenStop(primaryStop.id)}
        >
          {t(PLACE_PHRASES[place.id].open)}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setShowDriver(true)}
        >
          {t("Show to driver")}
        </button>
      </div>

      {backupCount > 0 && (
        <details className={styles.backups}>
          <summary>
            {backupCount === 1
              ? t("1 backup stop")
              : t("{count} backup stops", { count: backupCount })}
          </summary>
          <div className={styles.backupList}>
            {resolvedStops.map((stop) => (
              <div key={stop.id} className={styles.backupRow}>
                <span>
                  <strong><StopName stop={stop} /></strong>
                  <small>{t("Stop {id}", { id: stop.id })}</small>
                </span>
                {stop.id === primaryStop.id ? (
                  <span className={styles.primaryBadge}>{t("Main stop")}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => onSetPrimaryStop(place.id, stop.id)}
                  >
                    {t("Make main stop")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <PlaceManage
        place={place}
        label={label}
        onReplace={onReplace}
        onRemove={onRemove}
        locating={locating}
      />

      {showDriver && (
        <SafePlaceDriverCard
          place={place}
          primaryStop={primaryStop}
          idPrefix="place"
          onClose={() => setShowDriver(false)}
        />
      )}
    </article>
  );
}
