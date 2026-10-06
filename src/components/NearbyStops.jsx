import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg, t, useLanguage } from "../i18n";
import useDestinationAwareNearby from "../hooks/useDestinationAwareNearby";
import useTransferJourneyOptions from "../hooks/useTransferJourneyOptions";
import {
  distanceInMeters,
  findNearestStops,
  formatAccuracy,
  formatDistance,
  hasCoordinates,
  isInsideMultiPolygon,
} from "../utils/geo";
import { requestCompassPermission } from "../utils/stopRadar";
import { locationErrorMessage, requestOneTimePosition } from "../utils/location";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import {
  AUTO_SELECT_MAX_ACCURACY_METERS,
  AUTO_SELECT_MAX_DISTANCE_METERS,
  OUTSIDE_NETWORK_WARNING_METERS,
  nearestChoiceIsAmbiguous,
} from "../utils/nearestStop";
import { formatClock, formatDue } from "../utils/time";
import {
  materiallyBetterDestinationFit,
  rankDestinationStops,
} from "../utils/journeyRanking";
import { selectDirectJourneyOptions } from "../utils/directJourneyOptions";
import { directOptionMatchesActiveJourney } from "../utils/activeJourney";
import styles from "./NearbyStops.module.css";
import { stopLabel } from "../utils/stopNames";
import StopName from "./StopName";
import JourneyOptions from "./JourneyOptions";
import TransferJourneyOptions from "./TransferJourneyOptions";
import { recentPosition, rememberPosition } from "../utils/sessionPosition";

// A fresh lazy component per attempt: React keeps a failed import's
// rejection, so the one that failed would fail again on every reopen.
const lazyStopRadar = () => lazy(() => import("./StopRadar"));
const RADAR_ICON = "◉";

// The radar loads on demand. Offline before it was cached, or after a
// deploy removed the file a long-open page asks for, the failed load reached
// the app-wide boundary and replaced everything, a ride in progress
// included. It now fails here, inside the radar's own place.
class RadarLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className={styles.error} role="alert">
        {t("Stop radar couldn’t open. Check your connection, then try again.")}
      </p>
    );
  }
}

const NEARBY_STOP_LIMIT = 6;
const EXPANDED_NEARBY_STOP_LIMIT = 12;

// Options that trade something off. The next bus, or the one before, is
// always there to add: it says nothing about whether stops farther away
// would give a real alternative.
function tradeOffCount(options) {
  return options.filter(
    (option) => !["next-bus", "earlier-bus"].includes(option.label)
  ).length;
}

function shownDestinationLabel(destination) {
  if (!destination) return "";
  return destination.kind === "saved-place"
    ? t(destination.label)
    : destination.label;
}

function fitStatusText(fit, destinationLabel, isBest) {
  if (!fit) {
    return t("Checking which buses go to {destination}…", {
      destination: destinationLabel,
    });
  }

  if (fit.status === "good") {
    return isBest
      ? t("Best for {destination}", { destination: destinationLabel })
      : t("Goes to {destination}", { destination: destinationLabel });
  }
  if (fit.status === "tight") return t("Timing may be tight");
  if (fit.status === "too-late") return t("Probably too late to catch");
  if (fit.status === "other-direction") {
    return t("Current buses go the other direction");
  }
  if (fit.status === "no-direct") {
    return t("No direct option to {destination} is shown soon", {
      destination: destinationLabel,
    });
  }
  if (fit.status === "unavailable") return t("Departure check unavailable");
  // "Route suitability is uncertain" said neither which part was unknown
  // nor what to do: either a bus goes there and there is no telling whether
  // the passenger reaches it in time, or its route could not be read.
  return fit.best
    ? t("Can’t tell if you’ll make it in time")
    : t("Couldn’t check where these buses go");
}

function NearbyStopCard({
  stop,
  isActive,
  isNearest,
  isBest,
  online,
  onSelect,
  destinationLabel,
  fit,
}) {
  const directionsUrl = online ? buildWalkingDirectionsUrl(stop) : "";
  const fitText = destinationLabel
    ? fitStatusText(fit, destinationLabel, isBest)
    : "";

  return (
    <article
      className={styles.stopCard}
      data-active={isActive ? "true" : "false"}
      data-best={isBest ? "true" : undefined}
    >
      <button
        type="button"
        className={styles.stopButton}
        onClick={() => onSelect(stop.id)}
        aria-label={t("{name}, stop {id}, {distance} away", {
          name: stopLabel(stop),
          id: stop.id,
          distance: formatDistance(stop.distanceMeters),
        })}
      >
        <span className={styles.stopText}>
          <strong><StopName stop={stop} /></strong>
          <span>
            {t("Stop {id}", { id: stop.id })} ·{" "}
            {formatDistance(stop.distanceMeters)}
          </span>

          {destinationLabel && (
            <span
              className={styles.fitStatus}
              data-good={
                isBest || fit?.status === "good" ? "true" : undefined
              }
            >
              {fitText}
            </span>
          )}

          {fit?.best && (
            <span className={styles.fitJourney}>
              <strong>
                {t("Line {line}", { line: fit.best.lineRef || "—" })} ·{" "}
                {formatDue(fit.best.departureAt)}
              </strong>
              {Number.isFinite(fit.best.destinationArrivalAt) && (
                <>
                  {" · "}
                  {t("arrive about {time}", {
                    time: formatClock(fit.best.destinationArrivalAt),
                  })}
                </>
              )}
            </span>
          )}
        </span>

        <span className={styles.badges}>
          {isBest && <span className={styles.bestBadge}>{t("Best")}</span>}
          {isNearest && (
            <span className={styles.nearestBadge}>{t("Nearest")}</span>
          )}
        </span>
      </button>

      {directionsUrl && (
        <a
          className={styles.walkLink}
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={t("Walk there: {name}, stop {id}, in Google Maps", {
            name: stopLabel(stop),
            id: stop.id,
          })}
        >
          <span aria-hidden="true">↗</span>
          {t("Walk there")}
        </a>
      )}
    </article>
  );
}

function NearbyStops({
  stops,
  coordinatesStatus,
  activeStopId,
  serviceBoundary = null,
  online = true,
  searchEdits = () => 0,
  destination = null,
  timeConstraint = null,
  timeValid = true,
  routingPreference = "balanced",
  excludedJourney = null,
  onSelectJourney = null,
  onSelectTransferJourney = null,
  onSelect,
  // The radar's "Open target stop" takes its own button away; the page
  // passes where focus goes then (the board's heading).
  onOpenStop = onSelect,
}) {
  useLanguage();
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(null);
  const [sortMode, setSortMode] = useState("best");
  const [error, setError] = useState("");
  const [expandedDestinationId, setExpandedDestinationId] = useState("");
  const [radarOpen, setRadarOpen] = useState(false);
  const [StopRadar, setStopRadar] = useState(lazyStopRadar);
  const [compassPermission, setCompassPermission] = useState("pending");
  const rankingRef = useRef({ destinationId: "", order: [] });
  const radarButtonRef = useRef(null);
  const restoreRadarFocusRef = useRef(false);
  const radarSeededPositionRef = useRef(false);
  const radarLatestPositionRef = useRef(null);

  const activeStopIdRef = useRef(activeStopId);
  activeStopIdRef.current = activeStopId;

  // If another explicit action in this tab already obtained a fresh, accurate
  // fix (for example “Nearest to me first” in destination search), reuse it
  // rather than asking for location twice. Never request location here and
  // never reuse an inaccurate fix as a silent journey origin.
  useEffect(() => {
    if (!destination || activeStopId || position) return;
    const remembered = recentPosition();
    if (
      !remembered ||
      !Number.isFinite(remembered.accuracy) ||
      remembered.accuracy > AUTO_SELECT_MAX_ACCURACY_METERS
    ) {
      return;
    }
    setPosition(remembered);
    setStatus("success");
  }, [activeStopId, destination, position]);

  const hasStopCoordinates = stops.some(hasCoordinates);
  const geolocationSupported =
    typeof navigator !== "undefined" && "geolocation" in navigator;
  const liveRadarSupported =
    geolocationSupported &&
    typeof navigator.geolocation?.watchPosition === "function";

  const stopsById = useMemo(
    () => new Map(stops.map((stop) => [String(stop.id), stop])),
    [stops]
  );
  const activeOriginStop =
    destination && activeStopId
      ? stopsById.get(String(activeStopId)) || null
      : null;

  // Reuse only a location the passenger already asked the app to use, and
  // only while its accuracy is still good enough for our conservative
  // auto-origin threshold. This avoids a second permission prompt after
  // "Nearest to me first" without turning an approximate fix into a claim
  // about where the passenger is.
  useEffect(() => {
    if (!destination || activeOriginStop || position) return;
    const remembered = recentPosition();
    if (
      !remembered ||
      !Number.isFinite(remembered.accuracy) ||
      remembered.accuracy > AUTO_SELECT_MAX_ACCURACY_METERS
    ) {
      return;
    }
    setPosition(remembered);
    setStatus("success");
    setError("");
  }, [activeOriginStop, destination, position]);

  // A stop-first journey already has an explicit origin. Use that stop's
  // coordinates directly; it is not presented as a GPS fix.
  const planningOrigin = hasCoordinates(activeOriginStop)
    ? activeOriginStop
    : position;
  const planningAccuracy = activeOriginStop
    ? 0
    : position?.accuracy ?? null;
  const baseNearbyStops = useMemo(
    () => findNearestStops(stops, planningOrigin, NEARBY_STOP_LIMIT),
    [planningOrigin, stops]
  );

  const expandedNearbyStops = useMemo(
    () => findNearestStops(stops, planningOrigin, EXPANDED_NEARBY_STOP_LIMIT),
    [planningOrigin, stops]
  );
  const searchExpanded =
    Boolean(destination?.id) && expandedDestinationId === destination.id;
  const nearbyStops =
    destination && searchExpanded
      ? expandedNearbyStops
      : baseNearbyStops;

  const { fitsByStop, state: fitState } = useDestinationAwareNearby({
    stops: nearbyStops,
    destination,
    positionAccuracy: planningAccuracy,
    timeConstraint,
  });

  const destinationLabel = shownDestinationLabel(destination);

  const baseDirectJourneyOptions = useMemo(() => {
    if (!destination || fitState !== "ready" || searchExpanded) return [];

    const options = selectDirectJourneyOptions({
      stops: baseNearbyStops,
      fitsByStop,
      timeConstraint,
      preference: routingPreference,
    });
    return excludedJourney
      ? options.filter(
          (option) =>
            !directOptionMatchesActiveJourney(option, excludedJourney)
        )
      : options;
  }, [
    baseNearbyStops,
    destination,
    excludedJourney,
    fitState,
    fitsByStop,
    routingPreference,
    searchExpanded,
    timeConstraint,
  ]);

  const baseTradeOffs = tradeOffCount(baseDirectJourneyOptions);
  useEffect(() => {
    if (
      !destination ||
      !planningOrigin ||
      searchExpanded ||
      fitState !== "ready" ||
      expandedNearbyStops.length <= baseNearbyStops.length ||
      baseTradeOffs >= 2
    ) {
      return;
    }

    setExpandedDestinationId(destination.id);
  }, [
    baseTradeOffs,
    baseNearbyStops.length,
    destination,
    expandedNearbyStops.length,
    fitState,
    planningOrigin,
    searchExpanded,
  ]);

  const directJourneyOptions = useMemo(() => {
    if (!destination || fitState !== "ready") return [];

    const options = selectDirectJourneyOptions({
      stops: nearbyStops,
      fitsByStop,
      timeConstraint,
      preference: routingPreference,
    });
    return excludedJourney
      ? options.filter(
          (option) =>
            !directOptionMatchesActiveJourney(option, excludedJourney)
        )
      : options;
  }, [
    destination,
    excludedJourney,
    fitState,
    fitsByStop,
    routingPreference,
    nearbyStops,
    timeConstraint,
  ]);

  // With one direct bus or none, a change of bus can still be a choice:
  // the passenger who misses the only bus needs another way.
  const directSearchComplete =
    Boolean(destination) &&
    Boolean(planningOrigin) &&
    fitState === "ready" &&
    directJourneyOptions.length < 2 &&
    (searchExpanded || expandedNearbyStops.length <= baseNearbyStops.length);

  const preferenceWantsAlternatives = ["less-walking", "more-buffer"].includes(
    String(routingPreference || "")
  );
  const shouldSearchTransfers =
    Boolean(onSelectTransferJourney) &&
    Boolean(destination) &&
    Boolean(planningOrigin) &&
    timeValid &&
    (directSearchComplete || preferenceWantsAlternatives);

  const { options: foundTransferOptions, state: transferState } =
    useTransferJourneyOptions({
      enabled: shouldSearchTransfers,
      originStops: nearbyStops,
      allStops: stops,
      destination,
      positionAccuracy: planningAccuracy,
      timeConstraint,
      routingPreference,
    });
  // Beside the one direct bus, a change is worth showing when it gets there
  // sooner or leaves after it. Leaving before it and arriving after it, a
  // change is worse in every way.
  const onlyDirect =
    directJourneyOptions.length === 1 ? directJourneyOptions[0].departure : null;
  const transferJourneyOptions = onlyDirect
    ? foundTransferOptions.filter(
        (option) =>
          Number(option.journeyArrivalAt) <
            Number(onlyDirect.journeyArrivalAt ?? onlyDirect.destinationArrivalAt) ||
          Number(option.legs?.[0]?.departureAt) > Number(onlyDirect.departureAt)
      )
    : foundTransferOptions;

  const destinationSortedStops = useMemo(() => {
    const previousOrder =
      rankingRef.current.destinationId === destination?.id
        ? rankingRef.current.order
        : [];
    return rankDestinationStops(nearbyStops, fitsByStop, previousOrder);
  }, [destination?.id, fitsByStop, nearbyStops]);

  useEffect(() => {
    rankingRef.current = {
      destinationId: destination?.id || "",
      order: destinationSortedStops.map((stop) => stop.id),
    };
  }, [destination?.id, destinationSortedStops]);

  const visibleStops =
    destination && sortMode === "best"
      ? destinationSortedStops
      : nearbyStops;

  const bestStopId =
    destinationSortedStops.find((stop) =>
      ["good", "tight"].includes(fitsByStop[stop.id]?.status)
    )?.id || "";
  const betterNearbyStop =
    activeOriginStop &&
    bestStopId &&
    bestStopId !== activeStopId &&
    materiallyBetterDestinationFit(
      fitsByStop[activeStopId],
      fitsByStop[bestStopId]
    )
      ? stopsById.get(String(bestStopId)) || null
      : null;

  const activeStopHasCoordinates = stops.some(
    (stop) => stop.id === activeStopId && hasCoordinates(stop)
  );
  const recommendedRadarTargetId = activeOriginStop
    ? activeStopId
    : bestStopId;
  const initialRadarTargetId =
    recommendedRadarTargetId ||
    (activeStopHasCoordinates ? activeStopId : "");

  const openRadar = () => {
    if (!hasStopCoordinates || !liveRadarSupported) return;
    restoreRadarFocusRef.current = false;
    radarSeededPositionRef.current = false;
    radarLatestPositionRef.current = null;
    setRadarOpen(true);
    void requestCompassPermission().then(setCompassPermission);
  };

  // While the radar runs, the stops below keep its first fix (planning is
  // not restarted by every step), and are hidden: they said "Selected stop
  // ≈ 440 m away" under a radar showing 40 m. Closing it brings them back
  // from where the passenger has walked to, once.
  const leaveRadar = (restoreFocus) => {
    const latest = radarLatestPositionRef.current;
    if (latest) {
      setPosition(latest);
      rememberPosition(latest);
    }
    restoreRadarFocusRef.current = restoreFocus;
    setRadarOpen(false);
  };

  const closeRadar = () => leaveRadar(true);

  useEffect(() => {
    if (radarOpen || !restoreRadarFocusRef.current) return;
    restoreRadarFocusRef.current = false;
    radarButtonRef.current?.focus();
  }, [radarOpen]);

  const selectedStop = useMemo(() => {
    if (!position) return null;

    const activeStop = stops.find(
      (stop) => stop.id === activeStopId && hasCoordinates(stop)
    );
    if (!activeStop) return null;

    const distance = distanceInMeters(position, {
      lat: activeStop.lat,
      lon: activeStop.lon,
    });
    return Number.isFinite(distance) ? { stop: activeStop, distance } : null;
  }, [activeStopId, position, stops]);

  const locate = async () => {
    if (!geolocationSupported) {
      setStatus("error");
      setError(msg("This browser does not support location access."));
      return;
    }

    if (!hasStopCoordinates) {
      setStatus("error");
      setError(
        coordinatesStatus === "loading"
          ? msg("Nearby-stop data is still loading. Try again in a moment.")
          : msg(
              "Stop locations are temporarily unavailable. Search for your stop by name, and try again later."
            )
      );
      return;
    }

    setStatus("locating");
    setError("");
    setExpandedDestinationId("");
    const stopIdAtTap = activeStopIdRef.current;
    const searchEditsAtTap = searchEdits();

    try {
      const nextPosition = await requestOneTimePosition(
        navigator.geolocation
      );

      const nearest = findNearestStops(stops, nextPosition, NEARBY_STOP_LIMIT);
      const ambiguousChoice = nearestChoiceIsAmbiguous(
        nearest,
        nextPosition.accuracy
      );
      const insideServiceArea = isInsideMultiPolygon(
        nextPosition,
        serviceBoundary
      );

      setPosition(nextPosition);
      rememberPosition(nextPosition);
      setStatus("success");

      const closest = nearest[0];
      const accurateEnough =
        Number.isFinite(nextPosition.accuracy) &&
        nextPosition.accuracy <= AUTO_SELECT_MAX_ACCURACY_METERS;

      // Without a destination, preserve the old fast path. Once a passenger
      // has said where they want to go, proximity alone is not enough evidence
      // to choose a platform for them.
      if (
        !destination &&
        closest &&
        accurateEnough &&
        insideServiceArea !== false &&
        !ambiguousChoice &&
        closest.distanceMeters <= AUTO_SELECT_MAX_DISTANCE_METERS &&
        activeStopIdRef.current === stopIdAtTap &&
        searchEdits() === searchEditsAtTap &&
        closest.id !== activeStopIdRef.current
      ) {
        onSelect(closest.id);
      }
    } catch (locationError) {
      setStatus("error");
      setError(locationErrorMessage(locationError));
    }
  };

  const insideServiceArea = position
    ? isInsideMultiPolygon(position, serviceBoundary)
    : null;
  const nearestDistance = nearbyStops[0]?.distanceMeters;
  const isFarFromNetwork =
    nearestDistance > OUTSIDE_NETWORK_WARNING_METERS;
  const isBeyondAutoSelectRange =
    nearestDistance > AUTO_SELECT_MAX_DISTANCE_METERS &&
    !isFarFromNetwork;
  const lowAccuracy =
    Boolean(position) &&
    (!Number.isFinite(position?.accuracy) ||
      position.accuracy > AUTO_SELECT_MAX_ACCURACY_METERS);
  const ambiguousChoice =
    position &&
    !lowAccuracy &&
    !isFarFromNetwork &&
    nearestChoiceIsAmbiguous(nearbyStops, position.accuracy);
  const locationDataLoading =
    coordinatesStatus === "loading" && !hasStopCoordinates;
  const needsOriginDecision =
    Boolean(destination) &&
    !activeOriginStop &&
    (!position ||
      lowAccuracy ||
      insideServiceArea === false ||
      isFarFromNetwork);

  let locationNotice = "";
  if (!activeOriginStop && lowAccuracy) {
    locationNotice = t(
      "Your location is approximate, so compare the nearby options before choosing."
    );
  } else if (!activeOriginStop && insideServiceArea === false) {
    locationNotice = t(
      "Your location appears outside Föli’s published service area. Nearby stops are shown for reference, but none was selected automatically."
    );
  } else if (isFarFromNetwork) {
    locationNotice = t(
      "The nearest Föli stop is {distance} away. You may be outside the Föli service area.",
      { distance: formatDistance(nearbyStops[0].distanceMeters) }
    );
  } else if (isBeyondAutoSelectRange) {
    locationNotice = t(
      "The nearest Föli stop is {distance} away, so it was not selected automatically. Choose the stop that fits your journey.",
      { distance: formatDistance(nearbyStops[0].distanceMeters) }
    );
  } else if (ambiguousChoice && !destination) {
    locationNotice = t(
      "Two stops are almost equally close. Choose the stop that serves your travel direction."
    );
  }

  const hasJourneyChoices =
    Boolean(destination) &&
    (directJourneyOptions.length > 0 || transferJourneyOptions.length > 0);

  const stopComparison = (
    <>
      {destination && (
        <div
          className={styles.sortToggle}
          role="group"
          aria-label={t("Nearby stop sorting")}
        >
          <button
            type="button"
            aria-pressed={sortMode === "best"}
            onClick={() => setSortMode("best")}
          >
            {t("Best for {destination}", {
              destination: destinationLabel,
            })}
          </button>
          <button
            type="button"
            aria-pressed={sortMode === "nearest"}
            onClick={() => setSortMode("nearest")}
          >
            {t("Nearest")}
          </button>
        </div>
      )}

      {nearbyStops.length > 0 && (
        <div
          className={styles.stopGrid}
          role="group"
          aria-label={
            destination
              ? t("Nearby Föli stops for {destination}", {
                  destination: destinationLabel,
                })
              : t("Nearest Föli stops")
          }
        >
          {visibleStops.map((stop) => (
            <NearbyStopCard
              key={stop.id}
              stop={stop}
              isNearest={stop.id === nearbyStops[0]?.id}
              isBest={
                Boolean(destination) &&
                sortMode === "best" &&
                stop.id === bestStopId
              }
              isActive={stop.id === activeStopId}
              online={online}
              onSelect={onSelect}
              destinationLabel={destinationLabel}
              fit={fitsByStop[stop.id]}
            />
          ))}
        </div>
      )}

      <p className={styles.disclaimer}>
        {online
          ? t(
              "Distances are approximate straight-line distances. “Walk there” opens an external walking route in Google Maps."
            )
          : t(
              "Distances are approximate straight-line distances. Walking route links return when you’re online."
            )}
      </p>
    </>
  );

  return (
    <section className={styles.wrapper} aria-labelledby="nearby-stops-title">
      <div className={styles.header}>
        <div>
          <h2 id="nearby-stops-title" className={styles.heading} tabIndex={-1}>
            {destination && !needsOriginDecision
              ? t("Nearby stops for {destination}", {
                  destination: destinationLabel,
                })
              : t("Near you")}
          </h2>
          <p className={styles.description}>
            {destination && planningOrigin
              ? t("Tap a stop to see when its buses leave.")
              : t("Uses your location once. It isn’t saved.")}{" "}
            <span id="stop-radar-hint">
              {t("The radar shows the way to a stop as you walk.")}
            </span>
          </p>
        </div>

        <div className={styles.headerActions}>
          {!activeOriginStop && (
            <button
              type="button"
              className={styles.locateButton}
              onClick={() => {
                if (status !== "locating" && hasStopCoordinates) locate();
              }}
              aria-disabled={
                status === "locating" || !hasStopCoordinates ? "true" : undefined
              }
              aria-busy={status === "locating"}
            >
              <span aria-hidden="true">{status === "locating" ? "…" : "⌖"}</span>
              {status === "locating"
                ? t("Locating…")
                : position
                  ? t("Update location")
                  : destination
                    ? t("Use my location")
                    : t("Find nearest stop")}
            </button>
          )}

          {needsOriginDecision && !radarOpen && (
            <button
              type="button"
              className={styles.locateButton}
              onClick={() => document.getElementById("stop-search")?.focus()}
            >
              {t("Choose a starting stop")}
            </button>
          )}

          <button
            ref={radarButtonRef}
            type="button"
            className={styles.radarButton}
            onClick={radarOpen ? closeRadar : openRadar}
            aria-expanded={radarOpen}
            aria-controls="stop-radar-panel"
            aria-describedby="stop-radar-hint"
            aria-disabled={
              !hasStopCoordinates || !liveRadarSupported ? "true" : undefined
            }
          >
            <span aria-hidden="true">{RADAR_ICON}</span>
            {radarOpen ? t("Close stop radar") : t("Open stop radar")}
          </button>
        </div>
      </div>

      {!hasStopCoordinates && (
        <p className={styles.meta} role="status">
          {locationDataLoading
            ? t("Getting stop locations…")
            : t(
                "Location search is temporarily unavailable; stop search still works normally."
              )}
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}

      {!liveRadarSupported && hasStopCoordinates && (
        <p className={styles.meta}>
          {t("Live stop radar is not available on this device; one-time nearby search still works.")}
        </p>
      )}

      {radarOpen && (
        <RadarLoadBoundary onFailed={() => setStopRadar(lazyStopRadar)}>
          <Suspense
            fallback={
              <p className={styles.meta} role="status">
                {t("Opening stop radar…")}
              </p>
            }
          >
            <StopRadar
              stops={stops}
              initialTargetStopId={initialRadarTargetId}
              recommendedTargetStopId={recommendedRadarTargetId}
              activeStopId={activeStopId}
              compassPermission={compassPermission}
              onPosition={(nextPosition) => {
                // Seed Nearby from one fresh fix per radar session, then keep
                // subsequent live fixes isolated inside StopRadar. Otherwise
                // every walking update can perturb stop order/accuracy and
                // restart destination-aware Föli planning.
                radarLatestPositionRef.current = nextPosition;
                if (radarSeededPositionRef.current) return;
                radarSeededPositionRef.current = true;
                setPosition(nextPosition);
                rememberPosition(nextPosition);
                setStatus("success");
                setError("");
              }}
              onOpenStop={(id) => {
                leaveRadar(false);
                onOpenStop(id);
              }}
              onClose={closeRadar}
            />
          </Suspense>
        </RadarLoadBoundary>
      )}

      {planningOrigin && !radarOpen && (
        <>
          {/* What the fix found, in a passenger's words. "One-time location
              only" repeated the line above the button, and "Selected stop ≈
              <10 m away" left the passenger to work out which stop that was. */}
          {((position && !activeOriginStop) ||
            (destination && fitState === "loading") ||
            (destination && searchExpanded && fitState === "ready")) && (
            <div className={styles.meta} role="status" aria-live="polite">
              {position && !activeOriginStop && (
                <span>
                  {position.accuracy !== null
                    ? t("Location found · ±{accuracy}", {
                        accuracy: formatAccuracy(position.accuracy),
                      })
                    : t("Location found")}
                </span>
              )}
              {selectedStop && !activeOriginStop && (
                <span>
                  {t("{stop} is {distance} away", {
                    stop: stopLabel(selectedStop.stop),
                    distance: formatDistance(selectedStop.distance),
                  })}
                </span>
              )}
              {destination && fitState === "loading" && !searchExpanded && (
                <span>{t("Checking routes…")}</span>
              )}
              {destination && searchExpanded && fitState === "loading" && (
                <span>{t("Checking a little farther…")}</span>
              )}
              {destination && searchExpanded && fitState === "ready" && (
                <span>
                  {t("Checked {count} nearby stops", {
                    count: nearbyStops.length,
                  })}
                </span>
              )}
            </div>
          )}

          {locationNotice && (
            <p className={styles.notice}>{locationNotice}</p>
          )}

          {betterNearbyStop && (
            <div className={styles.notice} role="status">
              <span>
                {t("A nearby stop has a meaningfully better option to {destination}.", {
                  destination: destinationLabel,
                })}
              </span>{" "}
              <button
                type="button"
                className={styles.locateButton}
                onClick={() => onSelect(betterNearbyStop.id)}
              >
                {t("Open {stop}", { stop: stopLabel(betterNearbyStop) })}
              </button>
            </div>
          )}

          {destination && directJourneyOptions.length > 0 && (
            <JourneyOptions
              options={directJourneyOptions}
              destinationLabel={destinationLabel}
              stopsById={stopsById}
              access={!activeOriginStop}
              onSelectJourney={
                onSelectJourney
                  ? (option) =>
                      onSelectJourney({
                        ...option,
                        positionAccuracyM: activeOriginStop
                          ? null
                          : position?.accuracy ?? null,
                      })
                  : null
              }
              onOpenStop={onSelect}
            />
          )}

          {destination &&
            shouldSearchTransfers &&
            transferState === "loading" && (
              <p className={styles.notice} role="status">
                {directJourneyOptions.length > 0
                  ? t("Also checking options with a change of bus…")
                  : t("No direct trip found nearby. Checking options with up to two transfers…")}
              </p>
            )}

          {destination &&
            shouldSearchTransfers &&
            transferState === "ready" &&
            transferJourneyOptions.length > 0 && (
              <TransferJourneyOptions
                options={transferJourneyOptions}
                destinationLabel={destinationLabel}
                access={!activeOriginStop}
                onSelectJourney={onSelectTransferJourney}
              />
            )}

          {destination &&
            shouldSearchTransfers &&
            transferState === "ready" &&
            transferJourneyOptions.length === 0 &&
            directJourneyOptions.length === 0 && (
              <p className={styles.notice} role="status">
                {t("No reliable option with up to two transfers was found from the nearby stops.")}
              </p>
            )}

          {/* Beside the direct bus it went looking past, a failed search for
              a change of bus is no news; asked for, or the only way, it is. */}
          {destination &&
            shouldSearchTransfers &&
            transferState === "error" &&
            (directJourneyOptions.length === 0 ||
              preferenceWantsAlternatives) && (
              <p className={styles.notice} role="status">
                {t("Transfer search is temporarily unavailable. Nearby stops remain available.")}
              </p>
            )}

          {destination && hasJourneyChoices ? (
            <details>
              <summary>{t("Compare nearby stops")}</summary>
              {stopComparison}
            </details>
          ) : (
            stopComparison
          )}
        </>
      )}
    </section>
  );
}

export default NearbyStops;
