import { useCallback, useEffect, useRef, useState } from "react";
import { searchPlaces } from "../api/placeSearch";

/** @import { PlaceSearchResult } from "../types/journey" */

export default function usePlaceSearch() {
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
        return [];
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
        return [];
      }

      if (requestIdRef.current === requestId) {
        setResults([]);
        setStatus("error");
        setError("unavailable");
      }
      return [];
    }
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  return { results, status, error, search, clear };
}
