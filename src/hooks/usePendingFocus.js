import { useCallback, useEffect, useRef } from "react";

// How long a request waits for its target to appear. A place setup opens
// only once the location answers, and the browser's permission question
// can stand before that for as long as the passenger takes to answer it.
const PENDING_FOCUS_MS = 60_000;

/**
 * Moves keyboard focus somewhere sensible after an action removes the
 * control that had it.
 *
 * The target may mount in the same React render, after an async answer, or
 * inside a React.lazy/Suspense boundary. A pending request therefore checks
 * both after renders and when the DOM gains new nodes. It never polls and it
 * never takes focus back after the passenger has moved somewhere else.
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

  const tryFocus = useCallback(() => {
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

    // Remove the focusin listener before focusing the destination, otherwise
    // our own move would look like the passenger moved on.
    cancel();
    target.focus();
    // Focus should also reveal the result. WebKit can keep a newly focused
    // heading outside the viewport after nearby content collapses or moves.
    target.scrollIntoView?.({ block: "nearest" });
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  // Same-render targets remain fast: any render of the component owning this
  // hook gives the pending request another chance.
  useEffect(() => {
    tryFocus();
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

      /** @type {MutationObserver | null} */
      let observer = null;
      let expiryTimer = 0;

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

      const stopListening = () => {
        document.removeEventListener("pointerdown", movedOn, true);
        document.removeEventListener("focusin", movedOn, true);
        observer?.disconnect();
        if (expiryTimer) globalThis.clearTimeout(expiryTimer);
      };

      document.addEventListener("pointerdown", movedOn, true);
      document.addEventListener("focusin", movedOn, true);
      pendingRef.current = {
        findTarget,
        origin,
        until: Date.now() + PENDING_FOCUS_MS,
        stopListening,
      };

      // The target may already exist. Otherwise, Suspense or another async
      // surface can add it without re-rendering the component that owns this
      // hook; observe additions until it appears or the request is cancelled.
      tryFocus();
      if (pendingRef.current && globalThis.MutationObserver) {
        observer = new globalThis.MutationObserver(tryFocus);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      if (pendingRef.current) {
        expiryTimer = globalThis.setTimeout(cancel, PENDING_FOCUS_MS);
      }
    },
    [cancel, tryFocus]
  );
}
