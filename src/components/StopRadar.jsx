import { useEffect, useMemo, useState } from "react";
import { t, useLanguage } from "../i18n";
import useStopRadar from "../hooks/useStopRadar";
import {
  bearingDegrees,
  radarPoint,
  radarRangeMeters,
  radarStops,
  relativeBearingDegrees,
  relativeDirectionKey,
} from "../utils/stopRadar";
import { distanceInMeters, formatAccuracy, formatDistance, hasCoordinates } from "../utils/geo";
import { stopLabel } from "../utils/stopNames";
import styles from "./StopRadar.module.css";

function targetIsNear(position, target, distance) {
  return (
    hasCoordinates(position) &&
    hasCoordinates(target) &&
    Number.isFinite(distance) &&
    Number.isFinite(position?.accuracy) &&
    position.accuracy <= 30 &&
    distance <= 30
  );
}

function targetWithinUncertainty(position, distance) {
  return (
    Number.isFinite(distance) &&
    Number.isFinite(position?.accuracy) &&
    position.accuracy > 30 &&
    distance <= position.accuracy
  );
}


function translatedRelativeDirection(angle) {
  switch (relativeDirectionKey(angle)) {
    case "Straight ahead":
      return t("Straight ahead");
    case "Slightly right":
      return t("Slightly right");
    case "Slightly left":
      return t("Slightly left");
    case "To your right":
      return t("To your right");
    case "To your left":
      return t("To your left");
    case "Behind you to the right":
      return t("Behind you to the right");
    case "Behind you to the left":
      return t("Behind you to the left");
    case "Behind you":
      return t("Behind you");
    default:
      return t("Direction unavailable");
  }
}

export default function StopRadar({
  stops,
  initialTargetStopId = "",
  recommendedTargetStopId = "",
  activeStopId = "",
  compassPermission = "not-required",
  onPosition = () => {},
  onOpenStop = () => {},
  onClose,
}) {
  useLanguage();
  const [targetStopId, setTargetStopId] = useState(() =>
    String(initialTargetStopId || "")
  );
  const { status, position, error, heading, headingSource, pageVisible } =
    useStopRadar({
      active: true,
      compassPermission,
      onPosition,
    });

  const nearby = useMemo(
    () => radarStops(stops, position, targetStopId),
    [position, stops, targetStopId]
  );

  useEffect(() => {
    if (targetStopId || nearby.length === 0) return;
    setTargetStopId(String(nearby[0].id || ""));
  }, [nearby, targetStopId]);

  const targetStop =
    stops.find(
      (stop) =>
        String(stop?.id || "") === targetStopId && hasCoordinates(stop)
    ) || null;

  const targetDistance =
    position && targetStop ? distanceInMeters(position, targetStop) : null;
  const targetBearing =
    position && targetStop ? bearingDegrees(position, targetStop) : null;
  const targetRelativeBearing = relativeBearingDegrees(targetBearing, heading);
  const range = radarRangeMeters(nearby, targetDistance);

  const renderedStops = useMemo(() => {
    const result = [];
    for (const stop of nearby) {
      const bearing = bearingDegrees(position, stop);
      const point = radarPoint(
        bearing,
        heading,
        Number(stop.distanceMeters),
        range
      );
      if (point) result.push({ ...stop, bearing, point });
    }
    return result;
  }, [heading, nearby, position, range]);

  const targetPoint = renderedStops.find(
    (stop) => String(stop.id) === targetStopId
  )?.point;


  const guidanceText =
    headingSource === "north" && Number.isFinite(targetBearing)
      ? t("Target bearing {degrees}° from north", {
          degrees: Math.round(targetBearing),
        })
      : translatedRelativeDirection(targetRelativeBearing);

  const modeText =
    headingSource === "compass"
      ? t("Compass-up")
      : headingSource === "motion"
        ? t("Using your direction of travel")
        : t("North-up");

  const targetAtStop = targetIsNear(position, targetStop, targetDistance);
  const targetUncertain = targetWithinUncertainty(position, targetDistance);
  const compassFallback =
    ["denied", "unavailable", "error"].includes(compassPermission) &&
    headingSource !== "motion";

  return (
    <section
      id="stop-radar-panel"
      className={styles.panel}
      aria-labelledby="stop-radar-title"
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("Live walking guidance")}</p>
          <h3 id="stop-radar-title" className={styles.title} tabIndex={-1}>
            {t("Stop radar")}
          </h3>
          <p className={styles.subtitle}>
            {t("Live location runs only while this radar is open. It is not saved or sent to Föli.")}
          </p>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          {t("Close radar")}
        </button>
      </div>

      {status === "locating" && (
        <p className={styles.status} role="status">
          {t("Finding your live position…")}
        </p>
      )}
      {status === "paused" && (
        <p className={styles.notice} role="status">
          {t("Radar paused while the app is in the background.")}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}

      {position && (
        <>
          <div className={styles.modeRow} role="status" aria-live="polite">
            <span className={styles.modePill}>{modeText}</span>
            {Number.isFinite(position.accuracy) && (
              <span>
                {t("GPS accuracy ±{accuracy}", {
                  accuracy: formatAccuracy(position.accuracy),
                })}
              </span>
            )}
            <span>
              {t("Radar range {distance}", {
                distance: formatDistance(range),
              })}
            </span>
          </div>

          {compassFallback && (
            <p className={styles.notice}>
              {t("Compass data is unavailable, so the radar stays north-up. Walking still updates distance and stop positions.")}
            </p>
          )}

          <div className={styles.layout}>
            <div
              className={styles.radar}
              role="img"
              aria-label={
                targetStop
                  ? t("Radar showing nearby stops. Target {name}, stop {id}, {distance} away.", {
                      name: stopLabel(targetStop),
                      id: targetStop.id,
                      distance: formatDistance(targetDistance),
                    })
                  : t("Radar showing nearby Föli stops.")
              }
            >
              <span className={styles.northLabel} aria-hidden="true">
                {headingSource === "north" ? t("N") : "↑"}
              </span>
              <span className={styles.ringOne} aria-hidden="true" />
              <span className={styles.ringTwo} aria-hidden="true" />
              <span className={styles.ringThree} aria-hidden="true" />
              <span className={styles.userDot} aria-hidden="true" />

              {targetPoint && (
                <span
                  className={styles.targetNeedle}
                  aria-hidden="true"
                  style={{
                    transform: `rotate(${targetPoint.angle}deg)`,
                  }}
                />
              )}

              {renderedStops.map((stop) => {
                const target = String(stop.id) === targetStopId;
                const recommended =
                  String(stop.id) === String(recommendedTargetStopId || "");
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className={styles.marker}
                    data-target={target ? "true" : undefined}
                    data-recommended={recommended ? "true" : undefined}
                    style={{
                      left: `${stop.point.x}%`,
                      top: `${stop.point.y}%`,
                    }}
                    onClick={() => setTargetStopId(String(stop.id))}
                    aria-pressed={target}
                    aria-label={t("Guide to {name}, stop {id}, {distance} away", {
                      name: stopLabel(stop),
                      id: stop.id,
                      distance: formatDistance(stop.distanceMeters),
                    })}
                  >
                    <span aria-hidden="true">{target ? "◎" : "•"}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.targetCard}>
              <p className={styles.targetLabel}>{t("Target stop")}</p>
              {targetStop ? (
                <>
                  <strong className={styles.targetName}>{stopLabel(targetStop)}</strong>
                  <span className={styles.targetMeta}>
                    {t("Stop {id}", { id: targetStop.id })}
                  </span>
                  <span className={styles.distance}>
                    {formatDistance(targetDistance)}
                  </span>
                  <span className={styles.direction}>{guidanceText}</span>

                  {targetPoint?.clipped && (
                    <span className={styles.targetNote}>
                      {t("Target is beyond the radar scale; its marker is pinned to the edge.")}
                    </span>
                  )}
                  {targetAtStop && (
                    <span className={styles.arrival} role="status">
                      {t("You are at the stop area. Look for the stop pole and route number.")}
                    </span>
                  )}
                  {!targetAtStop && targetUncertain && (
                    <span className={styles.targetNote}>
                      {t("The stop is within current GPS uncertainty. Look for the stop pole before crossing or boarding.")}
                    </span>
                  )}
                  {Number.isFinite(position.accuracy) &&
                    position.accuracy > 50 && (
                      <span className={styles.targetNote}>
                        {t("GPS accuracy is low, so distance and direction may move around.")}
                      </span>
                    )}

                  <button
                    type="button"
                    className={styles.openStopButton}
                    onClick={() => onOpenStop(String(targetStop.id))}
                  >
                    {t("Open target stop")}
                  </button>
                </>
              ) : (
                <span className={styles.targetNote}>
                  {t("Waiting for a nearby stop to use as the target…")}
                </span>
              )}
            </div>
          </div>

          {nearby.length > 0 && (
            <div
              className={styles.stopChooser}
              role="group"
              aria-label={t("Choose radar target")}
            >
              {nearby.map((stop) => {
                const target = String(stop.id) === targetStopId;
                const recommended =
                  String(stop.id) === String(recommendedTargetStopId || "");
                const selected = String(stop.id) === String(activeStopId || "");
                return (
                  <button
                    key={stop.id}
                    type="button"
                    aria-pressed={target}
                    data-target={target ? "true" : undefined}
                    onClick={() => setTargetStopId(String(stop.id))}
                  >
                    <span>{stopLabel(stop)}</span>
                    <small>
                      {formatDistance(stop.distanceMeters)}
                      {recommended ? ` · ${t("Best")}` : ""}
                      {selected ? ` · ${t("Selected")}` : ""}
                    </small>
                  </button>
                );
              })}
            </div>
          )}

          <p className={styles.footnote}>
            {t("The arrow uses compass north when available. Otherwise the radar is north-up or uses your recent direction of travel. Distances are straight-line estimates, not a safe walking route.")}
          </p>
        </>
      )}

      {!pageVisible && (
        <span className={styles.srOnly}>{t("Live sensors are paused.")}</span>
      )}
    </section>
  );
}
