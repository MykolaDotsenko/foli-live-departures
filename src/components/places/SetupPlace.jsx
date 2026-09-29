// The form that turns nearby public stops into a saved place: tick the
// stops a passenger actually uses, mark the main one, and confirm them in
// plain words before anything is saved.
import { useState } from "react";
import { t } from "../../i18n";
import { formatAccuracy, formatDistance } from "../../utils/geo";
import styles from "../MyPlaces.module.css";
import StopName from "../StopName";
import { PLACE_PHRASES } from "./placePhrases";
import { isReliableSetupLocation, toggleStopSelection } from "./placeSetup";

export default function SetupPlace({
  preset,
  candidates,
  accuracy,
  preselectFirst = false,
  onCancel,
  onSave,
}) {
  const reliableLocation = isReliableSetupLocation(accuracy, candidates);
  const shouldPreselectFirst = preselectFirst || reliableLocation;
  const [selectedIds, setSelectedIds] = useState(
    () =>
      new Set(shouldPreselectFirst && candidates[0] ? [candidates[0].id] : [])
  );
  const [primaryStopId, setPrimaryStopId] = useState(
    shouldPreselectFirst ? candidates[0]?.id || "" : ""
  );
  const [confirmedSafe, setConfirmedSafe] = useState(false);

  const toggleStop = (stopId) => {
    const next = toggleStopSelection(
      selectedIds,
      primaryStopId,
      stopId,
      candidates
    );
    setConfirmedSafe(false);
    setPrimaryStopId(next.primaryStopId);
    setSelectedIds(next.selectedIds);
  };

  const selectedStops = candidates.filter((stop) => selectedIds.has(stop.id));
  const phrases = PLACE_PHRASES[preset.id];
  // Plain words, and no "safe": a parent reads that as a promise about the
  // stop itself, which no app can make.
  const confirmationLabel = t(
    selectedStops.length === 1 ? phrases.rightStop : phrases.rightStops
  );

  return (
    <section
      className={styles.setup}
      aria-labelledby={`setup-${preset.id}-title`}
    >
      <div className={styles.setupHeader}>
        <div>
          <p className={styles.kicker}>{t("My Places")}</p>
          {/* Takes focus as the setup opens: the button that opened it is
              gone with the card it was on. */}
          <h3 id={`setup-${preset.id}-title`} tabIndex={-1}>
            {t(phrases.setupTitle)}
          </h3>
        </div>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>

      {/* One thing to do, then the list. The reasoning behind it read as a
          wall of text above the stops, so it waits behind "How this works";
          what is kept about the passenger stays in plain view. */}
      <p className={styles.helper}>
        {preselectFirst
          ? t(
              "Review the public stop you selected and confirm that it is suitable for this destination."
            )
          : t(phrases.choose)}
      </p>
      <details className={styles.setupDetails}>
        <summary>{t("How this works")}</summary>
        <p>
          {preselectFirst
            ? ""
            : `${t(
                "When location quality is good and a stop is reasonably close, the nearest stop is selected first. Otherwise you must choose manually."
              )} `}
          {t(phrases.backupAdvice)}
        </p>
      </details>
      <p className={styles.privacy}>
        {t(
          "Only public stop numbers and names are saved; your exact location is discarded."
        )}
      </p>

      <p className={styles.meta}>
        {preselectFirst
          ? t("Using the stop you selected manually")
          : Number.isFinite(accuracy)
            ? t("Location accuracy ±{accuracy}", {
                accuracy: formatAccuracy(accuracy),
              })
            : t("Location accuracy unavailable")}
        {!preselectFirst && !reliableLocation
          ? ` · ${t(
              "no stop was preselected — choose and confirm an arrival stop yourself"
            )}`
          : ""}
      </p>

      <div className={styles.candidateList}>
        {candidates.map((stop) => {
          const checked = selectedIds.has(stop.id);
          return (
            <div key={stop.id} className={styles.candidate}>
              <label className={styles.safeChoice}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStop(stop.id)}
                />
                <span>
                  <strong><StopName stop={stop} /></strong>
                  {/* A stop chosen by hand has no distance: "Stop 164 ·"
                      ended on a dot with nothing after it. */}
                  <small>
                    {t("Stop {id}", { id: stop.id })}
                    {formatDistance(stop.distanceMeters)
                      ? ` · ${formatDistance(stop.distanceMeters)}`
                      : ""}
                  </small>
                </span>
              </label>

              {/* Every radio was called "Main stop", so a screen reader
                  going through them could not tell which stop each one
                  made the main one. The stop's name is added out of
                  sight, after the words on screen. */}
              <label className={styles.primaryChoice}>
                <input
                  type="radio"
                  name={`primary-${preset.id}`}
                  checked={primaryStopId === stop.id}
                  disabled={!checked}
                  onChange={() => setPrimaryStopId(stop.id)}
                />
                {t("Main stop")}
                <span className={styles.srOnly}>
                  : <StopName stop={stop} />
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <label className={styles.confirmSafe}>
        <input
          type="checkbox"
          checked={confirmedSafe}
          onChange={(event) => setConfirmedSafe(event.target.checked)}
        />
        <span>{confirmationLabel}</span>
      </label>

      <div className={styles.setupActions}>
        {(selectedStops.length === 0 || !primaryStopId || !confirmedSafe) && (
          <p id={`setup-${preset.id}-needs`} className={styles.saveHint}>
            {selectedStops.length === 0
              ? t("Tick at least one stop to save.")
              : t("Confirm the stop above to save.")}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          aria-describedby={
            selectedStops.length === 0 || !primaryStopId || !confirmedSafe
              ? `setup-${preset.id}-needs`
              : undefined
          }
          disabled={
            selectedStops.length === 0 || !primaryStopId || !confirmedSafe
          }
          onClick={() =>
            onSave({
              id: preset.id,
              stops: selectedStops.map((stop) => ({
                id: stop.id,
                name: stop.name,
              })),
              primaryStopId,
            })
          }
        >
          {t(phrases.save)}
        </button>
      </div>
    </section>
  );
}
