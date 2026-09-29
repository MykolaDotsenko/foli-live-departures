import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTripDetails } from "../api/foliApi";
import useRetrySignal from "./useRetrySignal";

export default function useTripEnrichment(arrivals = []) {
  const tripKey = useMemo(
    () =>
      [
        ...new Set(
          arrivals
            .map((arrival) => String(arrival?.tripref || "").trim())
            .filter(Boolean)
        ),
      ]
        .slice(0, 10)
        .join("|"),
    [arrivals]
  );
  const [detailsByTripId, setDetailsByTripId] = useState(() => new Map());
  const { attempt, reportFailure, reportSuccess } = useRetrySignal();
  const previousTripKeyRef = useRef("");

  useEffect(() => {
    const tripIds = tripKey ? tripKey.split("|") : [];
    const tripKeyChanged = previousTripKeyRef.current !== tripKey;
    previousTripKeyRef.current = tripKey;

    // A failure for trips that are no longer visible must not keep a retry
    // timer alive for the new board state.
    if (tripKeyChanged) {
      reportSuccess();
    }

    if (tripIds.length === 0) {
      setDetailsByTripId(new Map());
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    Promise.all(
      tripIds.map(async (tripId) => {
        try {
          return await fetchTripDetails(tripId, controller.signal);
        } catch {
          return null;
        }
      })
    ).then((details) => {
      if (!active || controller.signal.aborted) return;

      const successful = new Map(
        details
          .filter(Boolean)
          .map((detail) => [detail.tripId, detail])
      );

      setDetailsByTripId((current) => {
        const next = new Map();

        tripIds.forEach((tripId) => {
          if (successful.has(tripId)) {
            next.set(tripId, successful.get(tripId));
          } else if (current.has(tripId)) {
            // A transient retry failure must not erase metadata that was
            // already shown for the same trip.
            next.set(tripId, current.get(tripId));
          }
        });

        return next;
      });

      if (details.some((detail) => detail === null)) {
        reportFailure();
      } else {
        reportSuccess();
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, reportFailure, reportSuccess, tripKey]);

  return detailsByTripId;
}
