import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import styles from "./ActiveJourney.module.css";

/** @import { FinalWalkIntent } from "../types/journey" */

/**
 * @param {{
 *   walk: FinalWalkIntent | null,
 *   online?: boolean,
 *   onDone: () => void,
 * }} props
 */
export default function FinalWalk({
  walk,
  online = true,
  onDone,
}) {
  useLanguage();
  if (!walk) return null;

  const directionsUrl = online
    ? buildWalkingDirectionsUrl({ lat: walk.lat, lon: walk.lon })
    : "";
  const distance = formatDistance(walk.distanceMeters);

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="final-walk-title"
      role="region"
    >
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{t("Final walk")}</p>
          <h2 id="final-walk-title" tabIndex={-1}>
            {t("Walk to {destination}", {
              destination: walk.destinationLabel,
            })}
          </h2>
        </div>
        <span className={styles.destination}>
          {t("From {stop}", { stop: walk.fromStopName })}
        </span>
      </div>

      <p className={styles.primaryStatus}>
        {distance
          ? t("About {distance} from your exit stop.", { distance })
          : t("Continue from your exit stop to the destination.")}
      </p>

      <p className={styles.note}>
        {t(
          "Walking distance is approximate. Open walking directions for the street route."
        )}
      </p>

      {!online && (
        <p className={styles.offline} role="status">
          {t("Walking directions return when you’re online.")}
        </p>
      )}

      <div className={styles.actions}>
        {directionsUrl && (
          <a
            className={styles.primaryButton}
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("Open walking directions")}
          </a>
        )}
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onDone}
        >
          {t("Done")}
        </button>
      </div>
    </section>
  );
}
