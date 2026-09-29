import { useEffect, useRef } from "react";
import { fetchTripShape } from "../api/foliApi";
import { prepareRideShape } from "../utils/rideGeometry";
import useRetrySignal from "./useRetrySignal";

// Loads the selected trip's GTFS shape and hands back a ref the GPS sampler
// can read synchronously. The ref is deliberately not state: a position
// callback must not wait for a render to know whether map matching is
// possible.
export default function useRideShape({ rideId, enabled, shapeId, onStatus }) {
  const shapeRef = useRef(null);
  const retryIdentityRef = useRef("");
  const { attempt, reportFailure, reportSuccess } = useRetrySignal();

  useEffect(() => {
    shapeRef.current = null;

    const retryIdentity = enabled && rideId && shapeId
      ? `${rideId}|${shapeId}`
      : "";
    if (retryIdentityRef.current !== retryIdentity) {
      retryIdentityRef.current = retryIdentity;
      // A new ride/shape gets a fresh retry budget instead of inheriting
      // backoff from a failure that belonged to the previous identity.
      reportSuccess();
    }

    if (!retryIdentity) return undefined;

    const controller = new AbortController();

    fetchTripShape(shapeId, controller.signal)
      .then((points) => {
        if (controller.signal.aborted) return;
        const prepared = prepareRideShape(points);

        if (!prepared?.usesGtfsDistance) {
          // Stop distances and shape distances would be on different scales,
          // so map matching is refused. This is a valid but unusable shape,
          // not a transient provider outage, so do not retry it.
          reportSuccess();
          onStatus("unavailable");
          return;
        }

        reportSuccess();
        shapeRef.current = prepared;
        onStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        reportFailure();
        onStatus("unavailable");
      });

    return () => {
      controller.abort();
      shapeRef.current = null;
    };
  }, [
    attempt,
    enabled,
    onStatus,
    reportFailure,
    reportSuccess,
    rideId,
    shapeId,
  ]);

  return shapeRef;
}
