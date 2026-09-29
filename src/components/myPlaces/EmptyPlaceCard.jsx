// A place that is not set up yet: its name, "Not set", and the two ways to
// start, from where the passenger stands or from the stop they have open.
import { useState } from "react";
import { t } from "../../i18n";
import { placeLabel } from "../../hooks/useSavedPlaces";
import { stopLabel } from "../../utils/stopNames";
import styles from "../MyPlaces.module.css";
import PlaceIcon from "../PlaceIcon";
import { PLACE_PHRASES } from "./placePhrases";

export default function EmptyPlaceCard({
  preset,
  activeStop,
  status,
  onStartSetup,
  onStartFromSelectedStop,
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const label = placeLabel(preset);

  return (
    <article
      className={styles.emptyCard}
      data-mobile-expanded={mobileExpanded ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.mobileSummary}
        onClick={() => setMobileExpanded((current) => !current)}
        aria-expanded={mobileExpanded}
      >
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={preset.id} />
        </span>
        <span className={styles.mobileSummaryText}>
          <strong>{label}</strong>
          <small>{t("Not set")}</small>
        </span>
        <span className={styles.mobileSummaryAction} aria-hidden="true">
          {mobileExpanded ? "−" : "+"}
        </span>
      </button>

      <div className={styles.emptyBody}>
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={preset.id} />
        </span>
        <div>
          <h3>{label}</h3>
        </div>
        <div className={styles.emptyActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onStartSetup(preset.id)}
            disabled={status === "locating"}
            aria-busy={status === "locating"}
            aria-label={t(PLACE_PHRASES[preset.id].locate)}
          >
            {t("Use my location")}
          </button>
          {activeStop && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => onStartFromSelectedStop(preset.id)}
              aria-label={t(PLACE_PHRASES[preset.id].useStop, {
                name: stopLabel(activeStop),
              })}
            >
              {t("Use {name}", { name: stopLabel(activeStop) })}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
