import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizedPastTimestamp } from "../utils/cacheTime";
import { realStopName } from "../utils/stopNames";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

const STORAGE_KEY = "foli-saved-stops-v1";
const MAX_RECENTS = 5;
// How long the stop last looked at stays the one the app opens on.
const REOPEN_WINDOW_MS = 12 * 60 * 60 * 1000;

function normalizeStop(stop) {
  if (!stop || typeof stop !== "object") return null;

  const id = String(stop.id || "").trim();
  const name = String(stop.name || "").trim();

  if (!/^\d+$/.test(id)) return null;

  const normalized = {
    id,
    // Only Föli's own name. A stand-in, including one stored by an earlier
    // version, is left out and worked out on screen (utils/stopNames.js).
    name: realStopName(name),
  };
  // Kept for a recent stop, so the app knows how long ago it was looked at.
  const viewedAt = normalizedPastTimestamp(stop.viewedAt);
  if (viewedAt > 0) normalized.viewedAt = viewedAt;
  return normalized;
}

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));

    return {
      favorites: Array.isArray(parsed?.favorites)
        ? parsed.favorites.map(normalizeStop).filter(Boolean)
        : [],
      recents: Array.isArray(parsed?.recents)
        ? parsed.recents.map(normalizeStop).filter(Boolean).slice(0, MAX_RECENTS)
        : [],
    };
  } catch {
    return { favorites: [], recents: [] };
  }
}

// The stop a bare address opens on: the one looked at in the last 12 hours,
// or else the first favourite. A daily passenger then sees their buses
// without searching; a first visit still starts with the search.
export function stopToReopen(nowMs = Date.now()) {
  const { favorites, recents } = readStoredState();
  const last = recents[0];
  const viewedAt = normalizedPastTimestamp(last?.viewedAt, nowMs);
  if (last && viewedAt > 0 && nowMs - viewedAt < REOPEN_WINDOW_MS) {
    return last.id;
  }
  return favorites[0]?.id || "";
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Saved stops are a convenience; the live departure flow still works.
  }
}

export default function useSavedStops() {
  const [state, setState] = useState(readStoredState);

  // Another tab's changes are taken in as they happen. Without this, this
  // tab wrote its own older copy back on the next stop it opened, and a
  // favourite starred in the other tab was gone.
  useEffect(() => {
    const takeOtherTabChanges = (event) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      setState(readStoredState());
    };
    const takeImportedChanges = () => setState(readStoredState());
    window.addEventListener("storage", takeOtherTabChanges);
    window.addEventListener(LOCAL_STATE_IMPORTED_EVENT, takeImportedChanges);
    return () => {
      window.removeEventListener("storage", takeOtherTabChanges);
      window.removeEventListener(LOCAL_STATE_IMPORTED_EVENT, takeImportedChanges);
    };
  }, []);

  const commit = useCallback((updater) => {
    setState((current) => {
      const next = updater(current);
      persist(next);
      return next;
    });
  }, []);

  const rememberRecent = useCallback(
    (stop) => {
      const normalized = normalizeStop(stop);
      if (!normalized) return;
      normalized.viewedAt = Date.now();

      commit((current) => ({
        ...current,
        recents: [
          normalized,
          ...current.recents.filter((item) => item.id !== normalized.id),
        ].slice(0, MAX_RECENTS),
      }));
    },
    [commit]
  );

  const toggleFavorite = useCallback(
    (stop) => {
      const normalized = normalizeStop(stop);
      if (!normalized) return;

      commit((current) => {
        const exists = current.favorites.some(
          (item) => item.id === normalized.id
        );

        return {
          ...current,
          favorites: exists
            ? current.favorites.filter((item) => item.id !== normalized.id)
            : [...current.favorites, normalized],
        };
      });
    },
    [commit]
  );

  const favoriteIds = useMemo(
    () => new Set(state.favorites.map((stop) => stop.id)),
    [state.favorites]
  );

  return {
    favorites: state.favorites,
    recents: state.recents,
    favoriteIds,
    rememberRecent,
    toggleFavorite,
  };
}
