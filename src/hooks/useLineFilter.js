import { useCallback, useEffect, useState } from "react";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

// The lines a passenger follows at a stop, kept per stop on this phone: a
// commuter who only ever takes the 32 from here sets it once. Nothing else
// is kept, and a filter never outlives the last 20 stops it was set at.
const STORAGE_KEY = "foli-line-filter-v1";
const MAX_STOPS = 20;
const MAX_LINE_LENGTH = 12;

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function normalizeLines(lines) {
  return [
    ...new Set(
      (Array.isArray(lines) ? lines : [])
        .map((line) => String(line ?? "").trim())
        .filter((line) => line && line.length <= MAX_LINE_LENGTH)
    ),
  ];
}

function linesFor(stopId) {
  return stopId ? normalizeLines(readAll()[String(stopId)]?.lines) : [];
}

function write(stopId, lines) {
  try {
    const all = readAll();
    if (lines.length === 0) {
      delete all[stopId];
    } else {
      all[stopId] = { lines, savedAt: Date.now() };
    }

    const kept = Object.entries(all)
      .sort(
        ([, a], [, b]) => (Number(b?.savedAt) || 0) - (Number(a?.savedAt) || 0)
      )
      .slice(0, MAX_STOPS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // A filter is a convenience. The board works the same without it.
  }
}

export default function useLineFilter(stopId) {
  const [state, setState] = useState(() => ({
    stopId,
    lines: linesFor(stopId),
  }));

  useEffect(() => {
    const takeImportedChanges = () =>
      setState({ stopId, lines: linesFor(stopId) });
    window.addEventListener(LOCAL_STATE_IMPORTED_EVENT, takeImportedChanges);
    return () =>
      window.removeEventListener(
        LOCAL_STATE_IMPORTED_EVENT,
        takeImportedChanges
      );
  }, [stopId]);

  // The board stays mounted across stops, so a new stop brings its own
  // filter with it rather than inheriting the last one's.
  let current = state;
  if (state.stopId !== stopId) {
    current = { stopId, lines: linesFor(stopId) };
    setState(current);
  }

  const setLines = useCallback(
    (lines) => {
      const next = normalizeLines(lines);
      if (stopId) write(String(stopId), next);
      setState({ stopId, lines: next });
    },
    [stopId]
  );

  return [current.lines, setLines];
}
