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
 * has fallen to the page because that control is gone. Focus on the page
 * alone is not enough: tapping plain text leaves it there too, and a slow
 * "Use my location" answered after the passenger had moved on pulled focus,
 * and the page's scroll, back to the setup. For the same reason a press or
 * a focus anywhere outside the control that asked withdraws the request.
 * Nothing asks on a page load or a background refresh, so those never move
 * focus at all.
 *
 * @returns {(findTarget: () => (HTMLElement | null | undefined)) => void}
 */
export default function usePendingFocus() {
  const pendingRef = useRef(
    /** @type {null | { findTarget: () => (HTMLElement | null | undefined), origin: Element | null, until: number, stopListening: () => void }} */ (
      null
    )
  );

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.stopListening();
  }, []);

  useEffect(() => cancel, [cancel]);

  // Every render: the target may be drawn by any of them.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      cancel();
      return;
    }

    const active = document.activeElement;
    const focusWasDropped =
      !active || active === document.body || active === document.documentElement;
    const originGone = !pending.origin || !pending.origin.isConnected;
    if (active !== pending.origin && !(focusWasDropped && originGone)) {
      // The passenger has moved on to something else: leave them there.
      cancel();
      return;
    }

    const target = pending.findTarget();
    if (!target || !target.isConnected) return;
    cancel();
    target.focus();
  });

  return useCallback(
    (findTarget) => {
      cancel();
      const origin = document.activeElement;
      // Focus on the page itself is no control: a browser that does not
      // focus a button when it is pressed leaves it there.
      const originControl =
        origin && origin !== document.body && origin !== document.documentElement
          ? origin
          : null;
      /** @param {Event} event */
      const movedOn = (event) => {
        const where = event.target;
        if (
          originControl &&
          where instanceof globalThis.Node &&
          originControl.contains(where)
        ) {
          return;
        }
        cancel();
      };
      document.addEventListener("pointerdown", movedOn, true);
      document.addEventListener("focusin", movedOn, true);
      pendingRef.current = {
        findTarget,
        origin,
        until: Date.now() + PENDING_FOCUS_MS,
        stopListening: () => {
          document.removeEventListener("pointerdown", movedOn, true);
          document.removeEventListener("focusin", movedOn, true);
        },
      };
    },
    [cancel]
  );
}
