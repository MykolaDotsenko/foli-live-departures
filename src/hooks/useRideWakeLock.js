import { useEffect, useState } from "react";

// Ride Mode is only as reliable as the page staying awake, so the lock is
// re-requested every time the passenger looks at their phone again: the
// browser releases a screen lock whenever the document is hidden, and
// nothing re-takes it on its own.
export default function useRideWakeLock(rideId) {
  const [wakeLockState, setWakeLockState] = useState("inactive");

  useEffect(() => {
    if (!rideId) {
      setWakeLockState("inactive");
      return undefined;
    }

    if (typeof globalThis.navigator?.wakeLock?.request !== "function") {
      setWakeLockState("unsupported");
      return undefined;
    }

    let active = true;
    let sentinel = null;
    let requestInFlight = false;

    const request = async () => {
      if (
        !active ||
        requestInFlight ||
        sentinel ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      requestInFlight = true;
      try {
        const acquired = await globalThis.navigator.wakeLock.request("screen");

        if (!active) {
          await acquired.release?.();
          return;
        }

        sentinel = acquired;
        setWakeLockState("active");
        sentinel.addEventListener?.("release", () => {
          sentinel = null;
          if (active) setWakeLockState("inactive");
        });
      } catch {
        if (active) setWakeLockState("inactive");
      } finally {
        requestInFlight = false;
      }
    };

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        !sentinel &&
        !requestInFlight
      ) {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      void sentinel?.release?.();
    };
  }, [rideId]);

  return wakeLockState;
}
