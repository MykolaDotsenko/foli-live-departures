import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "../i18n";
import { hasCoordinates } from "../utils/geo";
import { locationErrorMessage } from "../utils/location";
import {
  headingFromOrientationEvent,
  movementHeading,
  normalizeDegrees,
  RADAR_MOVEMENT_HEADING_MAX_AGE_MS,
  smoothHeading,
} from "../utils/stopRadar";

// GeolocationPositionError.PERMISSION_DENIED
const PERMISSION_DENIED = 1;

const LIVE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 1_500,
};

/** @param {unknown} value */
function nonNegativeFiniteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * @param {{
 *   active: boolean,
 *   compassPermission: string,
 *   onPosition?: (position: any) => void,
 * }} options
 */
export default function useStopRadar({
  active,
  compassPermission,
  onPosition = () => {},
}) {
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden"
  );
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(null);
  const [error, setError] = useState("");
  const [compassHeading, setCompassHeading] = useState(null);
  const [motionHeading, setMotionHeading] = useState(null);
  const [motionHeadingAt, setMotionHeadingAt] = useState(0);
  // Where the walk was last measured from. It moves on only once a
  // direction is read from it (or it is too old to read one), so a walker's
  // 1.4 m between fixes adds up to the jitter floor instead of never
  // reaching it.
  const anchorRef = useRef(null);
  // The fix on screen, kept through background pauses and passing gaps.
  const lastFixRef = useRef(null);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibility = () =>
      setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!active) {
      setStatus("idle");
      setPosition(null);
      setError("");
      anchorRef.current = null;
      lastFixRef.current = null;
      setMotionHeading(null);
      setMotionHeadingAt(0);
      return undefined;
    }
    if (!pageVisible) {
      // The last fix stays on screen, shown as waiting for a new one when
      // the page comes back: a locked phone woke to an empty radar, target
      // and all, until GPS answered. No direction is read across the gap.
      setStatus("paused");
      anchorRef.current = null;
      setMotionHeading(null);
      setMotionHeadingAt(0);
      return undefined;
    }

    const geolocation = globalThis.navigator?.geolocation;
    if (typeof geolocation?.watchPosition !== "function") {
      setStatus("error");
      setPosition(null);
      setError(msg("Live location tracking is not available on this device."));
      return undefined;
    }

    setStatus("locating");
    setError("");

    const watchId = geolocation.watchPosition(
      (fix) => {
        const next = {
          lat: Number(fix?.coords?.latitude),
          lon: Number(fix?.coords?.longitude),
          accuracy: nonNegativeFiniteOrNull(fix?.coords?.accuracy),
          timestamp: Number(fix?.timestamp) || Date.now(),
        };

        if (!hasCoordinates(next)) {
          anchorRef.current = null;
          lastFixRef.current = null;
          setStatus("error");
          setPosition(null);
          setError(msg("Live location returned an invalid position."));
          return;
        }

        const directHeading = normalizeDegrees(fix?.coords?.heading);
        const speed = nonNegativeFiniteOrNull(fix?.coords?.speed);
        const anchor = anchorRef.current;
        const anchorFresh =
          anchor &&
          Math.abs(next.timestamp - anchor.timestamp) <=
            RADAR_MOVEMENT_HEADING_MAX_AGE_MS;
        const nextMotionHeading =
          directHeading !== null && (speed === null || speed >= 0.5)
            ? directHeading
            : anchorFresh
              ? movementHeading(anchor, next)
              : null;

        if (nextMotionHeading !== null) {
          setMotionHeading((current) =>
            smoothHeading(current, nextMotionHeading, 0.32)
          );
          setMotionHeadingAt(Date.now());
        }

        if (!anchorFresh || nextMotionHeading !== null) anchorRef.current = next;
        lastFixRef.current = next;
        setPosition(next);
        setStatus("active");
        setError("");
        onPositionRef.current(next);
      },
      (locationError) => {
        // No fix right now (no signal under a roof, or none within the
        // timeout while standing at a crossing) is not the end of the walk.
        // Clearing the radar on it blanked the screen and threw away the
        // direction of travel, which then never built up between errors.
        // The last fix stays, marked as waiting; only a refusal ends it.
        if (locationError?.code !== PERMISSION_DENIED && lastFixRef.current) {
          setStatus("stale");
          return;
        }
        anchorRef.current = null;
        lastFixRef.current = null;
        setPosition(null);
        setMotionHeading(null);
        setMotionHeadingAt(0);
        setStatus("error");
        setError(locationErrorMessage(locationError));
      },
      LIVE_LOCATION_OPTIONS
    );

    return () => {
      geolocation.clearWatch?.(watchId);
    };
  }, [active, pageVisible]);

  useEffect(() => {
    if (!active || !pageVisible) {
      setCompassHeading(null);
      return undefined;
    }
    if (!["granted", "not-required"].includes(compassPermission)) {
      setCompassHeading(null);
      return undefined;
    }

    const onOrientation = (event) => {
      const next = headingFromOrientationEvent(
        event,
        globalThis.screen?.orientation?.angle ?? globalThis.orientation
      );
      if (next === null) return;
      setCompassHeading((current) => smoothHeading(current, next));
    };

    globalThis.addEventListener?.("deviceorientationabsolute", onOrientation);
    globalThis.addEventListener?.("deviceorientation", onOrientation);
    return () => {
      globalThis.removeEventListener?.("deviceorientationabsolute", onOrientation);
      globalThis.removeEventListener?.("deviceorientation", onOrientation);
    };
  }, [active, compassPermission, pageVisible]);

  useEffect(() => {
    if (
      !active ||
      !pageVisible ||
      motionHeading === null ||
      motionHeadingAt <= 0
    ) {
      return undefined;
    }

    const age = Date.now() - motionHeadingAt;
    if (age >= RADAR_MOVEMENT_HEADING_MAX_AGE_MS) {
      setMotionHeading(null);
      setMotionHeadingAt(0);
      return undefined;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setMotionHeading(null);
      setMotionHeadingAt(0);
    }, RADAR_MOVEMENT_HEADING_MAX_AGE_MS - age);

    return () => globalThis.clearTimeout(timeoutId);
  }, [active, motionHeading, motionHeadingAt, pageVisible]);

  const effectiveMotionHeading =
    motionHeading !== null &&
    Date.now() - motionHeadingAt <= RADAR_MOVEMENT_HEADING_MAX_AGE_MS
      ? motionHeading
      : null;

  const heading =
    compassHeading !== null ? compassHeading : effectiveMotionHeading;
  const headingSource =
    compassHeading !== null
      ? "compass"
      : effectiveMotionHeading !== null
        ? "motion"
        : "north";

  // Back from the background, the new watch has not answered yet: the last
  // position is shown as waiting for it, not as lost.
  const shownStatus = status === "locating" && position ? "stale" : status;

  return useMemo(
    () => ({
      status: shownStatus,
      position,
      error,
      heading,
      headingSource,
      pageVisible,
    }),
    [error, heading, headingSource, pageVisible, position, shownStatus]
  );
}
