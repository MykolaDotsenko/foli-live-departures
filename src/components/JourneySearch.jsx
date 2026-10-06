import { useEffect, useMemo, useRef, useState } from "react";
import { loadAddressPack } from "../api/addressPack";
import { loadPlacePack } from "../api/placePack";
import { placeLabel } from "../hooks/useSavedPlaces";
import usePlaceSearch from "../hooks/usePlaceSearch";
import { t, useLanguage } from "../i18n";
import { formatDistance } from "../utils/geo";
import { findAddresses } from "../utils/localAddresses";
import { findPlaces } from "../utils/localPlaces";
import { locationErrorMessage, requestOneTimePosition } from "../utils/location";
import { recentPosition, rememberPosition } from "../utils/sessionPosition";
import { findSimilarStops, findStopMatches, normalizeStopQuery } from "../utils/stopSearch";
import { formatClock } from "../utils/time";
import styles from "./JourneySearch.module.css";
import StopName from "./StopName";

const MAX_SUGGESTIONS = 6;
const MAX_PLACE_SUGGESTIONS = 8;
const MAX_ADDRESS_SUGGESTIONS = 6;

// All three sources come from OpenStreetMap and owe it attribution.
const OSM_SOURCES = new Set(["osm-nominatim", "osm-places", "osm-addresses"]);

/**
 * A place from the shipped pack, in the shape the place-destination flow
 * takes from a search provider.
 *
 * @param {import("../api/placePack").PackPlace} place
 * @returns {import("../types/journey").PlaceSearchResult}
 */
function packPlaceResult(place) {
  return {
    id: place.id,
    title: place.name,
    subtitle: [place.street, place.city].filter(Boolean).join(", "),
    lat: place.lat,
    lon: place.lon,
    category: "",
    type: "",
    provider: "osm-places",
    licence: "ODbL-1.0",
  };
}

/**
 * @param {import("../api/addressPack").PackAddress | import("../api/addressPack").PackStreet} address
 * @returns {import("../types/journey").PlaceSearchResult}
 */
function packAddressResult(address) {
  return {
    id: address.id,
    title: address.title,
    subtitle: [
      address.city,
      address.kind === "street" ? t("Street midpoint") : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lat: address.lat,
    lon: address.lon,
    category: "address",
    type: address.kind,
    provider: "osm-addresses",
    licence: "ODbL-1.0",
  };
}

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
  homeEntry = false,
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
  const planChanged = timeMode !== "leave-now" || preference !== "balanced";
  const [planOpen, setPlanOpen] = useState(planChanged);
  const [wasPlanChanged, setWasPlanChanged] = useState(planChanged);
  if (wasPlanChanged !== planChanged) {
    setWasPlanChanged(planChanged);
    if (planChanged) setPlanOpen(true);
  }

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
  // Shops, health care, schools and other places from the pack shipped
  // with the app: "Lidl" lists the Lidls, nearest first once the passenger
  // has let the app use their location. Nothing typed leaves the phone.
  const [packPlaces, setPackPlaces] = useState(
    /** @type {import("../api/placePack").PackPlace[]} */ ([])
  );
  const [packAddresses, setPackAddresses] = useState(
    /** @type {import("../api/addressPack").ParsedAddressPack} */ ({
      addresses: [],
      streets: [],
    })
  );
  const [origin, setOrigin] = useState(recentPosition);
  const [locating, setLocating] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  // On narrow screens suggestions are in normal flow above the submit button.
  // A pointer press on Submit blurs the input before click; closing the list
  // during that blur would move the button away from the pointer and cancel
  // the click. Keep the list stable until the form submit itself closes it.
  const submitPointerDownRef = useRef(false);
  const wantsPlaces = focused || Boolean(value.trim());
  useEffect(() => {
    if (!wantsPlaces || packPlaces.length > 0) return undefined;
    let current = true;
    loadPlacePack().then((loaded) => {
      if (current && loaded.length > 0) setPackPlaces(loaded);
    });
    return () => {
      current = false;
    };
  }, [wantsPlaces, packPlaces.length]);

  // The address pack is larger than the POI pack. Do not parse it merely
  // because the planner opened; load it after three typed characters. The
  // generated service worker still precaches it for true offline use.
  const wantsAddresses = value.trim().length >= 3;
  useEffect(() => {
    if (
      !wantsAddresses ||
      packAddresses.addresses.length > 0 ||
      packAddresses.streets.length > 0
    ) {
      return undefined;
    }
    let current = true;
    loadAddressPack().then((loaded) => {
      if (
        current &&
        (loaded.addresses.length > 0 || loaded.streets.length > 0)
      ) {
        setPackAddresses(loaded);
      }
    });
    return () => {
      current = false;
    };
  }, [
    wantsAddresses,
    packAddresses.addresses.length,
    packAddresses.streets.length,
  ]);

  const placeMatches = useMemo(
    () =>
      findPlaces(packPlaces, value, {
        origin,
        limit: MAX_PLACE_SUGGESTIONS,
      }),
    [packPlaces, value, origin]
  );
  const addressMatches = useMemo(
    () =>
      findAddresses(packAddresses, value, {
        origin,
        limit: MAX_ADDRESS_SUGGESTIONS,
      }),
    [packAddresses, value, origin]
  );
  const options = useMemo(
    () => [
      ...suggestions.map((stop) => ({
        kind: "stop",
        key: `stop:${stop.id}`,
        stop,
        place: null,
        address: null,
      })),
      ...addressMatches.map((address) => ({
        kind: "address",
        key: `address:${address.id}`,
        stop: null,
        place: null,
        address,
      })),
      ...placeMatches.map((place) => ({
        kind: "place",
        key: `place:${place.id}`,
        stop: null,
        place,
        address: null,
      })),
    ],
    [suggestions, addressMatches, placeMatches]
  );
  const showSuggestions = focused && value.trim() && options.length > 0;
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keyboard selection can move past the visible part of a long list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`journey-destination-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const chooseStop = (stop) => {
    setActiveIndex(-1);
    onChooseStop(stop);
    placeSearch.clear();
    setValue(stop.name || String(stop.id));
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  // As in stop search: the field is a combobox, so its list answers to the
  // keyboard. Its options were buttons, and Tab moved focus onto one that
  // the list then removed, dropping a keyboard user to the top of the page.
  const handleKeyDown = (event) => {
    if (!showSuggestions) {
      if (event.key === "ArrowDown" && value.trim() && options.length > 0) {
        event.preventDefault();
        setFocused(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? options.length - 1 : index - 1
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseOption(options[activeIndex]);
    } else if (event.key === "Escape") {
      setActiveIndex(-1);
      setFocused(false);
    }
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
    setActiveIndex(-1);
    setValue(place.title);
    setFocused(false);
    setError("");
    if (compact) setExpanded(false);
  };

  /** @param {(typeof options)[number] | undefined} option */
  const chooseOption = (option) => {
    if (option?.kind === "stop" && option.stop) chooseStop(option.stop);
    else if (option?.kind === "address" && option.address) {
      chooseExternalPlace(packAddressResult(option.address));
    } else if (option?.kind === "place" && option.place) {
      chooseExternalPlace(packPlaceResult(option.place));
    }
  };

  // Asked for here, once, like "Find nearest stop": the places are then
  // listed nearest first, and the fix is kept only in memory.
  const listNearestFirst = async () => {
    if (locating) return;
    setLocating(true);
    setError("");
    try {
      const position = await requestOneTimePosition(navigator.geolocation);
      rememberPosition(position);
      setOrigin({ lat: position.lat, lon: position.lon });
      setActiveIndex(-1);
      inputRef.current?.focus();
      setFocused(true);
    } catch (locationError) {
      setError(t(locationErrorMessage(locationError)));
    } finally {
      setLocating(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    submitPointerDownRef.current = false;
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

    // A shipped address/street match always wins over an external provider.
    // If Submit races the lazy pack, await the same-origin file here.
    let submittedAddressMatches = addressMatches;
    if (
      rawQuery.length >= 3 &&
      submittedAddressMatches.length === 0 &&
      packAddresses.addresses.length === 0 &&
      packAddresses.streets.length === 0
    ) {
      const loaded = await loadAddressPack();
      submittedAddressMatches = findAddresses(loaded, rawQuery, {
        origin,
        limit: MAX_ADDRESS_SUGGESTIONS,
      });
      if (loaded.addresses.length > 0 || loaded.streets.length > 0) {
        setPackAddresses(loaded);
      }
    }
    if (submittedAddressMatches.length > 0) {
      setFocused(true);
      setError("");
      return;
    }

    // Without a provider, the places shipped with the app are the answer:
    // their list opens; with nothing to list, the passenger is told where
    // a street address can be found.
    if (!directPlaceSearchEnabled) {
      setFocused(options.length > 0);
      setError(
        options.length > 0
          ? ""
          : t(
              "No local stop, address or place matches “{query}”. Try the official Turku journey planner for a wider search.",
              { query: rawQuery }
            )
      );
      return;
    }

    // An explicit provider search replaces autocomplete with its submitted
    // results. Keeping the local popup open here can cover those results and
    // the submit control, especially on a phone.
    setActiveIndex(-1);
    setFocused(false);

    if (!online) {
      setFocused(options.length > 0);
      setError(
        placeMatches.length > 0
          ? ""
          : suggestions.length > 0
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
    if (results === null) return;

    if (results.length === 0) {
      setFocused(options.length > 0);
      setError(
        placeMatches.length > 0
          ? ""
          : suggestions.length > 0
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
          {OSM_SOURCES.has(destination.source) && (
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
          {!homeEntry && <p className={styles.kicker}>{t("Journey")}</p>}
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
          {OSM_SOURCES.has(destination.source) && (
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


      <form onSubmit={submit} noValidate>
        <label htmlFor="journey-destination" className={styles.label}>
          {t("Stop, address or place")}
        </label>
        <div className={styles.searchRow}>
          {/* Focus moving into the list's own controls keeps it open:
              leaving the field closed it under a keyboard user's Tab. */}
          <div
            className={styles.inputWrap}
            onFocus={() => {
              setFocused(true);
              setOrigin((current) => current || recentPosition());
            }}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              if (submitPointerDownRef.current) return;
              setActiveIndex(-1);
              setFocused(false);
            }}
          >
            <input
              ref={inputRef}
              id="journey-destination"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
                setActiveIndex(-1);
                setFocused(true);
                placeSearch.clear();
              }}
              onKeyDown={handleKeyDown}
              className={styles.input}
              // Where address search is off, the address example led
              // straight to "unavailable here".
              placeholder={
                directPlaceSearchEnabled
                  ? t("e.g. Prisma Itäharju or Kauppatori")
                  : t("e.g. Tampereentie 12 or Prisma")
              }
              autoComplete="off"
              inputMode="search"
              role="combobox"
              aria-expanded={Boolean(showSuggestions)}
              aria-controls="journey-destination-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                showSuggestions && activeIndex >= 0
                  ? `journey-destination-option-${activeIndex}`
                  : undefined
              }
              aria-invalid={Boolean(error)}
            />
            {showSuggestions && (
              <div
                className={styles.suggestions}
                onPointerDown={(event) => {
                  // A tap on the list must not take focus from the field.
                  if (!(event.target instanceof HTMLAnchorElement)) {
                    event.preventDefault();
                  }
                }}
              >
                <div
                  id="journey-destination-suggestions"
                  role="listbox"
                  aria-label={t("Destination suggestions")}
                >
                  {options.map((option, index) =>
                    option.kind === "stop" && option.stop ? (
                      <div
                        key={option.key}
                        id={`journey-destination-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={styles.suggestion}
                        onClick={() => chooseOption(option)}
                      >
                        <strong>
                          <StopName stop={option.stop} />
                        </strong>
                        <span>{t("Stop {id}", { id: option.stop.id })}</span>
                      </div>
                    ) : option.kind === "address" && option.address ? (
                      <div
                        key={option.key}
                        id={`journey-destination-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={styles.suggestion}
                        data-address="true"
                        onClick={() => chooseOption(option)}
                      >
                        <span className={styles.placeText}>
                          <strong>{option.address.title}</strong>
                          <small>
                            {[
                              option.address.city,
                              option.address.kind === "street"
                                ? t("Street midpoint")
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        {option.address.distanceMeters !== null && (
                          <span>{formatDistance(option.address.distanceMeters)}</span>
                        )}
                      </div>
                    ) : option.place ? (
                      <div
                        key={option.key}
                        id={`journey-destination-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={styles.suggestion}
                        data-place="true"
                        onClick={() => chooseOption(option)}
                      >
                        <span className={styles.placeText}>
                          <strong>{option.place.name}</strong>
                          {(option.place.street || option.place.city) && (
                            <small>
                              {[option.place.street, option.place.city]
                                .filter(Boolean)
                                .join(", ")}
                            </small>
                          )}
                        </span>
                        {option.place.distanceMeters !== null && (
                          <span>{formatDistance(option.place.distanceMeters)}</span>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
                {(placeMatches.length > 0 || addressMatches.length > 0) && (
                  <div className={styles.placeFooter}>
                    {!origin && (
                      <button
                        type="button"
                        className={styles.nearestButton}
                        onClick={listNearestFirst}
                        aria-busy={locating}
                      >
                        <span aria-hidden="true">{locating ? "…" : "⌖"}</span>
                        {locating ? t("Locating…") : t("Nearest to me first")}
                      </button>
                    )}
                    <p className={styles.placeAttribution}>
                      {t("Place search data")} ·{" "}
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("© OpenStreetMap contributors")}
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            className={styles.submit}
            onPointerDown={() => {
              submitPointerDownRef.current = true;
            }}
            onPointerUp={() => {
              submitPointerDownRef.current = false;
            }}
            onPointerCancel={() => {
              submitPointerDownRef.current = false;
            }}
            disabled={placeSearch.status === "loading"}
            aria-busy={placeSearch.status === "loading"}
          >
            {placeSearch.status === "loading"
              ? t("Searching…")
              : t("Search destination")}
          </button>
        </div>

        {!homeEntry && (
          <p className={styles.help}>
            {t("Choose Home, Work, School, a Föli stop, address or place.")}
          </p>
        )}
        {directPlaceSearchEnabled ? (
          !homeEntry && (
            <p className={styles.privacyNote}>
              {t(
                "Stop suggestions stay on this device. Place/address text is sent to OpenStreetMap only after you press Search; repeated searches are cached only for this browser session."
              )}
            </p>
          )
        ) : (
          <>
            {!homeEntry && (
              <div className={styles.handoff}>
                <p className={styles.privacyNote}>
                  {t(
                    "Searched on this device: nothing you type here is sent anywhere."
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
            {value.trim() &&
              options.length === 0 &&
              value.trim() !== destinationLabel(destination) && (
                <>
                  <p className={styles.privacyNote}>
                    {t(
                      "Offline OpenStreetMap data may not contain every address. For a wider search, use the official Turku journey planner."
                    )}
                  </p>
                  {homeEntry && online && (
                    <a
                      className={styles.handoffLink}
                      href="https://turku.digitransit.fi/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Open Turku journey planner")}
                    </a>
                  )}
                </>
              )}
          </>
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
                    "Online place search is unavailable. Local stop, address and place search still works."
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

      {/* Where to comes first; when and how are refinements of it, and
          ahead of the field they pushed it off a phone's first screen.
          Folded to one line that says what is set, they open by themselves
          once either is changed from "leave now" and "balanced". */}
      <details
        className={styles.planDisclosure}
        open={planOpen}
        onToggle={(event) => setPlanOpen(event.currentTarget.open)}
      >
        <summary>
          <span>{t("Journey timing and preference")}</span>
          <span className={styles.planSummary}>
            {planSummary(timeConstraint, preference)}
          </span>
        </summary>
        <fieldset className={styles.planControls}>
          <legend className="visually-hidden">
            {t("Journey timing and preference")}
          </legend>
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
        </fieldset>
      </details>
      {/* Outside the fold, so a closed one still shows why no journey is
          searched. */}
      {!timeValid && timeMode !== "leave-now" && (
        <p className={styles.error} role="alert">
          {t(
            "Choose a valid future Turku time. Times skipped by the daylight-saving clock change are not available."
          )}
        </p>
      )}
    </section>
  );
}
