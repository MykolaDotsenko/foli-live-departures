import { useMemo, useState } from "react";
import { placeLabel } from "../hooks/useSavedPlaces";
import usePlaceSearch from "../hooks/usePlaceSearch";
import { t, useLanguage } from "../i18n";
import { findStopMatches, normalizeStopQuery } from "../utils/stopSearch";
import styles from "./JourneySearch.module.css";
import StopName from "./StopName";

const MAX_SUGGESTIONS = 6;
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

function destinationLabel(destination) {
  if (!destination) return "";
  return destination.kind === "saved-place"
    ? t(destination.label)
    : destination.label;
}

function geocodedSelectionError(reason) {
  if (reason === "outside-service-area") {
    return t("That place is outside Föli’s service area.");
  }
  if (reason === "no-nearby-stops") {
    return t("No Föli stop is close enough to use for that place.");
  }
  return t("That place could not be used as a destination.");
}

export default function JourneySearch({
  compact = false,
  stops,
  places,
  destination,
  online = true,
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
  const placeSearch = usePlaceSearch({ stops, language });

  const matches = useMemo(
    () => findStopMatches(stops, value, MAX_SUGGESTIONS),
    [stops, value]
  );
  const showSuggestions = focused && value.trim() && matches.length > 0;
  const showPlaceResults =
    placeSearch.state === "ready" && placeSearch.results.length > 0;

  const chooseStop = (stop) => {
    onChooseStop(stop);
    placeSearch.clear();
    setValue(stop.name || String(stop.id));
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const choosePlace = (place) => {
    onChoosePlace(place);
    placeSearch.clear();
    setError("");
    if (compact) setExpanded(false);
  };

  const chooseGeocodedPlace = (place) => {
    if (!onChooseGeocodedPlace) return;

    const prepared = onChooseGeocodedPlace(place);
    if (!prepared?.ok) {
      setError(geocodedSelectionError(prepared?.reason));
      return;
    }

    placeSearch.clear();
    setValue(place.label);
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    const query = normalizeStopQuery(value);
    if (!query) {
      setError(t("Enter a stop, address or place."));
      return;
    }

    const exact = stops.filter(
      (stop) =>
        normalizeStopQuery(stop.id) === query ||
        normalizeStopQuery(stop.name) === query
    );

    // Preserve the old fast path for an unambiguous exact public stop.
    if (exact.length === 1) {
      chooseStop(exact[0]);
      return;
    }

    setFocused(matches.length > 0);

    if (!online) {
      setError(
        exact.length > 1
          ? t(
              "More than one stop has this name. Choose one from the suggestions."
            )
          : t(
              "Place search needs an internet connection. Stop search still works."
            )
      );
      return;
    }

    const results = await placeSearch.search(value);

    if (results === null) {
      setError(
        t(
          "Place search is temporarily unavailable. Stop search still works."
        )
      );
      return;
    }

    if (results.length === 0) {
      if (exact.length > 1) {
        setError(
          t(
            "More than one stop has this name. Choose one from the suggestions."
          )
        );
      } else if (matches.length > 0) {
        setError(
          t(
            "Choose a stop from the suggestions, or try a more specific address or place."
          )
        );
      } else {
        setError(t("No matching stop, address or place was found."));
      }
      return;
    }

    setError("");
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
          {t("Stop, address or place")}
        </label>
        <div className={styles.searchRow}>
          <div className={styles.inputWrap}>
            <input
              id="journey-destination"
              value={value}
              onChange={(event) => {
                placeSearch.clear();
                setValue(event.target.value);
                setError("");
                setFocused(true);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={styles.input}
              placeholder={t("e.g. Prisma Itäharju or Turun linna")}
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
          <button
            type="submit"
            className={styles.submit}
            disabled={placeSearch.state === "loading"}
            aria-busy={placeSearch.state === "loading"}
          >
            {placeSearch.state === "loading"
              ? t("Searching…")
              : t("Search")}
          </button>
        </div>
        <p className={styles.help}>
          {t(
            "Stops are searched locally. Address and place search runs only when you press Search."
          )}
        </p>

        {showPlaceResults && (
          <div
            className={styles.placeResults}
            role="region"
            aria-label={t("Places and addresses")}
          >
            <p className={styles.resultHeading}>
              {t("Places and addresses")}
            </p>
            <div className={styles.placeList}>
              {placeSearch.results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className={styles.placeResult}
                  onClick={() => chooseGeocodedPlace(place)}
                >
                  <strong>{place.label}</strong>
                  {place.secondaryLabel && (
                    <span>{place.secondaryLabel}</span>
                  )}
                </button>
              ))}
            </div>
            <p className={styles.attribution}>
              {t("Place search data")}{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                {OSM_ATTRIBUTION}
              </a>
            </p>
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
