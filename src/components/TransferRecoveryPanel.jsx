import { t, useLanguage } from "../i18n";
import JourneyOptions from "./JourneyOptions";
import TransferJourneyOptions from "./TransferJourneyOptions";
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
  transferOptions = [],
  destination,
  onSelectJourney,
  onSelectTransferJourney,
}) {
  useLanguage();

  if (!destination || state === "idle") return null;

  const destinationLabel = shownDestinationLabel(destination);
  const hasDirect =
    state === "ready" && Array.isArray(options) && options.length > 0;
  const hasTransfer =
    state === "ready" &&
    Array.isArray(transferOptions) &&
    transferOptions.length > 0;

  if (hasDirect || hasTransfer) {
    return (
      <>
        {hasDirect && (
          <JourneyOptions
            mode="recovery"
            options={options}
            destinationLabel={destinationLabel}
            onSelectJourney={onSelectJourney}
          />
        )}
        {hasTransfer && (
          <TransferJourneyOptions
            mode="recovery"
            options={transferOptions}
            destinationLabel={destinationLabel}
            onSelectJourney={onSelectTransferJourney}
          />
        )}
        <p className={styles.note}>
          {t(
            "The failed bus is excluded. Nothing changes until you choose a new option."
          )}
        </p>
      </>
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
      "No reliable replacement is available from this transfer area right now."
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
          <h3 id="recovery-journey-options-title" tabIndex={-1}>
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
