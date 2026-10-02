import { useState } from "react";
import { t, useLanguage } from "../i18n";
import styles from "./FieldTestReport.module.css";

function downloadReport(report) {
  const blob = new Blob([report], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "turku-departures-field-report.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function FieldTestReport({ report }) {
  useLanguage();
  const [status, setStatus] = useState("");

  if (!report) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setStatus(t("Field-test report copied."));
    } catch {
      setStatus(t("Could not copy the report. Download it instead."));
    }
  };

  return (
    <section className={styles.wrapper} aria-labelledby="field-test-report-title">
      <div>
        <p className={styles.kicker}>{t("Field-test diagnostics")}</p>
        <h2 id="field-test-report-title">{t("Field-test report ready")}</h2>
        <p className={styles.copy}>
          {t(
            "This local report contains the build, public trip/stop identifiers and sanitized live-data states. It does not include GPS coordinates, saved-place labels or device identifiers."
          )}
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={copy}>
          {t("Copy report")}
        </button>
        <button type="button" onClick={() => downloadReport(report)}>
          {t("Download report")}
        </button>
      </div>
      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
    </section>
  );
}
