import { useEffect, useRef, useState } from "react";
import {
  fetchStopCatalog,
  fetchStopCoordinates,
} from "../api/foliApi";
import { timestampIsFresh } from "../utils/cacheTime";
import useRetrySignal from "./useRetrySignal";

const CACHE_KEY = "foli-stop-catalog-v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function stopHasCoordinates(stop) {
  return (
    Number.isFinite(stop?.lat) &&
    stop.lat >= -90 &&
    stop.lat <= 90 &&
    Number.isFinite(stop?.lon) &&
    stop.lon >= -180 &&
    stop.lon <= 180
  );
}

// Stored data is only as good as whatever wrote it last. One entry that is
// not a stop took the app to its error screen, and a reload read the same
// entry straight back, so nothing short of clearing site data recovered.
function isStoredStop(stop) {
  return (
    Boolean(stop) &&
    typeof stop === "object" &&
    typeof stop.id === "string" &&
    stop.id !== "" &&
    typeof stop.name === "string"
  );
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (Array.isArray(cached?.stops)) {
      const stops = cached.stops.filter(isStoredStop);
      // A catalogue with nothing left in it is not a fresh one: kept as
      // fresh, it was never fetched again and search stayed off for a day.
      const hasCoordinates = stops.some(stopHasCoordinates);
      return {
        stops,
        savedAt: stops.length > 0 ? Number(cached.savedAt) || 0 : 0,
        // Older v2 entries did not track coordinate freshness separately.
        // Treat those coordinates as usable stale-while-revalidate data, but
        // refresh them once so a successful catalogue fetch cannot make old
        // coordinates look newly fresh after a reload.
        coordinatesSavedAt:
          hasCoordinates && Number.isFinite(Number(cached.coordinatesSavedAt))
            ? Number(cached.coordinatesSavedAt)
            : 0,
      };
    }
  } catch {
    // Suggestions are optional; direct stop lookup still works.
  }

  return { stops: [], savedAt: 0, coordinatesSavedAt: 0 };
}

function cacheIsFresh(cache) {
  return timestampIsFresh(cache?.savedAt, CACHE_TTL_MS);
}

function coordinatesFromStops(stops) {
  return new Map(
    stops
      .filter(stopHasCoordinates)
      .map((stop) => [stop.id, { lat: stop.lat, lon: stop.lon }])
  );
}

function mergeCoordinates(stops, coordinates) {
  return stops.map((stop) => {
    const coordinate = coordinates?.get(stop.id);
    return coordinate ? { ...stop, ...coordinate } : stop;
  });
}

function persistCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage is an optimization, not a requirement.
  }
}

export default function useStopCatalog() {
  const [cache, setCache] = useState(readCache);
  const initialCache = useRef(cache).current;
  const [coordinatesStatus, setCoordinatesStatus] = useState(() =>
    initialCache.stops.some(stopHasCoordinates) ? "ready" : "loading"
  );
  const [catalogStatus, setCatalogStatus] = useState(() => {
    if (initialCache.stops.length === 0) return "loading";
    return cacheIsFresh(initialCache) ? "ready" : "stale";
  });

  // Coordinates and the catalogue recover independently: one failing must not
  // re-request the other, and neither may stay broken for the whole session
  // because of a single blip.
  const {
    attempt: coordinatesAttempt,
    reportFailure: reportCoordinatesFailure,
    reportSuccess: reportCoordinatesSuccess,
  } = useRetrySignal();
  const {
    attempt: catalogAttempt,
    reportFailure: reportCatalogFailure,
    reportSuccess: reportCatalogSuccess,
  } = useRetrySignal();

  // Kept so a later catalogue refresh can re-apply the full coordinate set,
  // including stops that the cached list did not have yet.
  const latestCoordinatesRef = useRef(null);

  // Freshness follows the data currently held by this long-lived hook, not
  // only the snapshot that happened to exist when the tab opened. Catalogue
  // metadata and stop coordinates are independent provider resources, so each
  // keeps its own timestamp and can recover without falsely refreshing the
  // other.
  const isFresh = cacheIsFresh(cache);
  const hasCachedCoordinates = cache.stops.some(stopHasCoordinates);
  const coordinatesAreFresh =
    hasCachedCoordinates &&
    timestampIsFresh(cache.coordinatesSavedAt, CACHE_TTL_MS);

  useEffect(() => {
    if (coordinatesAreFresh) {
      setCoordinatesStatus("ready");
      return undefined;
    }

    const controller = new AbortController();

    fetchStopCoordinates(controller.signal)
      .then((freshCoordinates) => {
        if (controller.signal.aborted) return;

        latestCoordinatesRef.current = freshCoordinates;
        const coordinatesSavedAt = Date.now();
        reportCoordinatesSuccess();
        setCoordinatesStatus("ready");
        setCache((current) => {
          const next = {
            ...current,
            coordinatesSavedAt,
            stops: mergeCoordinates(current.stops, freshCoordinates),
          };
          persistCache(next);
          return next;
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        reportCoordinatesFailure();
        setCoordinatesStatus(hasCachedCoordinates ? "ready" : "unavailable");
      });

    return () => controller.abort();
  }, [
    coordinatesAreFresh,
    coordinatesAttempt,
    hasCachedCoordinates,
    reportCoordinatesFailure,
    reportCoordinatesSuccess,
  ]);

  useEffect(() => {
    if (isFresh) return undefined;

    const controller = new AbortController();

    fetchStopCatalog(controller.signal)
      .then((freshStops) => {
        if (controller.signal.aborted) return;

        const savedAt = Date.now();
        reportCatalogSuccess();
        setCatalogStatus("ready");
        setCache((current) => {
          const next = {
            ...current,
            savedAt,
            stops: mergeCoordinates(
              freshStops,
              latestCoordinatesRef.current || coordinatesFromStops(current.stops)
            ),
          };
          persistCache(next);
          return next;
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        // Keep an expired cached catalogue as a stale-while-revalidate
        // fallback while the retry runs.
        reportCatalogFailure();
        setCatalogStatus(
          cache.stops.length > 0 ? "stale" : "unavailable"
        );
      });

    return () => controller.abort();
  }, [
    cache.stops.length,
    catalogAttempt,
    isFresh,
    reportCatalogFailure,
    reportCatalogSuccess,
  ]);

  return {
    stops: cache.stops,
    coordinatesStatus,
    catalogStatus,
    catalogSavedAt: cache.savedAt,
  };
}
