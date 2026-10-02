import { useCallback, useEffect, useRef, useState } from "react";
import {
  directPlaceSearchSupported,
  loadPlaceSearchConfig,
  searchPlaces,
} from "../api/placeSearch";

/** @import { PlaceSearchResult } from "../types/journey" */

export default function usePlaceSearch() {
  const directSupportedRef = useRef(directPlaceSearchSupported());
  const [directEnabled, setDirectEnabled] = useState(
    () => directSupportedRef.current
  );
  /** @type {[PlaceSearchResult[], import("react").Dispatch<import("react").SetStateAction<PlaceSearchResult[]>>]} */
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
    setResults([]);
    setStatus("idle");
    setError("");
  }, []);

  const search = useCallback(async (query, language) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setStatus("loading");
    setError("");

    try {
      const next = await searchPlaces(query, {
        signal: controller.signal,
        language,
      });
      if (
        controller.signal.aborted ||
        requestIdRef.current !== requestId
      ) {
        return null;
      }

      setResults(next);
      setStatus("ready");
      return next;
    } catch (searchError) {
      if (
        controller.signal.aborted ||
        searchError?.name === "AbortError" ||
        searchError?.name === "CanceledError"
      ) {
        return null;
      }

      if (requestIdRef.current === requestId) {
        const policyHandoff = searchError?.name === "PlaceSearchPolicyError";
        setResults([]);
        setStatus("error");
        if (policyHandoff) setDirectEnabled(false);
        setError(
          searchError?.name === "PlaceSearchCooldownError"
            ? "rate-limited"
            : policyHandoff
              ? "external-handoff"
              : "unavailable"
        );
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const policyController = new AbortController();

    // Runtime policy is fetched from the same origin and is deliberately not
    // precached. This lets production disable public address/POI lookup
    // immediately without shipping a new JavaScript bundle or contacting the
    // external provider first.
    if (directSupportedRef.current) {
      loadPlaceSearchConfig(policyController.signal)
        .then((config) => {
          if (!policyController.signal.aborted && config.enabled !== true) {
            setDirectEnabled(false);
          }
        })
        .catch((policyError) => {
          if (
            !policyController.signal.aborted &&
            policyError?.name !== "AbortError"
          ) {
            // A missing/malformed policy must fail closed. Local Föli stop
            // search remains available and the UI exposes the official
            // journey-planner handoff.
            setDirectEnabled(false);
          }
        });
    }

    return () => {
      policyController.abort();
      controllerRef.current?.abort();
    };
  }, []);

  return { results, status, error, search, clear, directEnabled };
}
