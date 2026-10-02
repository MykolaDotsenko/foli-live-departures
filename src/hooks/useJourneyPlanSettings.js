import { useCallback, useMemo, useState } from "react";
import {
  formatServiceDateTimeLocal,
  parseServiceDateTimeLocal,
} from "../utils/journeyTime";

function defaultTarget(mode, nowSec = Math.floor(Date.now() / 1000)) {
  const offset = mode === "arrive-by" ? 60 * 60 : 30 * 60;
  const rounded = Math.ceil((nowSec + offset) / (5 * 60)) * 5 * 60;
  return rounded;
}

export default function useJourneyPlanSettings() {
  const [timeMode, setTimeModeState] = useState("leave-now");
  const [timeLocalValue, setTimeLocalValueState] = useState("");

  const targetTimeSec = useMemo(
    () =>
      timeMode === "leave-now"
        ? null
        : parseServiceDateTimeLocal(timeLocalValue),
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

  const setTimeMode = useCallback((mode) => {
    const next = ["leave-now", "leave-at", "arrive-by"].includes(mode)
      ? mode
      : "leave-now";
    setTimeModeState(next);
    if (next !== "leave-now") {
      setTimeLocalValueState((current) =>
        current || formatServiceDateTimeLocal(defaultTarget(next))
      );
    }
  }, []);

  const setTimeLocalValue = useCallback((value) => {
    setTimeLocalValueState(String(value || ""));
  }, []);

  return {
    timeConstraint,
    timeLocalValue,
    timeValid,
    setTimeMode,
    setTimeLocalValue,
  };
}
