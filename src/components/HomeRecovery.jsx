import { useMemo, useState } from "react";
import { placeLabel } from "../hooks/useSavedPlaces";
import { t, useLanguage } from "../i18n";
import { hasCoordinates } from "../utils/geo";
import { buildTransitDirectionsUrl } from "../utils/maps";
import SafePlaceDriverCard from "./SafePlaceDriverCard";
import styles from "./HomeRecovery.module.css";
import { stopLabel } from "../utils/stopNames";
import PlaceIcon from "./PlaceIcon";
import StopName from "./StopName";

// The request on the printed card is the driver's, so it is the same
// whichever language the app is in, as on the driver card.
const PRINTED_REQUEST_FINNISH =
  "Voitteko auttaa minua jäämään pois oikealla pysäkillä?";
const PRINTED_REQUEST_ENGLISH = "Could you help me get off at the right stop?";
// Held to the name by a no-break space: a narrow card broke the line before
// the dot, and the next line started with it.
const NAME_SEPARATOR = "\u00a0·";

// Printed for the driver as the driver card shows it, whatever the
// interface language: "Pysäkki / Stop 164".
const PRINTED_STOP_FINNISH = "Pysäkki";
const PRINTED_STOP_ENGLISH = "Stop";
const PRINTED_BACKUPS_FINNISH = "Varapysäkit";
const PRINTED_BACKUPS_ENGLISH = "Backup stops";

function resolveStops(place, stops) {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));

  return place.stops.map((savedStop) => ({
    ...savedStop,
    ...(byId.get(savedStop.id) || {}),
  }));
}

function HomeRecovery({
  home,
  stops,
  online = true,
  compact = false,
  onOpenStop,
}) {
  useLanguage();
  const [showDriver, setShowDriver] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const canPrint = typeof globalThis.print === "function";

  const resolvedStops = useMemo(
    () => (home ? resolveStops(home, stops) : []),
    [home, stops]
  );

  if (!home || resolvedStops.length === 0) return null;

  const primaryStop =
    resolvedStops.find((stop) => stop.id === home.primaryStopId) ||
    resolvedStops[0];
  const backupStops = resolvedStops.filter(
    (stop) => stop.id !== primaryStop.id
  );
  const transitUrl =
    online && hasCoordinates(primaryStop)
      ? buildTransitDirectionsUrl(primaryStop)
      : "";
  const label = placeLabel(home);

  return (
    <section
      className={styles.wrapper}
      data-mobile-options-open={mobileOptionsOpen ? "true" : "false"}
      data-compact={compact ? "true" : undefined}
      aria-labelledby="home-recovery-title"
    >
      <div className={styles.copy}>
        <p className={styles.kicker}>{t("Travel help")}</p>
        <h2 id="home-recovery-title">{t("Need help getting home?")}</h2>
        <p className={styles.description}>
          {t("In an emergency, call 112.")}
        </p>
      </div>

      <div className={styles.destination}>
        <span className={styles.homeIcon} aria-hidden="true">
          <PlaceIcon id="home" />
        </span>
        <span>
          <strong>{label}</strong>
          <small>
            <StopName stop={primaryStop} />
            {NAME_SEPARATOR}{" "}
            <span className={styles.stopNumber}>
              {t("stop {id}", { id: primaryStop.id })}
            </span>
          </small>
        </span>
      </div>

      {home.needsReview && (
        <p className={styles.status} role="status">
          {t(
            "Check Home: one of its stops has changed or is no longer in Föli’s stop list."
          )}
        </p>
      )}

      {/* Offline, the one Home action that still works leads. A disabled
          "Get me Home" in the main slot was the first thing a stranded
          passenger with no data saw, under a banner saying driver help
          still worked. */}
      <div className={styles.actions}>
        {!online ? (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => setShowDriver(true)}
          >
            {t("Show to driver")}
          </button>
        ) : transitUrl ? (
          <a
            className={styles.primaryAction}
            href={transitUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("Get me Home by public transit")}
          >
            <span className={styles.compactIcon} aria-hidden="true">
              <PlaceIcon id="home" />
            </span>
            {t("Get me Home")}
          </a>
        ) : (
          <button
            type="button"
            className={styles.primaryAction}
            disabled
            aria-describedby="home-recovery-routing-status"
          >
            <span className={styles.compactIcon} aria-hidden="true">
              <PlaceIcon id="home" />
            </span>
            {t("Get me Home")}
          </button>
        )}

        <button
          type="button"
          className={styles.mobileOptionsToggle}
          aria-expanded={mobileOptionsOpen}
          onClick={() => setMobileOptionsOpen((current) => !current)}
        >
          {mobileOptionsOpen ? t("Fewer options") : t("Home options")}
        </button>

        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => onOpenStop(primaryStop.id)}
        >
          {t("Open Home stop")}
        </button>

        {online ? (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => setShowDriver(true)}
          >
            {t("Show to driver")}
          </button>
        ) : (
          <button
            type="button"
            className={styles.secondaryAction}
            disabled
            aria-describedby="home-recovery-routing-status"
          >
            {t("Get me Home")}
          </button>
        )}
      </div>

      {transitUrl && (
        <p className={styles.routeNote}>
          {t(
            "Get me Home opens a route in Google Maps. Check it before you travel."
          )}
        </p>
      )}

      {/* Offline, the banner at the top already says directions need a
          connection: the disabled button keeps it, unseen, as its reason. */}
      {!transitUrl && (
        <p
          id="home-recovery-routing-status"
          className={online ? styles.status : styles.srOnly}
        >
          {online
            ? t(
                "Directions will work once stop locations load. Your saved stop and Show to driver work now."
              )
            : t("Directions need an internet connection.")}
        </p>
      )}

      {backupStops.length > 0 && (
        <details className={styles.backups}>
          <summary>
            {backupStops.length > 1
              ? t("Backup Home stops")
              : t("Backup Home stop")}
          </summary>
          <p className={styles.backupHint}>
            {t(
              "If the usual stop is unavailable, choose another stop you approved for Home."
            )}
          </p>
          <div className={styles.backupList}>
            {backupStops.map((stop) => {
              const backupTransitUrl =
                online && hasCoordinates(stop)
                  ? buildTransitDirectionsUrl(stop)
                  : "";

              return (
                <div key={stop.id} className={styles.backupRow}>
                  <span>
                    <strong><StopName stop={stop} /></strong>
                    <small>{t("Stop {id}", { id: stop.id })}</small>
                  </span>
                  <div className={styles.backupActions}>
                    {backupTransitUrl && (
                      <a
                        href={backupTransitUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t(
                          "Route there: backup Home stop {name}, stop {id}, by public transit",
                          { name: stopLabel(stop), id: stop.id }
                        )}
                      >
                        {t("Route there")}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenStop(stop.id)}
                    >
                      {t("Open stop")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <details className={styles.batteryBackup}>
        <summary>{t("Print a backup card")}</summary>
        <p>
          {t(
            "A web app cannot help after the phone powers off. Print or save a small Home backup card in advance so the destination still exists outside the phone. The card reveals the saved public Home stop area, so keep it only with the intended user."
          )}
        </p>
        {canPrint && (
          <button
            type="button"
            className={styles.printButton}
            onClick={() => globalThis.print()}
          >
            {t("Print / save Home backup card")}
          </button>
        )}
      </details>

      {/* Handed to a driver, so it must not read as a Föli document, and
          it keeps to words a child holding it can follow. The request is
          for the driver and never changes; the rest is in the passenger's
          language. */}
      <section className={styles.printCard} aria-hidden="true">
        <p className={styles.printKicker}>{t("Home backup card")}</p>
        {/* The stop is the largest thing on it, as on the driver card: the
            place's own name tells a driver nothing. */}
        <h2 className={styles.printStop}>
          <StopName stop={primaryStop} />
        </h2>
        <p className={styles.printPrimary}>
          <span lang="fi">{PRINTED_STOP_FINNISH}</span> /{" "}
          <span lang="en">
            {PRINTED_STOP_ENGLISH} {primaryStop.id}
          </span>
        </p>
        {backupStops.length > 0 && (
          <div className={styles.printBackups}>
            <strong>
              <span lang="fi">{PRINTED_BACKUPS_FINNISH}</span> /{" "}
              <span lang="en">{PRINTED_BACKUPS_ENGLISH}</span>
            </strong>
            {backupStops.map((stop) => (
              <p key={stop.id}>
                <StopName stop={stop} /> · <span lang="fi">{PRINTED_STOP_FINNISH}</span>{" "}
                / <span lang="en">{PRINTED_STOP_ENGLISH}</span> {stop.id}
              </p>
            ))}
          </div>
        )}
        <p className={styles.printHelp} lang="fi">
          {PRINTED_REQUEST_FINNISH}
          <span lang="en">{PRINTED_REQUEST_ENGLISH}</span>
        </p>
        <p className={styles.printNote}>
          {t(
            "Show this card to a driver or trusted adult. This card contains public stop information, not a private home address."
          )}
        </p>
      </section>

      {showDriver && (
        <SafePlaceDriverCard
          place={home}
          primaryStop={primaryStop}
          idPrefix="recovery"
          onClose={() => setShowDriver(false)}
        />
      )}
    </section>
  );
}

export default HomeRecovery;
