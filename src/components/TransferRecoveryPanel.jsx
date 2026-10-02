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
  directOptions = options,
  transferOptions = [],
  destination,
  onSelectJourney,
  onSelectTransferJourney,
}) {
  useLanguage();

  if (!destination || state === "idle") return null;

  const destinationLabel = shownDestinationLabel(destination);
  const direct = Array.isArray(directOptions) ? directOptions : [];
  const transfers = Array.isArray(transferOptions) ? transferOptions : [];
  if (state === "ready" && (direct.length > 0 || transfers.length > 0)) {
    return (
      <>
        {direct.length > 0 && (
          <JourneyOptions
            mode="recovery"
            options={direct}
            destinationLabel={destinationLabel}
            onSelectJourney={onSelectJourney}
          />
        )}
        {transfers.length > 0 && (
          <TransferJourneyOptions
            mode="recovery"
            options={transfers}
            destinationLabel={destinationLabel}
            onSelectJourney={onSelectTransferJourney}
          />
        )}
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
      "No reliable replacement with at most one new transfer is available from this transfer area right now."
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
