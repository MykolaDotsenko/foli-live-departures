import { useMemo, useState } from "react";
import { placeLabel } from "../hooks/useSavedPlaces";
import usePlaceSearch from "../hooks/usePlaceSearch";
import { t, useLanguage } from "../i18n";
import { findSimilarStops, findStopMatches, normalizeStopQuery } from "../utils/stopSearch";
import { formatClock } from "../utils/time";
import styles from "./JourneySearch.module.css";
import StopName from "./StopName";

const MAX_SUGGESTIONS = 6;

/** @param {{ compact?: boolean }} props */
function OpenStreetMapAttribution({ compact = false }) {
  return (
    <a
      className={compact ? styles.compactAttribution : styles.destinationAttribution}
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noreferrer"
    >
      {t("© OpenStreetMap contributors")}
    </a>
  );
}

function destinationLabel(destination) {
  if (!destination) return "";
  return destination.kind === "saved-place"
    ? t(destination.label)
    : destination.label;
}

function journeyModeLabel(mode) {
  if (mode === "leave-at") return t("Leave at");
  if (mode === "arrive-by") return t("Arrive by");
  return t("Leave now");
}

function preferenceLabel(preference) {
  if (preference === "fewer-transfers") return t("Fewer transfers");
  if (preference === "less-walking") return t("Less walking");
  if (preference === "more-buffer") return t("More transfer time");
  return t("Balanced");
}

function planSummary(timeConstraint, routingPreference) {
  const mode = ["leave-at", "arrive-by"].includes(timeConstraint?.mode)
    ? timeConstraint.mode
    : "leave-now";
  const targetTimeSec = Number(timeConstraint?.targetTimeSec);
  const preference = preferenceLabel(routingPreference);
  if (mode === "leave-now" || !Number.isFinite(targetTimeSec) || targetTimeSec <= 0) {
    return `${journeyModeLabel(mode)} · ${preference}`;
  }
  return `${journeyModeLabel(mode)} ${formatClock(targetTimeSec)} · ${preference}`;
}

export default function JourneySearch({
  compact = false,
  stops,
  places,
  destination,
  timeConstraint = null,
  timeLocalValue = "",
  timeValid = true,
  routingPreference = "balanced",
  coordinatesStatus = "ready",
  online = true,
  onChoosePlace,
  onChooseStop,
  onChooseExternalPlace = null,
  onTimeModeChange = null,
  onTimeLocalValueChange = null,
  onPreferenceChange = null,
  onClear,
}) {
  const language = useLanguage();
  const placeSearch = usePlaceSearch();
  const directPlaceSearchEnabled = placeSearch.directEnabled !== false;
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(!compact);
  // Opening a stop folds the planner away, so the board leads the screen.
  const [wasCompact, setWasCompact] = useState(compact);
  if (wasCompact !== compact) {
    setWasCompact(compact);
    setExpanded(!compact);
  }
  const timeMode = ["leave-at", "arrive-by"].includes(timeConstraint?.mode)
    ? timeConstraint.mode
    : "leave-now";
  const preference = [
    "fewer-transfers",
    "less-walking",
    "more-buffer",
  ].includes(routingPreference)
    ? routingPreference
    : "balanced";

  const matches = useMemo(
    () => findStopMatches(stops, value, MAX_SUGGESTIONS),
    [stops, value]
  );
  // A typing slip ("Varisuo") is offered its stop, never chosen for it.
  const suggestions = useMemo(
    () =>
      matches.length > 0
        ? matches
        : findSimilarStops(stops, value, MAX_SUGGESTIONS),
    [matches, stops, value]
  );
  const showSuggestions = focused && value.trim() && suggestions.length > 0;

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
    const prepared = onChooseExternalPlace?.(place);
    if (!prepared?.ok) {
      if (coordinatesStatus === "loading") {
        setError(
          t("Stop locations are still loading. Try again in a moment.")
        );
      } else if (coordinatesStatus !== "ready") {
        setError(
          t("Stop locations are temporarily unavailable. Search manually instead.")
        );
      } else if (prepared?.reason === "outside-service-area") {
        setError(
          t(
            "This place appears outside Föli’s service area. Choose a destination inside the Föli area."
          )
        );
      } else {
        setError(
          t(
            "No Föli stop close enough to this place could be resolved. Try another destination."
          )
        );
      }
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

    setFocused(suggestions.length > 0);

    if (!online) {
      setError(
        suggestions.length > 0
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

    if (!directPlaceSearchEnabled) {
      setError(
        t(
          "Direct address and place search is unavailable here. Use the official Turku journey planner; Föli stop search still works in this app."
        )
      );
      return;
    }

    setError("");
    const results = await placeSearch.search(rawQuery, language);
    if (results === null) return;

    if (results.length === 0) {
      setError(
        suggestions.length > 0
          ? t(
              "No matching place or address was found. You can still choose a Föli stop from the suggestions."
            )
          : t(
              "No matching stop, place or address was found. Try a more specific destination."
            )
      );
    }
  };

  // With a stop's board open and no destination yet, the planner is one
  // line that opens it. A returning passenger opens on their last stop, and
  // with no line here "Where do you want to go?" was out of reach for good.
  if (compact && !destination && !expanded) {
    return (
      <section
        className={styles.compactWrapper}
        aria-label={t("Journey")}
      >
        <button
          type="button"
          className={styles.compactOpen}
          aria-expanded="false"
          onClick={() => setExpanded(true)}
        >
          {t("Where do you want to go?")}
        </button>
      </section>
    );
  }

  if (compact && destination && !expanded) {
    return (
      <section
        className={styles.compactWrapper}
        aria-label={t("Journey destination")}
      >
        <span className={styles.compactDestination}>
          <span>{t("Going to")}</span>
          <strong>{destinationLabel(destination)}</strong>
          <span className={styles.compactPlan}>
            {planSummary(timeConstraint, preference)}
          </span>
          {destination.source === "osm-nominatim" && (
            <OpenStreetMapAttribution compact />
          )}
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
        {compact && !destination && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => setExpanded(false)}
          >
            {t("Close")}
          </button>
        )}
      </div>

      {destination && (
        <div className={styles.destination} role="status">
          <span>{t("Going to")}</span>
          <strong>{destinationLabel(destination)}</strong>
          {destination.source === "osm-nominatim" && (
            <OpenStreetMapAttribution />
          )}
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

      <fieldset className={styles.planControls}>
        <legend>{t("Journey timing and preference")}</legend>
        <div className={styles.planGrid}>
          <label>
            <span>{t("When")}</span>
            <select
              value={timeMode}
              onChange={(event) => onTimeModeChange?.(event.target.value)}
            >
              <option value="leave-now">{t("Leave now")}</option>
              <option value="leave-at">{t("Leave at")}</option>
              <option value="arrive-by">{t("Arrive by")}</option>
            </select>
          </label>

          {timeMode !== "leave-now" && (
            <label>
              <span>{t("Turku local time")}</span>
              <input
                type="datetime-local"
                value={timeLocalValue}
                onChange={(event) =>
                  onTimeLocalValueChange?.(event.target.value)
                }
                aria-invalid={!timeValid}
              />
            </label>
          )}

          <label>
            <span>{t("Route preference")}</span>
            <select
              value={preference}
              onChange={(event) =>
                onPreferenceChange?.(event.target.value)
              }
            >
              <option value="balanced">{t("Balanced")}</option>
              <option value="fewer-transfers">{t("Fewer transfers")}</option>
              <option value="less-walking">{t("Less walking")}</option>
              <option value="more-buffer">{t("More transfer time")}</option>
            </select>
          </label>
        </div>
        <p className={styles.planHelp}>
          {t(
            "Future-time searches use published Föli timetables. Live estimates are used for leave-now journeys when fresh."
          )}
        </p>
        {!timeValid && timeMode !== "leave-now" && (
          <p className={styles.error} role="alert">
            {t(
              "Choose a valid future Turku time. Times skipped by the daylight-saving clock change are not available."
            )}
          </p>
        )}
      </fieldset>

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
              // Where address search is off, the address example led
              // straight to "unavailable here".
              placeholder={
                directPlaceSearchEnabled
                  ? t("e.g. Prisma Itäharju or Kauppatori")
                  : t("e.g. Kauppatori")
              }
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
                {suggestions.map((stop) => (
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
        {directPlaceSearchEnabled ? (
          <p className={styles.privacyNote}>
            {t(
              "Stop suggestions stay on this device. Place/address text is sent to OpenStreetMap only after you press Search; repeated searches are cached only for this browser session."
            )}
          </p>
        ) : (
          <div className={styles.handoff}>
            <p className={styles.privacyNote}>
              {t(
                "This app keeps address and place text on this device when direct place search is unavailable. Use the official Turku journey planner for address and POI search."
              )}
            </p>
            {online && (
              <a
                className={styles.handoffLink}
                href="https://turku.digitransit.fi/"
                target="_blank"
                rel="noreferrer"
              >
                {t("Open Turku journey planner")}
              </a>
            )}
          </div>
        )}

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
                {t("© OpenStreetMap contributors")}
              </a>
            </p>
          </section>
        )}

        {placeSearch.status === "error" && !error && (
          <p className={styles.error} role="alert">
            {placeSearch.error === "rate-limited"
              ? t(
                  "Place search is temporarily rate-limited. Wait a moment and try again; Föli stop search still works."
                )
              : placeSearch.error === "external-handoff"
                ? t(
                    "Direct address and place search is unavailable here. Use the official Turku journey planner; Föli stop search still works in this app."
                  )
                : t(
                    "Place search is temporarily unavailable. Föli stop search still works."
                  )}
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
