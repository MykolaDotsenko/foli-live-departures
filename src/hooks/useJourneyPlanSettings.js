import { useCallback, useMemo, useState } from "react";
import {
  formatServiceDateTimeLocal,
  parseServiceDateTimeLocal,
} from "../utils/journeyTime";

/** @import { RoutingPreference } from "../types/journey" */

const ROUTING_PREFERENCES = new Set([
  "balanced",
  "fewer-transfers",
  "less-walking",
  "more-buffer",
]);

/** @param {unknown} mode @param {number} [nowSec] */
function defaultTarget(mode, nowSec = Math.floor(Date.now() / 1000)) {
  const offset = mode === "arrive-by" ? 60 * 60 : 30 * 60;
  return Math.ceil((nowSec + offset) / (5 * 60)) * 5 * 60;
}

/** @param {unknown} value @returns {RoutingPreference} */
function normalizedPreference(value) {
  const requested = String(value || "");
  return ROUTING_PREFERENCES.has(requested)
    ? /** @type {RoutingPreference} */ (requested)
    : "balanced";
}

/**
 * Passenger-owned route settings are deliberately separate from destination
 * identity. Changing a clock or preference must not recreate/erase the place.
 */
export default function useJourneyPlanSettings() {
  const [timeMode, setTimeModeState] = useState("leave-now");
  const [timeLocalValue, setTimeLocalValueState] = useState("");
  /** @type {[RoutingPreference, import("react").Dispatch<import("react").SetStateAction<RoutingPreference>>]} */
  const [preference, setPreferenceState] = useState("balanced");

  const targetTimeSec = useMemo(
    () =>
      timeMode === "leave-now"
        ? null
        : parseServiceDateTimeLocal(timeLocalValue, {
            // The second occurrence of an ambiguous fall-back wall time is the
            // safer interpretation for "arrive by"; leave-at uses the first.
            prefer: timeMode === "arrive-by" ? "latest" : "earliest",
          }),
    [timeLocalValue, timeMode]
  );

  const timeValid =
    timeMode === "leave-now" ||
    (Number.isFinite(Number(targetTimeSec)) &&
      Number(targetTimeSec) > Math.floor(Date.now() / 1000) - 30);

  const timeConstraint = useMemo(
    () => ({
      mode: timeMode,
      targetTimeSec: timeMode === "leave-now" ? null : targetTimeSec,
    }),
    [targetTimeSec, timeMode]
  );

  /** @param {unknown} mode */
  const setTimeMode = useCallback((mode) => {
    const next = ["leave-now", "leave-at", "arrive-by"].includes(mode)
      ? mode
      : "leave-now";
    setTimeModeState(next);
    if (next === "leave-now") return;
    setTimeLocalValueState((current) =>
      current || formatServiceDateTimeLocal(defaultTarget(next))
    );
  }, []);

  /** @param {unknown} value */
  const setTimeLocalValue = useCallback((value) => {
    setTimeLocalValueState(String(value || ""));
  }, []);

  /** @param {unknown} value */
  const setPreference = useCallback((value) => {
    setPreferenceState(normalizedPreference(value));
  }, []);

  return {
    timeConstraint,
    timeLocalValue,
    timeValid,
    preference,
    setTimeMode,
    setTimeLocalValue,
    setPreference,
  };
}
