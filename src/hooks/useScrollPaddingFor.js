import { useEffect } from "react";

// A panel pinned over the page (Ride Mode sticks to the top on a wide
// screen; the get-off setup's Start bar is fixed to the bottom of a phone)
// hid whatever a keyboard user tabbed to underneath it (WCAG 2.4.11). The
// browser keeps a focused element out of the scroll padding, so the page
// reserves the panel's height, measured while it is on screen, and gives
// it back when the panel goes away.
//
// Takes the element itself (from a callback ref), not a ref object: the
// setup's Start bar mounts after the setup does, and an effect reading
// ref.current once would never see it. `side` is "top" or "bottom". Only a
// panel that is actually pinned counts: one in the page's flow covers
// nothing.
export default function useScrollPaddingFor(element, side) {
  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!element || !root) return undefined;

    const property = side === "bottom" ? "scrollPaddingBottom" : "scrollPaddingTop";
    const previous = root.style[property];

    const measure = () => {
      const position = globalThis.getComputedStyle?.(element).position;
      const pinned = position === "sticky" || position === "fixed";
      const height = element.getBoundingClientRect().height;
      root.style[property] = pinned && height > 0 ? `${Math.ceil(height) + 12}px` : previous;
    };

    measure();
    const observer =
      typeof globalThis.ResizeObserver === "function"
        ? new globalThis.ResizeObserver(measure)
        : null;
    observer?.observe(element);
    globalThis.addEventListener?.("resize", measure);

    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.("resize", measure);
      root.style[property] = previous;
    };
  }, [element, side]);
}
