import { useEffect, useState } from "react";

/**
 * Re-renders on a slow interval so elapsed-time labels keep counting between
 * provider refreshes. Without it a departure can read "2 min" for the whole
 * 30-second gap between polls.
 *
 * The tick pauses while the tab is hidden and catches up as soon as it is
 * visible again.
 */
export default function useClockTick(intervalMs = 10_000, enabled = true) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;

    const interval = Math.max(1_000, Number(intervalMs) || 0);

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNowMs(Date.now());
    };

    // A clock that was disabled for minutes must catch up immediately when
    // its feature becomes active rather than waiting one full interval.
    tick();
    const intervalId = window.setInterval(tick, interval);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, intervalMs]);

  return nowMs;
}
