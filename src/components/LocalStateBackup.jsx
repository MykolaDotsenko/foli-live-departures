import { useRef, useState } from "react";
import { t, useLanguage } from "../i18n";
import {
  applyPreparedLocalStateImport,
  MAX_BACKUP_BYTES,
  prepareLocalStateImport,
  serializeLocalStateBackup,
} from "../utils/localStateBackup";
import styles from "./LocalStateBackup.module.css";

function backupFilename(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return `turku-departures-backup-${date}.json`;
}

function triggerDownload(text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupFilename();
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function errorPhrase(error) {
  switch (error?.message) {
    case "backup-empty":
      return t("The backup file is empty.");
    case "backup-invalid-json":
    case "backup-not-object":
    case "backup-wrong-kind":
      return t("This is not a Turku Departures backup file.");
    case "backup-unsupported-version":
      return t("This backup version is not supported by this app.");
    case "backup-too-large":
      return t("This backup file is unexpectedly large and was not opened.");
    case "backup-storage-unavailable":
      return t("This browser would not allow access to local app data.");
    default:
      return t("The backup could not be read. Nothing was changed.");
  }
}

export default function LocalStateBackup() {
  useLanguage();
  const inputRef = useRef(null);
  const [prepared, setPrepared] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const downloadBackup = () => {
    setError("");
    setFeedback("");
    try {
      triggerDownload(serializeLocalStateBackup());
      setFeedback(
        t(
          "Backup downloaded. It contains saved places, favourites, line filters and explicit language/theme choices — never recent stops, GPS or ride history."
        )
      );
    } catch (downloadError) {
      setError(
        downloadError?.message === "backup-export-too-large"
          ? t(
              "There is too much saved data for this backup format. Nothing was downloaded."
            )
          : t("The backup could not be downloaded on this browser.")
      );
    }
  };

  const chooseFile = () => {
    setError("");
    setFeedback("");
    inputRef.current?.click();
  };

  const readFile = async (event) => {
    const [file] = event.target.files || [];
    // Choosing the same file again must still fire change after cancel/error.
    event.target.value = "";
    if (!file) return;

    setPrepared(null);
    setFeedback("");
    setError("");

    if (file.size > MAX_BACKUP_BYTES) {
      setError(t("This backup file is unexpectedly large and was not opened."));
      return;
    }

    try {
      const text = await file.text();
      setPrepared(prepareLocalStateImport(text));
    } catch (readError) {
      setError(errorPhrase(readError));
    }
  };

  const applyImport = () => {
    if (!prepared) return;
    try {
      const preview = applyPreparedLocalStateImport(prepared);
      setPrepared(null);
      setError("");
      setFeedback(
        t(
          "Backup imported. Newer local settings were kept, favourites were merged, and recent stops stayed only on this browser."
        )
      );
      return preview;
    } catch {
      setError(
        t(
          "The backup could not be applied completely. Import stopped and the app tried to restore your previous local data."
        )
      );
      return null;
    }
  };

  const preview = prepared?.preview;

  return (
    <section
      className={styles.wrapper}
      aria-labelledby="local-state-backup-title"
    >
      <h3 id="local-state-backup-title">{t("Backup & transfer")}</h3>
      <p className={styles.intro}>
        {t(
          "Moving to another browser or future app address? Download a local backup, then import it there. Nothing is uploaded by Turku Departures."
        )}
      </p>
      <p className={styles.privacy}>
        {t(
          "The backup includes My Places, favourite stops, line filters and explicit language/theme choices. It never includes recent stops, GPS coordinates, Ride Mode or journey history."
        )}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={downloadBackup}>
          {t("Download backup")}
        </button>
        <button type="button" className={styles.secondary} onClick={chooseFile}>
          {t("Choose backup file")}
        </button>
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept=".json,application/json"
          aria-label={t("Backup file")}
          onChange={readFile}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {feedback && (
        <p className={styles.feedback} role="status">
          {feedback}
        </p>
      )}

      {preview && (
        <div className={styles.preview} aria-labelledby="backup-preview-title">
          <div>
            <p className={styles.kicker}>{t("Review before importing")}</p>
            <h4 id="backup-preview-title">{t("What this backup can add")}</h4>
          </div>

          <dl className={styles.summary}>
            <div>
              <dt>{t("My Places")}</dt>
              <dd>
                {t("{count} in backup · {added} new · {updated} newer", {
                  count: preview.placeCount,
                  added: preview.placesAdded,
                  updated: preview.placesUpdated,
                })}
              </dd>
            </div>
            <div>
              <dt>{t("Favourite stops")}</dt>
              <dd>
                {t("{count} in backup · {added} new", {
                  count: preview.favoriteCount,
                  added: preview.favoritesAdded,
                })}
              </dd>
            </div>
            <div>
              <dt>{t("Line filters")}</dt>
              <dd>
                {preview.lineFiltersSkipped > 0
                  ? t(
                      "{count} in backup · {added} new · {updated} newer · {skipped} not imported because this browser is full",
                      {
                        count: preview.lineFilterCount,
                        added: preview.lineFiltersAdded,
                        updated: preview.lineFiltersUpdated,
                        skipped: preview.lineFiltersSkipped,
                      }
                    )
                  : t("{count} in backup · {added} new · {updated} newer", {
                      count: preview.lineFilterCount,
                      added: preview.lineFiltersAdded,
                      updated: preview.lineFiltersUpdated,
                    })}
              </dd>
            </div>
            <div>
              <dt>{t("Language and theme")}</dt>
              <dd>
                {preview.languageWillImport || preview.themeWillImport
                  ? t("Imported only where this browser has no explicit choice.")
                  : t("This browser’s explicit language and theme choices stay unchanged.")}
              </dd>
            </div>
          </dl>

          <p className={styles.safety}>
            {t(
              "Import merges with what is already here. Older backup values never replace newer saved places or line filters."
            )}
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={applyImport}>
              {t("Import this backup")}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setPrepared(null)}
            >
              {t("Cancel import")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
