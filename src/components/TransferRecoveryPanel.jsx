import { t, useLanguage } from "../i18n";
import JourneyOptions from "./JourneyOptions";
import styles from "./JourneyOptions.module.css";

/** @param {any} destination */
function shownDestinationLabel(destination) {
  if (!destination) return "";
  return destination.kind === "saved-place"
    ? t(destination.label)
    : destination.label;
}

export default function TransferRecoveryPanel({
  state,
  options,
  destination,
  onSelectJourney,
}) {
  useLanguage();

  if (!destination || state === "idle") return null;

  const destinationLabel = shownDestinationLabel(destination);
  if (state === "ready" && Array.isArray(options) && options.length > 0) {
    return (
      <JourneyOptions
        mode="recovery"
        options={options}
        destinationLabel={destinationLabel}
        onSelectJourney={onSelectJourney}
      />
    );
  }

  let statusText = "";
  if (state === "loading") {
    statusText = t("Checking fresh buses from this transfer area…");
  } else if (state === "offline") {
    statusText = t("Recovery search will resume when you’re online.");
  } else if (state === "error") {
    statusText = t(
      "Recovery search is temporarily unavailable. Your destination is kept."
    );
  } else if (state === "ready") {
    statusText = t(
      "No reliable direct replacement is available from this transfer area right now."
    );
  }

  if (!statusText) return null;

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="recovery-journey-options-title"
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>{t("Fresh transfer options")}</p>
          <h3 id="recovery-journey-options-title">
            {t("Continue to {destination}", {
              destination: destinationLabel,
            })}
          </h3>
        </div>
      </div>
      <p className={styles.note} role="status" aria-live="polite">
        {statusText}
      </p>
      <p className={styles.note}>
        {t(
          "The failed bus is excluded. Nothing changes until you choose a new option."
        )}
      </p>
    </section>
  );
}
