import { useCallback, useEffect, useRef, useState } from "react";
import {
  placeSearchViewbox,
  searchPlaces,
} from "../api/placeSearch";

/** @import { PlaceSearchResult } from "../types/journey" */

export default function usePlaceSearch({ stops, language }) {
  /** @type {[PlaceSearchResult[], import("react").Dispatch<import("react").SetStateAction<PlaceSearchResult[]>>]} */
  const [results, setResults] = useState([]);
  const [state, setState] = useState("idle");
  const [searchedQuery, setSearchedQuery] = useState("");
  const controllerRef = useRef(null);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setResults([]);
    setState("idle");
    setSearchedQuery("");
  }, []);

  const search = useCallback(
    async (query) => {
      const clean = String(query || "").trim().replace(/\s+/g, " ");
      if (clean.length < 3) {
        setResults([]);
        setState("idle");
        setSearchedQuery("");
        return [];
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState("loading");
      setSearchedQuery(clean);

      try {
        const next = await searchPlaces(clean, {
          language,
          viewbox: placeSearchViewbox(stops),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return [];
        setResults(next);
        setState("ready");
        return next;
      } catch (error) {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError" ||
          error?.name === "CanceledError"
        ) {
          return [];
        }

        setResults([]);
        setState("error");
        return [];
      }
    },
    [language, stops]
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  return {
    results,
    state,
    searchedQuery,
    search,
    clear,
  };
}
