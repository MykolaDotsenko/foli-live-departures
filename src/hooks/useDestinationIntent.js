import { useCallback, useState } from "react";
import { prepareExternalPlaceDestination } from "../utils/placeDestination";
/** @import { DestinationIntent } from "../types/journey" */

/**
 * Validate a destination restored from tab-scoped ride continuation state.
 * This accepts the three canonical destination kinds only and normalizes the
 * stop-id set so malformed storage never becomes active journey context.
 *
 * @param {unknown} value
 * @returns {DestinationIntent | null}
 */
export function normalizeDestinationIntent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const id = String(candidate.id || "").trim();
  const kind = String(candidate.kind || "");
  const label = String(candidate.label || "").trim();
  const primaryStopId = String(candidate.primaryStopId || "").trim();
  const acceptableStopIds = [
    ...new Set(
      (Array.isArray(candidate.acceptableStopIds)
        ? candidate.acceptableStopIds
        : []
      )
        .map((stopId) => String(stopId || "").trim())
        .filter((stopId) => /^\d+$/.test(stopId))
    ),
  ];

  if (
    !id ||
    !label ||
    !["saved-place", "public-stop", "external-place"].includes(kind) ||
    !/^\d+$/.test(primaryStopId) ||
    !acceptableStopIds.includes(primaryStopId)
  ) {
    return null;
  }

  /** @type {DestinationIntent} */
  const normalized = {
    id,
    kind: /** @type {DestinationIntent["kind"]} */ (kind),
    label,
    primaryStopId,
    acceptableStopIds,
  };

  if (kind === "external-place") {
    const lat = Number(candidate.lat);
    const lon = Number(candidate.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    normalized.lat = lat;
    normalized.lon = lon;

    const distances =
      candidate.finalWalkDistanceByStop &&
      typeof candidate.finalWalkDistanceByStop === "object" &&
      !Array.isArray(candidate.finalWalkDistanceByStop)
        ? candidate.finalWalkDistanceByStop
        : null;
    if (distances) {
      normalized.finalWalkDistanceByStop = Object.fromEntries(
        Object.entries(distances)
          .map(([stopId, distance]) => [stopId, Number(distance)])
          .filter(
            ([stopId, distance]) =>
              /^\d+$/.test(stopId) &&
              Number.isFinite(distance) &&
              distance >= 0
          )
      );
    }
    if (candidate.source === "osm-nominatim") {
      normalized.source = "osm-nominatim";
    }
  }

  return normalized;
}

/**
 * @param {{ id?: unknown, name?: unknown } | null | undefined} stop
 * @returns {DestinationIntent | null}
 */
export function destinationFromStop(stop) {
  const id = String(stop?.id || "").trim();
  if (!/^\d+$/.test(id)) return null;

  const name = String(stop?.name || "").trim();
  return {
    id: `stop:${id}`,
    kind: "public-stop",
    label: name || `Stop ${id}`,
    primaryStopId: id,
    acceptableStopIds: [id],
  };
}

/**
 * @param {{ id?: unknown, label?: unknown, stops?: unknown, primaryStopId?: unknown } | null | undefined} place
 * @returns {DestinationIntent | null}
 */
export function destinationFromPlace(place) {
  const id = String(place?.id || "").trim();
  const label = String(place?.label || "").trim();
  const rawStops = Array.isArray(place?.stops) ? place.stops : [];
  const stopIds = [
    ...new Set(
      rawStops
        .map((stop) => String(stop?.id || "").trim())
        .filter((stopId) => /^\d+$/.test(stopId))
    ),
  ];

  if (!id || !label || stopIds.length === 0) return null;

  const requestedPrimary = String(place?.primaryStopId || "");
  const primaryStopId = stopIds.includes(requestedPrimary)
    ? requestedPrimary
    : stopIds[0];

  return {
    id: `place:${id}`,
    kind: "saved-place",
    label,
    primaryStopId,
    acceptableStopIds: stopIds,
  };
}

export default function useDestinationIntent(initialDestination = null) {
  /** @type {[DestinationIntent | null, import("react").Dispatch<import("react").SetStateAction<DestinationIntent | null>>]} */
  const [destination, setDestination] = useState(() =>
    normalizeDestinationIntent(initialDestination)
  );
  const chooseStop = useCallback((stop) => {
    const next = destinationFromStop(stop);
    if (next) setDestination(next);
  }, []);

  const choosePlace = useCallback((place) => {
    const next = destinationFromPlace(place);
    if (next) setDestination(next);
  }, []);

  const chooseExternalPlace = useCallback(
    (place, stops, serviceBoundary = null) => {
      const prepared = prepareExternalPlaceDestination({
        place,
        stops,
        serviceBoundary,
      });
      if (prepared.ok && prepared.destination) {
        setDestination(prepared.destination);
      }
      return prepared;
    },
    []
  );

  const restoreDestination = useCallback((candidate) => {
    const next = normalizeDestinationIntent(candidate);
    if (!next) return false;
    setDestination(next);
    return true;
  }, []);

  const clearDestination = useCallback(() => setDestination(null), []);

  return {
    destination,
    chooseStop,
    choosePlace,
    chooseExternalPlace,
    restoreDestination,
    clearDestination,
  };
}
