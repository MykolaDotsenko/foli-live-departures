import { useEffect, useMemo, useRef, useState } from "react";
import { loadAddressPack } from "../api/addressPack";
import { msg, t, useLanguage } from "../i18n";
import useRideWakeLock from "../hooks/useRideWakeLock";
import useStopRadar from "../hooks/useStopRadar";
import {
  bearingDegrees,
  compassPoint,
  radarPoint,
  radarRangeMeters,
  radarStops,
  relativeBearingDegrees,
  relativeDirectionKey,
} from "../utils/stopRadar";
import { distanceInMeters, formatAccuracy, formatDistance, hasCoordinates } from "../utils/geo";
import {
  createRadarContextIndex,
  radarContextPaths,
  selectRadarContext,
} from "../utils/radarContext";
import { stopLabel } from "../utils/stopNames";
import styles from "./StopRadar.module.css";

// Arrival is claimed within 30 m at 30 m accuracy or better, and then held
// until either passes 40 m: a passenger standing about 30 m away saw it come
// and go with every few metres of GPS noise.
function targetIsNear(position, target, distance, limit) {
  return (
    hasCoordinates(position) &&
    hasCoordinates(target) &&
    Number.isFinite(distance) &&
    Number.isFinite(position?.accuracy) &&
    position.accuracy <= limit &&
    distance <= limit
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


// Markers closer than this, in % of the radar's width, would cover each
// other's stop numbers: 8% (about 24 px) was less than a marker is wide, so
// two platforms of one name drew as one number over another. Only the first
// (the target, then the nearest) is drawn; the other comes back apart as the
// scale narrows, and the target chooser below offers it all along. The
// target is larger, and the passenger's own dot covers a number too.
const MARKER_GAP_PERCENT = 10.5;
const TARGET_GAP_PERCENT = 13;
const CENTER_GAP_PERCENT = 6;

// North-up guidance names the compass point, north clockwise.
const HEADINGS = [
  msg("Head north ({degrees}°)"),
  msg("Head north-east ({degrees}°)"),
  msg("Head east ({degrees}°)"),
  msg("Head south-east ({degrees}°)"),
  msg("Head south ({degrees}°)"),
  msg("Head south-west ({degrees}°)"),
  msg("Head west ({degrees}°)"),
  msg("Head north-west ({degrees}°)"),
];

// A screen reader hears the distance and the way to go once either has
// changed enough to act on: a quarter of the distance (at least 10 m), a
// new direction after 8 s, at once on arrival or a new target. The visible
// card still follows every fix; announcing it did not, and a status line of
// accuracy and scale was read out every second instead.
const ANNOUNCE_DIRECTION_MS = 8_000;

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
  const panelRef = useRef(null);
  const [targetStopId, setTargetStopId] = useState(() =>
    String(initialTargetStopId || "")
  );
  const [contextIndex, setContextIndex] = useState(() =>
    createRadarContextIndex(null)
  );
  const { status, position, error, heading, headingSource, pageVisible } =
    useStopRadar({
      active: true,
      compassPermission,
      onPosition,
    });
  // A walk outlasts the screen's auto-lock, which paused the radar midway.
  // Held, like Ride Mode's, only while there is a fix to guide from.
  useRideWakeLock(position ? "stop-radar" : "");

  // On a phone the radar opened below the fold and nothing seemed to happen.
  // Bring its top into view, so the radar the first fix draws grows down
  // the screen, and take a screen reader to its heading, unless the
  // passenger has moved on while it loaded.
  useEffect(() => {
    const active = document.activeElement;
    if (
      active &&
      !active.matches("html, body, [aria-controls=stop-radar-panel]")
    ) {
      return;
    }
    panelRef.current?.scrollIntoView?.({ block: "start" });
    document.getElementById("stop-radar-title")?.focus({ preventScroll: true });
  }, []);

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

  const hasLivePosition = Boolean(position);

  useEffect(() => {
    if (!hasLivePosition) return undefined;

    let current = true;
    loadAddressPack().then((pack) => {
      if (current) setContextIndex(createRadarContextIndex(pack));
    });

    return () => {
      current = false;
    };
  }, [hasLivePosition]);

  const targetDistance =
    position && targetStop ? distanceInMeters(position, targetStop) : null;
  const targetBearing =
    position && targetStop ? bearingDegrees(position, targetStop) : null;
  const targetRelativeBearing = relativeBearingDegrees(targetBearing, heading);
  // The scale and the arrival on screen, and the target they were set for:
  // hysteresis holds them between fixes for one target, never across a
  // change of target.
  const [shown, setShown] = useState({
    range: null,
    targetStopId,
    arrived: false,
  });
  const sameTarget = shown.targetStopId === targetStopId;
  const scaleDistance =
    targetDistance ?? (nearby.length ? Number(nearby[0].distanceMeters) : null);
  const range = radarRangeMeters(
    scaleDistance,
    sameTarget ? shown.range : null
  );
  // Only a scale set from a distance holds: the 200 m shown before the first
  // fix kept a target 80 m away on it instead of the 100 m it fits.
  const heldRange = scaleDistance === null ? null : range;
  const targetAtStop = targetIsNear(
    position,
    targetStop,
    targetDistance,
    sameTarget && shown.arrived ? 40 : 30
  );
  if (
    heldRange !== shown.range ||
    !sameTarget ||
    targetAtStop !== shown.arrived
  ) {
    setShown({ range: heldRange, targetStopId, arrived: targetAtStop });
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
      const target = String(stop.id) === targetStopId;
      const distance = Number(stop.distanceMeters);
      // Off the scale, only the target is drawn, pinned to the edge.
      if (!target && distance > range) continue;
      const bearing = bearingDegrees(position, stop);
      const point = radarPoint(bearing, heading, distance, range);
      if (!point) continue;
      const crowded =
        !target &&
        (Math.hypot(point.x - 50, point.y - 50) < CENTER_GAP_PERCENT ||
          result.some(
            (placed) =>
              Math.hypot(placed.point.x - point.x, placed.point.y - point.y) <
              (String(placed.id) === targetStopId
                ? TARGET_GAP_PERCENT
                : MARKER_GAP_PERCENT)
          ));
      if (!crowded) result.push({ ...stop, bearing, point });
    }
    return result;
  }, [heading, nearby, position, range, targetStopId]);

  const targetPoint = renderedStops.find(
    (stop) => String(stop.id) === targetStopId
  )?.point;
  // The arrow ends at the target marker's edge: at a fixed length it ran on
  // past a near target, pointing beyond the stop.
  const needleLength = targetPoint
    ? Math.hypot(targetPoint.x - 50, targetPoint.y - 50) - 7
    : 0;

  // Chosen once per fix and scale; a compass turning many times a second
  // only rotates it.
  const context = useMemo(
    () => selectRadarContext(contextIndex, position, range),
    [contextIndex, position, range]
  );
  const mapContext = useMemo(
    () => radarContextPaths(context, heading, range),
    [context, heading, range]
  );

  const compass =
    headingSource === "north" ? compassPoint(targetBearing) : null;
  const guidanceKey =
    compass === null
      ? relativeDirectionKey(targetRelativeBearing)
      : HEADINGS[compass];
  const guidanceText = t(guidanceKey, {
    degrees: Math.round(Number(targetBearing)) % 360,
  });
  const arrivalText = t(
    "You are at the stop area. Look for the stop pole and route number."
  );

  const [spoken, setSpoken] = useState("");
  const spokenRef = useRef(null);
  useEffect(() => {
    if (!targetStop || !Number.isFinite(targetDistance)) return;
    const said = spokenRef.current;
    const now = Date.now();
    if (
      said?.id === targetStopId &&
      said.atStop === targetAtStop &&
      Math.abs(targetDistance - said.distance) < Math.max(10, said.distance / 4) &&
      (targetAtStop ||
        said.key === guidanceKey ||
        now - said.at < ANNOUNCE_DIRECTION_MS)
    ) {
      return;
    }
    spokenRef.current = {
      id: targetStopId,
      atStop: targetAtStop,
      distance: targetDistance,
      key: guidanceKey,
      at: now,
    };
    setSpoken(
      `${formatDistance(targetDistance)}. ${targetAtStop ? arrivalText : guidanceText}`
    );
  }, [
    arrivalText,
    guidanceKey,
    guidanceText,
    targetAtStop,
    targetDistance,
    targetStop,
    targetStopId,
  ]);
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

  const targetUncertain = targetWithinUncertainty(position, targetDistance);
  const statusText =
    status === "locating"
      ? t("Finding your live position…")
      : status === "stale"
        ? t("Waiting for a new GPS fix…")
        : status === "paused"
          ? t("Radar paused while the app is in the background.")
          : "";
  const compassFallback =
    ["denied", "unavailable", "error"].includes(compassPermission) &&
    headingSource !== "motion";

  return (
    <section
      ref={panelRef}
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

      {statusText && (
        <p
          className={status === "locating" ? styles.status : styles.notice}
          role="status"
        >
          {statusText}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}
      <p className={styles.srOnly} role="status">
        {spoken}
      </p>

      {position && (
        <>
          <div className={styles.modeRow}>
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
              <svg
                className={styles.contextLayer}
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                {/* Both always drawn, so building cues are always the
                    second path: styled by position with the street path
                    left out, a lone building path took the streets' look
                    and a black fill wherever no street was near. */}
                <path d={mapContext.roadPath} />
                <path d={mapContext.buildingPath} />
              </svg>

              {/* Drawing only: positioned against the radar, as the
                  wrapper itself is not. */}
              <span aria-hidden="true">
                <span className={styles.northLabel}>
                  {headingSource === "north" ? t("N") : "↑"}
                </span>
                <span className={styles.ringOne} />
                <span className={styles.ringTwo} />
                <span className={styles.ringThree} />
                <span className={styles.rangeLabel}>
                  {formatDistance(range)}
                </span>
                {headingSource !== "north" && (
                  <span className={styles.headingCone} />
                )}
                {accuracyDiameter > 0 && (
                  <span
                    className={styles.accuracyHalo}
                    style={{
                      width: `${accuracyDiameter}%`,
                      height: `${accuracyDiameter}%`,
                    }}
                  />
                )}
                <span className={styles.userDot} />
                {needleLength > 0 && (
                  <span
                    className={styles.targetNeedle}
                    style={{
                      top: `${50 - needleLength}%`,
                      height: `${needleLength}%`,
                      transform: `rotate(${targetPoint.angle}deg)`,
                    }}
                  />
                )}
              </span>

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
                    <span className={styles.arrival}>{arrivalText}</span>
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
            {" · "}{t("© OpenStreetMap contributors")}
          </p>
        </>
      )}

      {!pageVisible && (
        <span className={styles.srOnly}>{t("Live sensors are paused.")}</span>
      )}
    </section>
  );
}
