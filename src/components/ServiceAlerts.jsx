import { useState } from "react";
import styles from "./ServiceAlerts.module.css";
import { getLanguage, intlLocale, t } from "../i18n";
import {
  elapsedSince,
  formatClock,
  formatElapsedAge,
  serviceDateTimeFormat,
} from "../utils/time";
import useClockTick from "../hooks/useClockTick";

const DEFAULT_VISIBLE_ALERTS = 4;
const STALE_ALERT_CHECK_SECONDS = 10 * 60;

function humanizeCode(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// GTFS-Realtime's causes, in words. A code Föli adds later is still shown,
// spelt out as best it can be in English; in Finnish, a code spelt out is
// English, so it is simply another cause.
function causeLabel(code) {
  switch (code) {
    case "UNKNOWN_CAUSE":
      return t("Unknown cause");
    case "OTHER_CAUSE":
      return t("Other cause");
    case "TECHNICAL_PROBLEM":
      return t("Technical problem");
    case "STRIKE":
      return t("Strike");
    case "DEMONSTRATION":
      return t("Demonstration");
    case "ACCIDENT":
      return t("Accident");
    case "HOLIDAY":
      return t("Holiday");
    case "WEATHER":
      return t("Weather");
    case "MAINTENANCE":
      return t("Maintenance");
    case "CONSTRUCTION":
      return t("Construction work");
    case "POLICE_ACTIVITY":
      return t("Police activity");
    case "MEDICAL_EMERGENCY":
      return t("Medical emergency");
    default:
      return getLanguage() === "fi" ? t("Other cause") : humanizeCode(code);
  }
}

// "Valid until 26 Sept, 16:12", or "Voimassa 26.9. klo 16:12 asti": the date
// in the language's own form, the time on the transit clock.
function formatValidity(validity) {
  if (!validity?.end) return "";

  try {
    const date = serviceDateTimeFormat(
      getLanguage() === "fi"
        ? { day: "numeric", month: "numeric" }
        : { day: "numeric", month: "short" },
      intlLocale()
    ).format(new Date(validity.end * 1000));
    return t("Valid until {date}, {time}", {
      date,
      time: formatClock(validity.end),
    });
  } catch {
    return "";
  }
}

function AlertItem({ alert }) {
  const [detailsOpen, setDetailsOpen] = useState(alert.type === "emergency");
  const isCancellation = alert.type === "cancellation";
  const isEmergency = alert.type === "emergency";
  const isGlobal = alert.type === "global";
  const validity = formatValidity(alert.validity);

  return (
    <details
      className={[
        styles.alert,
        isCancellation ? styles.cancellation : "",
        isEmergency ? styles.emergency : "",
        isGlobal ? styles.global : "",
      ]
        .filter(Boolean)
        .join(" ")}
      open={isEmergency ? true : undefined}
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
    >
      <summary className={styles.alertSummary}>
        <strong>{alert.title}</strong>
        {!isCancellation && alert.effect && (
          <span className={styles.effectBadge}>{alert.effectLabel}</span>
        )}
        <span className={styles.disclosureIcon} aria-hidden="true">
          ›
        </span>
      </summary>

      <div className={styles.alertBody}>
        {isCancellation ? (
          <p>
            {alert.line ? t("Line {line}", { line: alert.line }) : t("A departure")}
            {alert.scheduledTime ? ` · ${formatClock(alert.scheduledTime)}` : ""}
            {alert.cause ? ` · ${causeLabel(alert.cause)}` : ""}
          </p>
        ) : (
          <>
            {(alert.routeNames?.length > 0 || isGlobal || validity) && (
              <p className={styles.alertMeta}>
                {alert.routeNames?.length > 1
                  ? t("Lines {lines}", { lines: alert.routeNames.join(", ") })
                  : alert.routeNames?.length === 1
                    ? t("Line {line}", { line: alert.routeNames[0] })
                    : isGlobal
                      ? t("All Föli services")
                      : ""}
                {(alert.routeNames?.length > 0 || isGlobal) && validity
                  ? " · "
                  : ""}
                {validity}
              </p>
            )}
            {alert.message && <p className={styles.message}>{alert.message}</p>}
            {alert.information && <p>{alert.information}</p>}
            {detailsOpen && alert.images?.length > 0 && (
              <div className={styles.mediaGrid}>
                {alert.images.map((image, index) => (
                  <a
                    key={`${image.url}-${index}`}
                    className={styles.mediaLink}
                    href={image.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={
                      image.title ||
                      t("Open full image for {title}", { title: alert.title })
                    }
                  >
                    <img
                      src={image.url}
                      alt={image.title || t("{title} illustration", { title: alert.title })}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                    <span>{image.title || t("Open full image")}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function ServiceAlerts({ alerts, error = false, receivedAtMs = null }) {
  const [expanded, setExpanded] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const nowMs = useClockTick(60_000);
  const receiptAgeSeconds = elapsedSince(receivedAtMs, nowMs);
  const stale =
    receiptAgeSeconds !== null &&
    receiptAgeSeconds > STALE_ALERT_CHECK_SECONDS;

  if (alerts.length === 0 && !error && !stale) return null;

  if (alerts.length === 0) {
    return (
      <section
        className={`${styles.panel} ${styles.unavailablePanel}`}
        aria-labelledby="service-alerts-title"
      >
        <div className={styles.headingRow}>
          <div>
            <p className={styles.kicker}>{t("Before you go")}</p>
            <h2 id="service-alerts-title" className={styles.heading}>
              {t("Service update check unavailable")}
            </h2>
          </div>
        </div>
        <p className={styles.feedStatus} role="status">
          {t("Föli disruption data could not be confirmed")}
          {receiptAgeSeconds !== null
            ? ` · ${t("last checked {age}", {
                age: formatElapsedAge(receiptAgeSeconds),
              })}`
            : ""}
          {". "}
          {t("Live departure data may still work separately.")}
        </p>
      </section>
    );
  }

  const emergency = alerts.some((alert) => alert.type === "emergency");
  const hasMore = alerts.length > DEFAULT_VISIBLE_ALERTS;
  const visibleAlerts = expanded
    ? alerts
    : alerts.slice(0, DEFAULT_VISIBLE_ALERTS);

  // On a phone the list folds into one line, the count and the first
  // notice's title: four of them stood between the search and the board.
  // An emergency is never folded.
  const folded = !emergency && !phoneOpen;

  return (
    <section
      className={`${styles.panel} ${emergency ? styles.emergencyPanel : ""}`}
      aria-labelledby="service-alerts-title"
      data-folded={folded ? "true" : "false"}
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>
            {emergency ? t("Important now") : t("Before you go")}
          </p>
          <h2 id="service-alerts-title" className={styles.heading}>
            {emergency ? t("Emergency notice") : t("Service updates")}
          </h2>
        </div>
        <span
          className={styles.count}
          aria-label={
            alerts.length === 1
              ? t("1 service update")
              : t("{count} service updates", { count: alerts.length })
          }
        >
          {alerts.length}
        </span>
      </div>

      {!emergency && (
        <button
          type="button"
          className={styles.phoneToggle}
          aria-expanded={phoneOpen}
          aria-controls="service-alerts-list"
          onClick={() => setPhoneOpen((current) => !current)}
        >
          {/* One line on a phone: wrapped, it pushed the first departure
              down a line. The count stays whole; the title is cut. */}
          <span className={styles.phoneToggleText}>
            {phoneOpen
              ? t("Hide service updates")
              : `${
                  alerts.length === 1
                    ? t("1 service update")
                    : t("{count} service updates", { count: alerts.length })
                } · ${alerts[0].title}`}
          </span>
        </button>
      )}

      {(error || stale) && (
        <p className={styles.feedStatus} role="status">
          {error ? t("Update check failed") : t("Service update check is getting old")}
          {receiptAgeSeconds !== null
            ? ` · ${t("last checked {age}", {
                age: formatElapsedAge(receiptAgeSeconds),
              })}`
            : ""}
        </p>
      )}

      <div id="service-alerts-list" className={styles.list}>
        {visibleAlerts.map((alert) => (
          <AlertItem key={alert.id} alert={alert} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded
            ? t("Show fewer updates")
            : alerts.length - DEFAULT_VISIBLE_ALERTS === 1
              ? t("Show 1 more update")
              : t("Show {count} more updates", {
                  count: alerts.length - DEFAULT_VISIBLE_ALERTS,
                })}
        </button>
      )}
    </section>
  );
}

export default ServiceAlerts;
