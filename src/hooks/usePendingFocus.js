import { useCallback, useEffect, useRef } from "react";

// How long a request waits for its target to appear. A place setup opens
// only once the location answers, and the browser's permission question
// can stand before that for as long as the passenger takes to answer it.
const PENDING_FOCUS_MS = 60_000;

/**
 * Moves keyboard focus somewhere sensible after an action removes the
 * control that had it.
 *
 * Pressing "Start get-off alert", choosing a saved stop or cancelling a
 * setup took the button away under the passenger's finger, and a screen
 * reader or keyboard user was left at the top of the page with no idea
 * where the result went. The action asks for focus to go to a named place;
 * the move is made after the next render that has that place on screen,
 * since it often mounts only then.
 *
 * It never takes focus from somewhere the passenger has gone themselves:
 * the move is made only while focus is still on the control that asked, or
 * has fallen to the page because that control is gone. Nothing asks on a
 * page load or a background refresh, so those never move focus at all.
 *
 * @returns {(findTarget: () => (HTMLElement | null | undefined)) => void}
 */
export default function usePendingFocus() {
  const pendingRef = useRef(
    /** @type {null | { findTarget: () => (HTMLElement | null | undefined), origin: Element | null, until: number }} */ (
      null
    )
  );

  // Every render: the target may be drawn by any of them.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      pendingRef.current = null;
      return;
    }

    const active = document.activeElement;
    const focusWasDropped =
      !active || active === document.body || active === document.documentElement;
    if (!focusWasDropped && active !== pending.origin) {
      // The passenger has moved on to something else: leave them there.
      pendingRef.current = null;
      return;
    }

    const target = pending.findTarget();
    if (!target || !target.isConnected) return;
    pendingRef.current = null;
    target.focus();
  });

  return useCallback((findTarget) => {
    pendingRef.current = {
      findTarget,
      origin: document.activeElement,
      until: Date.now() + PENDING_FOCUS_MS,
    };
  }, []);
}
