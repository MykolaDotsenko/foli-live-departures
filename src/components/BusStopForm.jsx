import { useEffect, useMemo, useRef, useState } from "react";
import { msg, t, useLanguage } from "../i18n";
import { formatAccuracy, formatDistance, hasCoordinates } from "../utils/geo";
import {
  locationErrorMessage,
  requestOneTimePosition,
} from "../utils/location";
import { judgeNearestStop } from "../utils/nearestStop";
import styles from "./BusStopForm.module.css";
import StopName from "./StopName";
import { findSimilarStops, findStopMatches, normalizeStopQuery } from "../utils/stopSearch";

const MAX_SUGGESTIONS = 6;

// A message is kept as its phrase and values, and put into words when shown,
// so one already on screen follows a change of language. A value written
// differently by language (a distance: "1.4 km", "1,4 km") is kept as a
// function and worked out then too.
const message = (text, params) => ({ text, params });

function inWords({ text, params = {} }) {
  return t(
    text,
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        typeof value === "function" ? value() : value,
      ])
    )
  );
}

// Why a location did not pick a stop, in the words the passenger needs to
// decide what to do instead.
function locationDoubt(verdict, stop, position) {
  if (verdict === "approximate") {
    return message(
      msg(
        "Your location is too approximate{accuracy} to pick a stop for you. Search by name, or try again outdoors."
      ),
      {
        accuracy: Number.isFinite(position?.accuracy)
          ? () => ` (${formatAccuracy(position.accuracy)})`
          : "",
      }
    );
  }
  if (verdict === "outside-area") {
    return message(
      msg(
        "You appear to be outside the Föli area, so no stop was filled in. Search by name instead."
      )
    );
  }
  if (verdict === "far") {
    return message(
      msg(
        "The nearest stop is {distance} away, so it was not filled in. Search by name instead."
      ),
      { distance: () => formatDistance(stop.distanceMeters) }
    );
  }
  if (verdict === "ambiguous") {
    return message(
      msg(
        "Two stops are almost equally close. Search for the one that serves your direction."
      )
    );
  }
  return message(
    msg(
      "No nearby Föli stop could be resolved from your location. Search manually instead."
    )
  );
}

function BusStopForm({
  compact = false,
  activeStopId,
  stops,
  coordinatesStatus = "idle",
  serviceBoundary = null,
  onSubmit,
  onEdit,
}) {
  useLanguage();
  // The field accepts a name or a number equally, so it should give back
  // whichever one the person thinks in. It used to answer every entry with
  // the number: type "Kauppatori", get "164". Names are what people
  // remember, so a resolved stop is shown by name and the id is kept
  // alongside, ready for the next submit.
  const resolveStop = (stopId) =>
    stops.find((stop) => String(stop.id) === String(stopId)) || null;

  const [resolved, setResolved] = useState(() => resolveStop(activeStopId));
  const [value, setValue] = useState(
    () => resolveStop(activeStopId)?.name || activeStopId
  );
  const [validationError, setValidationError] = useState(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);

  // The catalogue loads after the first paint and again when coordinates
  // merge, so `stops` changes identity mid-session. Resetting the field on
  // every one of those wiped whatever was being typed at that moment.
  const syncedStopIdRef = useRef(activeStopId);
  // Counts every change to the field made by the passenger or by moving to
  // another stop. A location fix can take seconds; if the text changed in
  // the meantime, the late answer is about a question nobody is asking any
  // more and must not replace what they typed.
  const fieldEditsRef = useRef(0);

  useEffect(() => {
    const stop =
      stops.find((item) => String(item.id) === String(activeStopId)) || null;
    const navigated = syncedStopIdRef.current !== activeStopId;
    syncedStopIdRef.current = activeStopId;
    if (navigated) fieldEditsRef.current += 1;

    setResolved(stop);
    setValue((current) => {
      // A different stop is on screen now, so the field belongs to it.
      if (navigated) return stop?.name || activeStopId;
      // The catalogue arrived late and can finally name the stop we are
      // showing as a bare number — but only if nobody is mid-word.
      if (stop && current === activeStopId) return stop.name;
      return current;
    });
  }, [activeStopId, stops]);

  const matches = useMemo(
    () => findStopMatches(stops, value, MAX_SUGGESTIONS),
    [stops, value]
  );
  // With nothing matching as typed, names a typing slip away are offered:
  // "Kauppatroi" found nothing at all. Only offered; a submit opens a stop
  // the passenger actually typed or chose.
  const suggestions = useMemo(
    () =>
      matches.length > 0
        ? matches
        : findSimilarStops(stops, value, MAX_SUGGESTIONS),
    [matches, stops, value]
  );
  const showSuggestions = focused && value.trim() && suggestions.length > 0;

  const chooseStop = (stop) => {
    setValue(stop.name || stop.id);
    setResolved(stop);
    setValidationError(null);
    setActiveIndex(-1);
    // Chosen, the list has done its job: left open it went on offering the
    // stop just picked (aria-expanded stayed true). Typing opens it again.
    setFocused(false);
    onSubmit(stop.id);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const query = value.trim();

    // The field is showing a stop we already resolved and nobody has edited
    // it, so submitting again means that same stop — no need to re-run the
    // name lookup, which would stumble on two stops sharing a name.
    if (resolved && normalizeStopQuery(query) === normalizeStopQuery(resolved.name)) {
      setValidationError(null);
      // Submitted with the keyboard's Go key, focus stays in the field. A
      // list left open there covered the board this submit just opened.
      setActiveIndex(-1);
      setFocused(false);
      onSubmit(resolved.id);
      return;
    }

    if (/^\d+$/.test(query)) {
      setValidationError(null);
      setActiveIndex(-1);
      setFocused(false);
      onSubmit(query);
      return;
    }

    const exactNames = stops.filter(
      (stop) => normalizeStopQuery(stop.name) === normalizeStopQuery(query)
    );

    if (exactNames.length === 1) {
      chooseStop(exactNames[0]);
      return;
    }

    if (exactNames.length > 1) {
      setFocused(true);
      setActiveIndex(-1);
      setValidationError(
        message(
          msg(
            "More than one stop has this name. Choose the correct stop number from the suggestions."
          )
        )
      );
      return;
    }

    if (matches.length === 1) {
      chooseStop(matches[0]);
      return;
    }

    setValidationError(
      message(msg("Choose a stop from the suggestions or enter its stop number."))
    );
  };

  const locateNearestStop = async () => {
    // Busy, the button stays focusable but does nothing (see below).
    if (locating) return;
    setValidationError(null);
    setActiveIndex(-1);

    if (!navigator.geolocation) {
      setValidationError(
        message(msg("This browser does not support location access."))
      );
      return;
    }

    if (!stops.some(hasCoordinates)) {
      setValidationError(
        message(
          coordinatesStatus === "loading"
            ? msg("Stop locations are still loading. Try again in a moment.")
            : msg(
                "Stop locations are temporarily unavailable. Search manually instead."
              )
        )
      );
      return;
    }

    setLocating(true);
    const editsAtTap = fieldEditsRef.current;
    const superseded = () => fieldEditsRef.current !== editsAtTap;

    try {
      const position = await requestOneTimePosition(navigator.geolocation);
      if (superseded()) return;
      const { verdict, stop: nearest } = judgeNearestStop(
        stops,
        position,
        serviceBoundary
      );

      if (verdict !== "confident") {
        setValidationError(locationDoubt(verdict, nearest, position));
        return;
      }

      // Location is a suggestion, not a navigation command. Fill the field
      // with the resolved public stop name and let the passenger confirm by
      // pressing "Show departures".
      setValue(nearest.name || nearest.id);
      setResolved(nearest);
      setFocused(false);
    } catch (error) {
      if (superseded()) return;
      setValidationError(message(locationErrorMessage(error)));
    } finally {
      setLocating(false);
    }
  };

  // Keyboard selection can move past the visible part of a long list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`foli-stop-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (event) => {
    if (!showSuggestions) {
      // Down arrow opens a list Escape closed, as in any combobox.
      if (event.key === "ArrowDown" && value.trim() && suggestions.length > 0) {
        event.preventDefault();
        setFocused(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseStop(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setActiveIndex(-1);
      setFocused(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.form}
      data-stop-search-form="true"
      data-compact={compact ? "true" : undefined}
      noValidate
    >
      <label htmlFor="stop-search" className={styles.label}>
        {t("Find your stop")}
      </label>

      <div className={styles.searchWrap}>
        <div className={styles.controls}>
          <input
            id="stop-search"
            className={styles.input}
            value={value}
            onChange={(event) => {
              fieldEditsRef.current += 1;
              onEdit?.();
              setValue(event.target.value);
              // Editing the text means it is no longer the stop we resolved.
              setResolved(null);
              setValidationError(null);
              setActiveIndex(-1);
              // Escape closes the list; typing again reopens it. Without
              // this a keyboard user who pressed Escape got no more
              // suggestions until they left the field and came back.
              setFocused(true);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            inputMode="search"
            enterKeyHint="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(showSuggestions)}
            aria-controls="foli-stop-suggestions"
            aria-activedescendant={
              activeIndex >= 0 ? `foli-stop-option-${activeIndex}` : undefined
            }
            aria-invalid={Boolean(validationError)}
            aria-describedby={
              validationError ? "stop-error" : "stop-search-help"
            }
            placeholder={t("e.g. Kauppatori")}
          />
          {/* Keep the one-tap location action next to search at all times.
              "Near you" below is the richer comparison view; this button is
              the fast path for filling the field with a confidently resolved
              nearby stop. */}
          <button
            className={styles.locateButton}
            type="button"
            onClick={locateNearestStop}
            // Busy rather than disabled: a disabled button drops keyboard
            // focus to the page while the location is looked up.
            aria-disabled={locating ? "true" : undefined}
            aria-busy={locating}
            aria-label={t("Use my location")}
            title={t("Use my location")}
          >
            <span aria-hidden="true">{locating ? "…" : "⌖"}</span>
          </button>
          <button
            className={styles.button}
            type="submit"
            aria-label={t("Show departures")}
          >
            <span className={styles.buttonLong}>{t("Show departures")}</span>
            <span className={styles.buttonShort} aria-hidden="true">
              {t("Show")}
            </span>
          </button>
        </div>

        {showSuggestions && (
          <div
            id="foli-stop-suggestions"
            className={styles.suggestions}
            role="listbox"
            aria-label={t("Matching bus stops")}
          >
            {suggestions.map((stop, index) => (
              <div
                key={stop.id}
                id={`foli-stop-option-${index}`}
                className={styles.suggestion}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => chooseStop(stop)}
              >
                <span className={styles.suggestionName}><StopName stop={stop} /></span>
                <span className={styles.suggestionId}>
                  {t("Stop {id}", { id: stop.id })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p id="stop-search-help" className={styles.help}>
        {t("Search by stop name or number.")}
      </p>

      {validationError && (
        <p id="stop-error" className={styles.error} role="alert">
          {inWords(validationError)}
        </p>
      )}
    </form>
  );
}

export default BusStopForm;
