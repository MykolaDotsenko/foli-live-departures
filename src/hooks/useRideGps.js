import { useEffect } from "react";
import { msg } from "../i18n";
import { rideGpsFromFix } from "../utils/rideGpsFix";
import { emptyGps } from "../utils/rideSession";

// The phone's own location, watched while a ride asked for location backup.
// It is the evidence that still works when the live feed does not, so each
// fix is weighed at once rather than waiting for the next poll. The state
// and its refs belong to useRideMode: the stage logic, the panel and this
// watch must all read one and the same location.
export default function useRideGps({
  rideId,
  locationBackup,
  sessionRef,
  runtimeRef,
  gpsRef,
  shapeRef,
  commitGps,
  setGpsState,
  applyProgress,
}) {
  useEffect(() => {
    const current = sessionRef.current;
    if (!current?.options?.locationBackup) {
      commitGps(emptyGps());
      return undefined;
    }

    // Errors are kept as phrases and translated where the panel shows them,
    // so a language switch mid-ride reaches them too.
    if (
      typeof globalThis.navigator?.geolocation?.watchPosition !== "function"
    ) {
      commitGps((value) => ({
        ...value,
        status: "unavailable",
        error: msg("Location backup is unavailable on this device."),
      }));
      return undefined;
    }

    let active = true;
    commitGps((value) => ({
      ...value,
      status: "starting",
      error: "",
    }));

    const watchId = globalThis.navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;

        const next = rideGpsFromFix({
          position,
          session: current,
          stage: sessionRef.current?.stage,
          previous: gpsRef.current,
          shape: shapeRef.current,
          nowMs: Date.now(),
        });
        if (!next) return;

        gpsRef.current = next;
        setGpsState(next);
        applyProgress(runtimeRef.current, next);
      },
      (error) => {
        if (!active) return;
        commitGps((value) => ({
          ...value,
          status: "error",
          error:
            error?.code === 1
              ? msg("Location backup was not allowed.")
              : msg("Location backup is temporarily unavailable."),
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      }
    );

    return () => {
      active = false;
      globalThis.navigator?.geolocation?.clearWatch?.(watchId);
    };
  }, [
    applyProgress,
    commitGps,
    gpsRef,
    locationBackup,
    rideId,
    runtimeRef,
    sessionRef,
    setGpsState,
    shapeRef,
  ]);
}
