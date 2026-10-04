import { t, useLanguage } from "../i18n";
import { directionBetween, formatDistance } from "../utils/geo";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import styles from "./ActiveJourney.module.css";

/** @import { FinalWalkIntent } from "../types/journey" */

function directionText(direction) {
  if (direction === "north") return t("north");
  if (direction === "north-east") return t("north-east");
  if (direction === "east") return t("east");
  if (direction === "south-east") return t("south-east");
  if (direction === "south") return t("south");
  if (direction === "south-west") return t("south-west");
  if (direction === "west") return t("west");
  if (direction === "north-west") return t("north-west");
  return "";
}

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
  const distance =
    walk.distanceMeters === null
      ? ""
      : formatDistance(walk.distanceMeters);
  const direction = directionBetween(
    { lat: walk.fromLat, lon: walk.fromLon },
    { lat: walk.lat, lon: walk.lon }
  );
  const directionLabel = directionText(direction);

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
          {walk.fromStopName}
          {distance ? ` · ≈${distance}` : ""}
        </span>
      </div>

      {directionLabel && (
        <p className={styles.note}>
          {t("Destination is roughly {direction} from this stop.", {
            direction: directionLabel,
          })}
        </p>
      )}

      <p className={styles.note}>
        {t(
          "Walking distance is approximate straight-line guidance. The real walking route can be longer."
        )}
      </p>

      {!online && (
        <p className={styles.offline} role="status">
          {t("Walking link unavailable offline.")}
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
            {t("Walk there")}
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
