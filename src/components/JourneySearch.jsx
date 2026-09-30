import { useMemo, useState } from "react";
import { placeLabel } from "../hooks/useSavedPlaces";
import { t, useLanguage } from "../i18n";
import { findStopMatches, normalizeStopQuery } from "../utils/stopSearch";
import styles from "./JourneySearch.module.css";
import StopName from "./StopName";

const MAX_SUGGESTIONS = 6;

function destinationLabel(destination) {
  if (!destination) return "";
  return destination.kind === "saved-place"
    ? t(destination.label)
    : destination.label;
}

export default function JourneySearch({
  compact = false,
  stops,
  places,
  destination,
  onChoosePlace,
  onChooseStop,
  onClear,
}) {
  useLanguage();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(!compact);

  const matches = useMemo(
    () => findStopMatches(stops, value, MAX_SUGGESTIONS),
    [stops, value]
  );
  const showSuggestions = focused && value.trim() && matches.length > 0;

  const chooseStop = (stop) => {
    onChooseStop(stop);
    setValue(stop.name || String(stop.id));
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const choosePlace = (place) => {
    onChoosePlace(place);
    setError("");
    if (compact) setExpanded(false);
  };

  const submit = (event) => {
    event.preventDefault();
    const query = normalizeStopQuery(value);
    if (!query) {
      setError(t("Enter a stop name or number."));
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

    if (matches.length === 1) {
      chooseStop(matches[0]);
      return;
    }

    setFocused(true);
    setError(
      exact.length > 1
        ? t(
            "More than one stop has this name. Choose one from the suggestions."
          )
        : t("Choose a destination stop from the suggestions.")
    );
  };

  if (compact && destination && !expanded) {
    return (
      <section
        className={styles.compactWrapper}
        aria-label={t("Journey destination")}
      >
        <span className={styles.compactDestination}>
          <span>{t("Going to")}</span>
          <strong>{destinationLabel(destination)}</strong>
        </span>
        <span className={styles.compactActions}>
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
    <section
      className={styles.wrapper}
      data-compact={compact ? "true" : undefined}
      aria-labelledby="journey-search-title"
    >
      <div className={styles.headingRow}>
        <div>
          <p className={styles.kicker}>{t("Journey")}</p>
          <h2 id="journey-search-title">{t("Where do you want to go?")}</h2>
        </div>
        {destination && (
          <button type="button" className={styles.clear} onClick={onClear}>
            {t("Clear destination")}
          </button>
        )}
      </div>

      {destination && (
        <div className={styles.destination} role="status">
          <span>{t("Going to")}</span>
          <strong>{destinationLabel(destination)}</strong>
        </div>
      )}

      {places.length > 0 && (
        <div
          className={styles.quick}
          role="group"
          aria-label={t("Saved destinations")}
        >
          {places.map((place) => (
            <button
              type="button"
              key={place.id}
              aria-pressed={destination?.id === `place:${place.id}`}
              onClick={() => choosePlace(place)}
            >
              {placeLabel(place)}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label htmlFor="journey-destination" className={styles.label}>
          {t("Choose destination stop")}
        </label>
        <div className={styles.searchRow}>
          <div className={styles.inputWrap}>
            <input
              id="journey-destination"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
                setFocused(true);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={styles.input}
              placeholder={t("e.g. Turun linna")}
              autoComplete="off"
              inputMode="search"
              role="combobox"
              aria-expanded={Boolean(showSuggestions)}
              aria-controls="journey-destination-suggestions"
              aria-autocomplete="list"
              aria-invalid={Boolean(error)}
            />
            {showSuggestions && (
              <div
                id="journey-destination-suggestions"
                className={styles.suggestions}
                role="listbox"
                aria-label={t("Destination stop suggestions")}
              >
                {matches.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    role="option"
                    className={styles.suggestion}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => chooseStop(stop)}
                  >
                    <strong>
                      <StopName stop={stop} />
                    </strong>
                    <span>{t("Stop {id}", { id: stop.id })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className={styles.submit}>
            {t("Use destination")}
          </button>
        </div>
        <p className={styles.help}>
          {t("Choose Home, Work, School or a Föli stop.")}
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
