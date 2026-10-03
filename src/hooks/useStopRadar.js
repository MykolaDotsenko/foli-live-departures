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

const LIVE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 1_500,
};

/** @param {unknown} value */
function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const previousPositionRef = useRef(null);
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
      setError("");
      return undefined;
    }
    if (!pageVisible) {
      setStatus("paused");
      return undefined;
    }

    const geolocation = globalThis.navigator?.geolocation;
    if (typeof geolocation?.watchPosition !== "function") {
      setStatus("error");
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
          accuracy: finiteOrNull(fix?.coords?.accuracy),
          timestamp: Number(fix?.timestamp) || Date.now(),
        };

        if (!hasCoordinates(next)) {
          setStatus("error");
          setError(msg("Live location returned an invalid position."));
          return;
        }

        const directHeading = normalizeDegrees(fix?.coords?.heading);
        const speed = finiteOrNull(fix?.coords?.speed);
        const nextMotionHeading =
          directHeading !== null && (speed === null || speed >= 0.5)
            ? directHeading
            : movementHeading(previousPositionRef.current, next);

        if (nextMotionHeading !== null) {
          setMotionHeading((current) =>
            smoothHeading(current, nextMotionHeading, 0.32)
          );
          setMotionHeadingAt(Date.now());
        }

        previousPositionRef.current = next;
        setPosition(next);
        setStatus("active");
        setError("");
        onPositionRef.current(next);
      },
      (locationError) => {
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
    if (!active || !pageVisible) return undefined;
    if (!["granted", "not-required"].includes(compassPermission)) {
      setCompassHeading(null);
      return undefined;
    }

    const onOrientation = (event) => {
      const next = headingFromOrientationEvent(event);
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

  return useMemo(
    () => ({
      status,
      position,
      error,
      heading,
      headingSource,
      pageVisible,
    }),
    [error, heading, headingSource, pageVisible, position, status]
  );
}
