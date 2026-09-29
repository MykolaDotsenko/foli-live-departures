import { useEffect, useState } from "react";
import { fetchRouteCatalog } from "../api/foliApi";
import { timestampIsFresh } from "../utils/cacheTime";
import useRetrySignal from "./useRetrySignal";

const CACHE_KEY = "foli-route-catalog-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// A stored entry that is not a route used to reach the board and crash it,
// on every reload after, too.
function isStoredRoute(route) {
  return (
    Boolean(route) &&
    typeof route === "object" &&
    typeof route.id === "string" &&
    route.id !== ""
  );
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (Array.isArray(cached?.routes)) {
      const routes = cached.routes.filter(isStoredRoute);
      // Nothing left is nothing to be fresh about: fetch again.
      return {
        routes,
        savedAt: routes.length > 0 ? Number(cached.savedAt) || 0 : 0,
      };
    }
  } catch {
    // Route metadata is progressive enhancement.
  }

  return { routes: [], savedAt: 0 };
}

function persist(next) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // Storage is an optimization, not a requirement.
  }
}

export default function useRouteCatalog() {
  const [cache, setCache] = useState(readCache);
  const { attempt, reportFailure, reportSuccess } = useRetrySignal();
  // Evaluated per render, so a session that outlives the cache refreshes
  // instead of serving day-old route metadata until someone reloads.
  const isFresh = timestampIsFresh(cache.savedAt, CACHE_TTL_MS);

  useEffect(() => {
    if (isFresh) return undefined;

    const controller = new AbortController();

    fetchRouteCatalog(controller.signal)
      .then((routes) => {
        if (controller.signal.aborted) return;

        const next = { routes, savedAt: Date.now() };
        reportSuccess();
        setCache(next);
        persist(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        // Keep stale route metadata and retry. Core departures never depend
        // on it, but line colours and names stay wrong until it lands.
        reportFailure();
      });

    return () => controller.abort();
  }, [attempt, isFresh, reportFailure, reportSuccess]);

  return cache.routes;
}
