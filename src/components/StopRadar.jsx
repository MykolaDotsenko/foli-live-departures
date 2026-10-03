import { useEffect, useMemo, useState } from "react";
import { t, useLanguage } from "../i18n";
import useStopRadar from "../hooks/useStopRadar";
import {
  bearingDegrees,
  cardinalDirectionKey,
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


// Markers closer than this (in % of the radar's width, about 24 px on a
// phone) would sit on top of each other as two tap targets, the lower one
// a sliver. Only the first (the target, then the nearest) is drawn; the
// other comes back apart as the scale narrows, and the target chooser
// below offers it all along.
const MIN_MARKER_GAP_PERCENT = 8;

function translatedHeading(bearing) {
  const degrees = Math.round(Number(bearing)) % 360;
  switch (cardinalDirectionKey(bearing)) {
    case "north":
      return t("Head north ({degrees}°)", { degrees });
    case "north-east":
      return t("Head north-east ({degrees}°)", { degrees });
    case "east":
      return t("Head east ({degrees}°)", { degrees });
    case "south-east":
      return t("Head south-east ({degrees}°)", { degrees });
    case "south":
      return t("Head south ({degrees}°)", { degrees });
    case "south-west":
      return t("Head south-west ({degrees}°)", { degrees });
    case "west":
      return t("Head west ({degrees}°)", { degrees });
    case "north-west":
      return t("Head north-west ({degrees}°)", { degrees });
    default:
      return t("Direction unavailable");
  }
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
  // The scale on screen, and the target it was set for: hysteresis holds
  // a scale between fixes for one target, never across a change of target.
  const [shown, setShown] = useState({ range: null, targetStopId });
  const range = radarRangeMeters(
    targetDistance ?? (nearby.length ? Number(nearby[0].distanceMeters) : null),
    shown.targetStopId === targetStopId ? shown.range : null
  );
  if (range !== shown.range || targetStopId !== shown.targetStopId) {
    setShown({ range, targetStopId });
  }

  const renderedStops = useMemo(() => {
    // The target first, so it keeps its place and stays on top.
    const ordered = [...nearby].sort(
      (a, b) =>
        Number(String(b.id) === targetStopId) -
        Number(String(a.id) === targetStopId)
    );
    const result = [];
    for (const stop of ordered) {
      const isTarget = String(stop.id) === targetStopId;
      const distance = Number(stop.distanceMeters);
      // Off the scale, only the target is drawn, pinned to the edge.
      if (!isTarget && distance > range) continue;
      const bearing = bearingDegrees(position, stop);
      const point = radarPoint(bearing, heading, distance, range);
      if (!point) continue;
      const crowded = result.some(
        (placed) =>
          Math.hypot(placed.point.x - point.x, placed.point.y - point.y) <
          MIN_MARKER_GAP_PERCENT
      );
      if (!crowded) result.push({ ...stop, bearing, point });
    }
    return result;
  }, [heading, nearby, position, range, targetStopId]);

  const targetPoint = renderedStops.find(
    (stop) => String(stop.id) === targetStopId
  )?.point;


  const guidanceText =
    headingSource === "north" && Number.isFinite(targetBearing)
      ? translatedHeading(targetBearing)
      : translatedRelativeDirection(targetRelativeBearing);
  // The GPS circle, drawn to the radar's scale: where the phone may be.
  const accuracyDiameter = Number.isFinite(position?.accuracy)
    ? Math.min(84, (84 * Number(position.accuracy)) / range)
    : 0;

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
      {status === "stale" && (
        <p className={styles.notice} role="status">
          {t("Waiting for a new GPS fix…")}
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
              role="group"
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
              <span className={styles.rangeLabel} aria-hidden="true">
                {formatDistance(range)}
              </span>
              {headingSource !== "north" && (
                <span className={styles.headingCone} aria-hidden="true" />
              )}
              {accuracyDiameter > 0 && (
                <span
                  className={styles.accuracyHalo}
                  aria-hidden="true"
                  style={{
                    width: `${accuracyDiameter}%`,
                    height: `${accuracyDiameter}%`,
                  }}
                />
              )}
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
                    {/* The stop number matches the list below, so two
                        stops of one name can be told apart on the radar. */}
                    <span aria-hidden="true">{stop.id}</span>
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
                  {/* At the stop, "behind you" from a few metres of GPS
                      noise would send the passenger walking off again. */}
                  {!targetAtStop && (
                    <span className={styles.direction}>{guidanceText}</span>
                  )}

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
                      {t("Stop {id}", { id: stop.id })}
                      {" · "}
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
