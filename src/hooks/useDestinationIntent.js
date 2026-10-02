import { useCallback, useState } from "react";
import { prepareExternalPlaceDestination } from "../utils/placeDestination";
/** @import { DestinationIntent } from "../types/journey" */

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

export default function useDestinationIntent() {
  /** @type {[DestinationIntent | null, import("react").Dispatch<import("react").SetStateAction<DestinationIntent | null>>]} */
  const [destination, setDestination] = useState(null);
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

  const clearDestination = useCallback(() => setDestination(null), []);

  return {
    destination,
    chooseStop,
    choosePlace,
    chooseExternalPlace,
    clearDestination,
  };
}
