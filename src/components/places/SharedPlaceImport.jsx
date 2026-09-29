// The prompt shown when a passenger opens a place someone shared with
// them: what the link would add or replace, a word on trust, and a clear
// way to say no.
import { t } from "../../i18n";
import { PLACE_PRESETS } from "../../hooks/useSavedPlaces";
import styles from "../MyPlaces.module.css";
import StopName from "../StopName";
import { PLACE_PHRASES } from "./placePhrases";

export default function SharedPlaceImport({ place, replacing, onImport, onDismiss }) {
  const preset = PLACE_PRESETS.find((candidate) => candidate.id === place.id);
  if (!preset) return null;

  const phrases = PLACE_PHRASES[preset.id];

  return (
    <section
      className={styles.importCard}
      aria-labelledby="shared-place-title"
    >
      <p className={styles.kicker}>{t("Shared place")}</p>
      <h3 id="shared-place-title">
        {replacing ? t(phrases.replaceQuestion) : t(phrases.addQuestion)}
      </h3>
      {/* What is being added comes first; the warning a passenger acts on
          follows it, in one sentence each. */}
      <div className={styles.importStops}>
        {place.stops.map((stop) => (
          <span key={stop.id}>
            <strong><StopName stop={stop} /></strong>
            <small>
              {t("Stop {id}", { id: stop.id })}
              {stop.id === place.primaryStopId ? ` · ${t("main stop")}` : ""}
            </small>
          </span>
        ))}
      </div>
      <p className={styles.helper}>
        {t(
          "Only add places from people you trust. The stops show roughly where this place is, though never an address."
        )}
      </p>
      <div className={styles.setupActions}>
        <button type="button" className={styles.primaryButton} onClick={onImport}>
          {replacing ? t(phrases.replace) : t(phrases.add)}
        </button>
        <button type="button" className={styles.textButton} onClick={onDismiss}>
          {t("Not now")}
        </button>
      </div>
    </section>
  );
}
