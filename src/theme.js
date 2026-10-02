import { useSyncExternalStore } from "react";
import { LOCAL_STATE_IMPORTED_EVENT } from "./utils/localStateEvents";

const STORAGE_KEY = "foli-theme-v1";
const THEMES = ["light", "dark"];
const listeners = new Set();

function systemTheme() {
  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function readPreference() {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

let preference = readPreference();
let current = preference || systemTheme();

function themeColor(theme) {
  return theme === "dark" ? "#0c1416" : "#007985";
}

function applyToDocument(theme) {
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }

  const meta = globalThis.document?.querySelector?.(
    'meta[name="theme-color"]'
  );
  meta?.setAttribute("content", themeColor(theme));
}

function publish(theme) {
  current = theme;
  applyToDocument(theme);
  listeners.forEach((listener) => listener());
}

applyToDocument(current);

const media = (() => {
  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)") || null;
  } catch {
    return null;
  }
})();

function followSystem(event) {
  if (preference !== null) return;
  publish(event.matches ? "dark" : "light");
}

media?.addEventListener?.("change", followSystem);

globalThis.addEventListener?.(LOCAL_STATE_IMPORTED_EVENT, () => {
  preference = readPreference();
  publish(preference || systemTheme());
});

export function getTheme() {
  return current;
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;

  preference = theme;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    // The explicit choice still applies for this visit.
  }

  if (theme !== current) publish(theme);
  else applyToDocument(theme);
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

export function resetThemeForTests(theme = "light") {
  preference = null;
  publish(THEMES.includes(theme) ? theme : "light");
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
