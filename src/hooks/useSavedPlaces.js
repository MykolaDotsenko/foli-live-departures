import { useCallback, useEffect, useMemo, useState } from "react";
import { msg, t } from "../i18n";
import { normalizedPastTimestamp } from "../utils/cacheTime";
import { realStopName } from "../utils/stopNames";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

const STORAGE_KEY = "foli-my-places-v1";

// The label is saved with each place and stays English, whatever language
// the place was saved in, so it reads the same in the other and code can
// still tell Home by it. The screen names a place through placeLabel().
export const PLACE_PRESETS = [
  { id: "home", label: "Home" },
  { id: "school", label: "School" },
  { id: "work", label: "Work" },
];

const PLACE_LABELS = {
  home: msg("Home"),
  school: msg("School"),
  work: msg("Work"),
};

// What a place is called on screen, in the passenger's language. Chosen by
// its id, never by the label it was stored with.
export function placeLabel(place) {
  const label = PLACE_LABELS[place?.id];
  return label ? t(label) : String(place?.label || "");
}

function normalizeStop(stop) {
  if (!stop || typeof stop !== "object") return null;

  const id = String(stop.id || "").trim();
  const name = String(stop.name || "").trim();

  if (!/^\d+$/.test(id)) return null;

  return {
    id,
    // Only Föli's own name. A stand-in is worked out on screen in the
    // reader's language (utils/stopNames.js), never stored.
    name: realStopName(name),
  };
}

function normalizePlace(place) {
  if (!place || typeof place !== "object") return null;

  const preset = PLACE_PRESETS.find((candidate) => candidate.id === place.id);
  if (!preset) return null;

  const stops = Array.isArray(place.stops)
    ? place.stops.map(normalizeStop).filter(Boolean).slice(0, 3)
    : [];

  if (stops.length === 0) return null;

  const primaryStopId = stops.some(
    (stop) => stop.id === String(place.primaryStopId || "")
  )
    ? String(place.primaryStopId)
    : stops[0].id;

  return {
    ...preset,
    stops,
    primaryStopId,
    updatedAt: normalizedPastTimestamp(place.updatedAt),
    validatedAt: normalizedPastTimestamp(place.validatedAt),
    needsReview: place.needsReview === true,
  };
}

function readStoredPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed)
      ? parsed.map(normalizePlace).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function persist(places) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  } catch {
    // Places are a convenience. Core departure browsing remains available.
  }
}

export default function useSavedPlaces() {
  const [places, setPlaces] = useState(readStoredPlaces);

  // A place saved or imported in another tab is taken in as it happens.
  // Without this, any Home action here wrote this tab's older list back
  // and the other tab's School was gone.
  useEffect(() => {
    const takeOtherTabChanges = (event) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      setPlaces(readStoredPlaces());
    };
    const takeImportedChanges = () => setPlaces(readStoredPlaces());
    window.addEventListener("storage", takeOtherTabChanges);
    window.addEventListener(LOCAL_STATE_IMPORTED_EVENT, takeImportedChanges);
    return () => {
      window.removeEventListener("storage", takeOtherTabChanges);
      window.removeEventListener(LOCAL_STATE_IMPORTED_EVENT, takeImportedChanges);
    };
  }, []);

  const commit = useCallback((updater) => {
    setPlaces((current) => {
      const next = updater(current);
      if (next === current) return current;
      persist(next);
      return next;
    });
  }, []);

  const savePlace = useCallback(
    ({ id, stops, primaryStopId }) => {
      const preset = PLACE_PRESETS.find((candidate) => candidate.id === id);
      if (!preset) return;

      const normalizedStops = Array.isArray(stops)
        ? stops.map(normalizeStop).filter(Boolean).slice(0, 3)
        : [];

      if (normalizedStops.length === 0) return;

      const resolvedPrimary = normalizedStops.some(
        (stop) => stop.id === String(primaryStopId || "")
      )
        ? String(primaryStopId)
        : normalizedStops[0].id;

      const nextPlace = {
        ...preset,
        stops: normalizedStops,
        primaryStopId: resolvedPrimary,
        updatedAt: Date.now(),
        validatedAt: 0,
        needsReview: false,
      };

      commit((current) => [
        ...current.filter((place) => place.id !== id),
        nextPlace,
      ]);
    },
    [commit]
  );

  const revalidatePlaces = useCallback(
    (catalogStops, catalogSavedAt = Date.now()) => {
      if (!Array.isArray(catalogStops) || catalogStops.length === 0) return;

      const validatedAt = Number(catalogSavedAt) || Date.now();
      const catalogById = new Map(
        catalogStops
          .filter((stop) => stop?.id)
          .map((stop) => [String(stop.id), stop])
      );

      commit((current) => {
        if (current.length === 0) return current;

        let changed = false;
        const next = current.map((place) => {
          if (place.validatedAt >= validatedAt && place.validatedAt > 0) {
            return place;
          }

          let needsReview = false;
          let renamed = false;

          const stops = place.stops.map((savedStop) => {
            const currentStop = catalogById.get(savedStop.id);
            if (!currentStop) {
              needsReview = true;
              return savedStop;
            }

            const currentName = String(currentStop.name || "").trim();
            if (currentName && currentName !== savedStop.name) {
              renamed = true;
              return { id: savedStop.id, name: currentName };
            }

            return savedStop;
          });

          if (
            renamed ||
            place.needsReview !== needsReview ||
            place.validatedAt !== validatedAt
          ) {
            changed = true;
            return {
              ...place,
              stops,
              validatedAt,
              needsReview,
            };
          }

          return place;
        });

        return changed ? next : current;
      });
    },
    [commit]
  );

  const removePlace = useCallback(
    (id) => {
      commit((current) => current.filter((place) => place.id !== id));
    },
    [commit]
  );

  const setPrimaryStop = useCallback(
    (placeId, stopId) => {
      commit((current) =>
        current.map((place) =>
          place.id === placeId &&
          place.stops.some((stop) => stop.id === String(stopId))
            ? { ...place, primaryStopId: String(stopId), updatedAt: Date.now() }
            : place
        )
      );
    },
    [commit]
  );

  const byId = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  );

  return {
    places,
    byId,
    savePlace,
    revalidatePlaces,
    removePlace,
    setPrimaryStop,
  };
}
