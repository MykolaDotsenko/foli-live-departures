import { useMemo, useState } from "react";
import { placeLabel } from "../hooks/useSavedPlaces";
import usePlaceSearch from "../hooks/usePlaceSearch";
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
  coordinatesStatus = "ready",
  online = true,
  onChoosePlace,
  onChooseStop,
  onChooseExternalPlace = null,
  onClear,
}) {
  const language = useLanguage();
  const placeSearch = usePlaceSearch();
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

  const chooseExternalPlace = (place) => {
    const selected = onChooseExternalPlace?.(place) === true;
    if (!selected) {
      setError(
        coordinatesStatus === "loading"
          ? t("Stop locations are still loading. Try again in a moment.")
          : t(
              "No Föli stop close enough to this place could be resolved. Try another destination."
            )
      );
      return;
    }

    placeSearch.clear();
    setValue(place.title);
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    const rawQuery = value.trim();
    const query = normalizeStopQuery(value);

    if (!query) {
      setError(t("Enter a stop, address or place."));
      return;
    }

    const exactId = stops.filter(
      (stop) => normalizeStopQuery(stop.id) === query
    );
    if (exactId.length === 1) {
      chooseStop(exactId[0]);
      return;
    }

    const exactName = stops.filter(
      (stop) => normalizeStopQuery(stop.name) === query
    );
    if (exactName.length === 1) {
      chooseStop(exactName[0]);
      return;
    }

    setFocused(matches.length > 0);

    if (!online) {
      setError(
        matches.length > 0
          ? t(
              "Place search needs a connection. You can still choose a Föli stop from the suggestions."
            )
          : t(
              "Place search needs a connection. Search by Föli stop name or number while offline."
            )
      );
      return;
    }

    if (rawQuery.length < 3) {
      setError(t("Enter at least 3 characters to search places and addresses."));
      return;
    }

    setError("");
    const results = await placeSearch.search(rawQuery, language);

    if (results.length === 0) {
      setError(
        matches.length > 0
          ? t(
              "No matching place or address was found. You can still choose a Föli stop from the suggestions."
            )
          : t(
              "No matching stop, place or address was found. Try a more specific destination."
            )
      );
    }
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
                setValue(event.target.value);
                setError("");
                setFocused(true);
                placeSearch.clear();
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={styles.input}
              placeholder={t("e.g. Prisma Itäharju or Kauppatori")}
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
            disabled={placeSearch.status === "loading"}
            aria-busy={placeSearch.status === "loading"}
          >
            {placeSearch.status === "loading"
              ? t("Searching…")
              : t("Search destination")}
          </button>
        </div>

        <p className={styles.help}>
          {t("Choose Home, Work, School, a Föli stop, address or place.")}
        </p>
        <p className={styles.privacyNote}>
          {t(
            "Stop suggestions stay on this device. Place/address text is sent to OpenStreetMap only after you press Search."
          )}
        </p>

        {placeSearch.results.length > 0 && (
          <section
            className={styles.placeResults}
            aria-labelledby="place-search-results-title"
          >
            <div className={styles.placeResultsHeading}>
              <h3 id="place-search-results-title">
                {t("Places & addresses")}
              </h3>
              <span>{t("Choose one")}</span>
            </div>

            <div className={styles.placeList}>
              {placeSearch.results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className={styles.placeResult}
                  onClick={() => chooseExternalPlace(place)}
                >
                  <strong>{place.title}</strong>
                  {place.subtitle && <span>{place.subtitle}</span>}
                </button>
              ))}
            </div>

            <p className={styles.attribution}>
              {t("Place search data")} ·{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                © OpenStreetMap contributors
              </a>
            </p>
          </section>
        )}

        {placeSearch.status === "error" && !error && (
          <p className={styles.error} role="alert">
            {t("Place search is temporarily unavailable. Föli stop search still works.")}
          </p>
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
