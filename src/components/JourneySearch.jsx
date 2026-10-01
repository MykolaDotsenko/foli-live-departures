import { useEffect, useMemo, useRef, useState } from "react";
import { searchPlaces } from "../api/placeSearch";
import { placeLabel } from "../hooks/useSavedPlaces";
import { t, useLanguage } from "../i18n";
import { findStopMatches, normalizeStopQuery } from "../utils/stopSearch";
import styles from "./BusStopForm.module.css";
import StopName from "./StopName";

const MAX_SUGGESTIONS = 6;

function shownDestination(destination) {
  return destination?.kind === "saved-place"
    ? t(destination.label)
    : destination?.label || "";
}

function selectionError(reason) {
  if (reason === "outside-service-area") {
    return t("Outside Föli area.");
  }
  if (reason === "no-nearby-stops") {
    return t("No nearby Föli stop.");
  }
  return t("Place unavailable.");
}

export default function JourneySearch({
  compact = false,
  stops,
  places,
  destination,
  online = true,
  coordinatesStatus = "ready",
  onChoosePlace,
  onChooseStop,
  onChooseGeocodedPlace = null,
  onClear,
}) {
  const language = useLanguage();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(!compact);
  const [placeResults, setPlaceResults] = useState([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const requestRef = useRef(null);

  const clearPlaceSearch = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPlaceResults([]);
    setPlaceLoading(false);
  };

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    []
  );

  const matches = useMemo(
    () => findStopMatches(stops, value, MAX_SUGGESTIONS),
    [stops, value]
  );
  const showPlaceResults = placeResults.length > 0;
  const showSuggestions =
    showPlaceResults ||
    (focused && value.trim() && matches.length > 0);

  const chooseStop = (stop) => {
    onChooseStop(stop);
    clearPlaceSearch();
    setValue(stop.name || String(stop.id));
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const chooseSavedPlace = (place) => {
    onChoosePlace(place);
    clearPlaceSearch();
    setError("");
    if (compact) setExpanded(false);
  };

  const chooseGeocodedPlace = (place) => {
    if (!onChooseGeocodedPlace) return;
    const prepared = onChooseGeocodedPlace(place);
    if (!prepared?.ok) {
      setError(selectionError(prepared?.reason));
      return;
    }

    clearPlaceSearch();
    setValue(place.label);
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const runPlaceSearch = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPlaceLoading(true);

    try {
      const results = await searchPlaces(value, {
        language,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return [];
      setPlaceResults(results);
      if (requestRef.current === controller) setPlaceLoading(false);
      return results;
    } catch (searchError) {
      if (
        controller.signal.aborted ||
        searchError?.name === "AbortError" ||
        searchError?.name === "CanceledError"
      ) {
        return [];
      }
      setPlaceResults([]);
      if (requestRef.current === controller) setPlaceLoading(false);
      return null;
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const query = normalizeStopQuery(value);
    if (!query) {
      setError(t("Enter a destination."));
      return;
    }

    const exact = stops.filter(
      (stop) =>
        normalizeStopQuery(stop.id) === query ||
        normalizeStopQuery(stop.name) === query
    );

    if (exact.length === 1) {
      chooseStop(exact[0]);
      return;
    }

    if (exact.length === 0 && matches.length === 1) {
      chooseStop(matches[0]);
      return;
    }

    setFocused(matches.length > 0);

    if (coordinatesStatus !== "ready") {
      setError(
        coordinatesStatus === "loading"
          ? t("Stop locations are still loading. Try again in a moment.")
          : t("Place search unavailable. Use a stop.")
      );
      return;
    }

    if (!online) {
      setError(
        exact.length > 1
          ? t(
              "More than one stop has this name. Choose the correct stop number from the suggestions."
            )
          : t("Place search unavailable. Use a stop.")
      );
      return;
    }

    const results = await runPlaceSearch();

    if (results === null) {
      setError(
        t("Place search unavailable. Use a stop.")
      );
    } else if (results.length === 0) {
      setError(
        exact.length > 1
          ? t(
              "More than one stop has this name. Choose the correct stop number from the suggestions."
            )
          : matches.length > 0
            ? t(
                "Choose a stop from the suggestions or enter its stop number."
              )
            : t("No destination found.")
      );
    } else {
      setError("");
    }
  };

  if (compact && destination && !expanded) {
    return (
      <section
        className={styles.journeyCompact}
        aria-label={t("Journey destination")}
      >
        <span className={styles.journeyCompactText}>
          <span>{t("Going to")}</span>
          <strong>{shownDestination(destination)}</strong>
        </span>
        <span className={styles.journeyActions}>
          <button type="button" onClick={() => setExpanded(true)}>
            {t("Change")}
          </button>
          <button type="button" onClick={onClear}>
            {t("Clear")}
          </button>
        </span>
      </section>
    );
  }

  return (
    <section className="search-panel" aria-labelledby="journey-search-title">
      <div className={styles.journeyHeading}>
        <h2 id="journey-search-title">{t("Where do you want to go?")}</h2>
        {destination && (
          <button
            type="button"
            className={styles.journeyTextButton}
            onClick={onClear}
          >
            {t("Clear destination")}
          </button>
        )}
      </div>

      {destination && (
        <p className={styles.journeyStatus} role="status">
          {t("Going to")} <strong>{shownDestination(destination)}</strong>
        </p>
      )}

      {places.length > 0 && (
        <div
          className={styles.journeyQuick}
          role="group"
          aria-label={t("Saved destinations")}
        >
          {places.map((place) => (
            <button
              type="button"
              key={place.id}
              aria-pressed={destination?.id === `place:${place.id}`}
              onClick={() => chooseSavedPlace(place)}
            >
              {placeLabel(place)}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className={styles.form} noValidate>
        <label htmlFor="journey-destination" className={styles.label}>
          {t("Stop, address or place")}
        </label>

        <div className={styles.searchWrap}>
          <div className={styles.journeyControls}>
            <input
              id="journey-destination"
              value={value}
              onChange={(event) => {
                clearPlaceSearch();
                setValue(event.target.value);
                setError("");
                setFocused(true);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={styles.input}
              placeholder={t("e.g. Prisma or Turun linna")}
              autoComplete="off"
              inputMode="search"
              enterKeyHint="search"
              role="combobox"
              aria-expanded={Boolean(showSuggestions)}
              aria-controls="journey-destination-suggestions"
              aria-autocomplete="list"
              aria-invalid={Boolean(error)}
            />
            <button
              type="submit"
              className={styles.button}
              disabled={placeLoading}
              aria-busy={placeLoading}
            >
              {placeLoading ? t("Searching…") : t("Search")}
            </button>
          </div>

          {showSuggestions && (
            <div
              id="journey-destination-suggestions"
              className={styles.suggestions}
              role="listbox"
              aria-label={t("Journey destination")}
            >
              {showPlaceResults
                ? placeResults.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      role="option"
                      className={styles.suggestion}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => chooseGeocodedPlace(place)}
                    >
                      <strong className={styles.suggestionName}>
                        {place.label}
                      </strong>
                      {place.secondaryLabel && (
                        <span className={styles.suggestionId}>
                          {place.secondaryLabel}
                        </span>
                      )}
                    </button>
                  ))
                : matches.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      role="option"
                      className={styles.suggestion}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => chooseStop(stop)}
                    >
                      <strong className={styles.suggestionName}>
                        <StopName stop={stop} />
                      </strong>
                      <span className={styles.suggestionId}>
                        {t("Stop {id}", { id: stop.id })}
                      </span>
                    </button>
                  ))}
            </div>
          )}
        </div>

        <p className={styles.help}>
          {t("Stops stay local. Places use Photon after Search.")}
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
