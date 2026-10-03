import { useMemo } from "react";
import useStopAlerts from "../hooks/useStopAlerts";
import useStopMonitor from "../hooks/useStopMonitor";

// Everything the open stop's board shows: its departures, the service
// updates that concern it, and what those say about its lines.
export default function useStopBoard({ stopId, stops, catalogStatus, routesById }) {
  const {
    stopName,
    arrivals,
    serverTime,
    receivedAtMs,
    realtimeAvailable,
    scheduleAvailable,
    scheduleFailed,
    scheduleIncomplete,
    loading,
    refreshing,
    error,
    refresh,
  } = useStopMonitor(stopId);
  const activeLines = useMemo(
    () => [...new Set(arrivals.map((arrival) => arrival.lineref).filter(Boolean))],
    [arrivals]
  );
  const {
    alerts: serviceAlerts,
    error: serviceAlertsError,
    receivedAtMs: serviceAlertsReceivedAtMs,
  } = useStopAlerts(stopId, activeLines, routesById);
  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === stopId) || null,
    [stopId, stops]
  );
  // A number Föli's up-to-date stop list does not have: "?stop=1640" for
  // 164 read as a stop with no departures.
  const unknownStop =
    Boolean(stopId) &&
    catalogStatus === "ready" &&
    stops.length > 0 &&
    !selectedStop;
  // A notice about a line, on that line's buses: with the list folded on a
  // phone, "Detour" on the row is what says line 1 is affected.
  const lineNotices = useMemo(() => {
    const notices = new Map();
    for (const alert of serviceAlerts) {
      if (alert.type !== "message" && alert.type !== "emergency") continue;
      for (const line of alert.routeNames || []) {
        if (!notices.has(String(line))) {
          notices.set(String(line), alert.effectLabel || "");
        }
      }
    }
    return notices;
  }, [serviceAlerts]);
  const stopCancellations = useMemo(
    () => serviceAlerts.filter((alert) => alert.type === "cancellation"),
    [serviceAlerts]
  );

  return {
    stopName,
    arrivals,
    serverTime,
    receivedAtMs,
    realtimeAvailable,
    scheduleAvailable,
    scheduleFailed,
    scheduleIncomplete,
    loading,
    refreshing,
    error,
    refresh,
    serviceAlerts,
    serviceAlertsError,
    serviceAlertsReceivedAtMs,
    selectedStop,
    unknownStop,
    lineNotices,
    stopCancellations,
  };
}
