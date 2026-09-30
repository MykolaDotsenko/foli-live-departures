import { useEffect, useMemo, useRef, useState } from "react";
import { msg, t, useLanguage } from "../i18n";
import useDestinationAwareNearby from "../hooks/useDestinationAwareNearby";
import {
  distanceInMeters,
  findNearestStops,
  formatAccuracy,
  formatDistance,
  hasCoordinates,
  isInsideMultiPolygon,
} from "../utils/geo";
import { locationErrorMessage, requestOneTimePosition } from "../utils/location";
import { buildWalkingDirectionsUrl } from "../utils/maps";
import {
  AUTO_SELECT_MAX_ACCURACY_METERS,
  AUTO_SELECT_MAX_DISTANCE_METERS,
  OUTSIDE_NETWORK_WARNING_METERS,
  nearestChoiceIsAmbiguous,
} from "../utils/nearestStop";
import { formatClock, formatDue } from "../utils/time";
import { rankDestinationStops } from "../utils/journeyRanking";
import styles from "./NearbyStops.module.css";
import { stopLabel } from "../utils/stopNames";
import StopName from "./StopName";

const NEARBY_STOP_LIMIT = 6;

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
  return t("Route suitability is uncertain");
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
  onSelect,
}) {
  useLanguage();
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(null);
  const [sortMode, setSortMode] = useState("best");
  const [error, setError] = useState("");
  const rankingRef = useRef({ destinationId: "", order: [] });

  const activeStopIdRef = useRef(activeStopId);
  activeStopIdRef.current = activeStopId;

  const hasStopCoordinates = stops.some(hasCoordinates);
  const geolocationSupported =
    typeof navigator !== "undefined" && "geolocation" in navigator;

  const nearbyStops = useMemo(
    () => findNearestStops(stops, position, NEARBY_STOP_LIMIT),
    [position, stops]
  );

  const { fitsByStop, state: fitState } = useDestinationAwareNearby({
    stops: nearbyStops,
    destination,
    positionAccuracy: position?.accuracy ?? null,
  });

  const destinationLabel = shownDestinationLabel(destination);
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

  const selectedStopDistance = useMemo(() => {
    if (!position) return null;

    const activeStop = stops.find(
      (stop) => stop.id === activeStopId && hasCoordinates(stop)
    );
    if (!activeStop) return null;

    return distanceInMeters(position, {
      lat: activeStop.lat,
      lon: activeStop.lon,
    });
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

  let locationNotice = "";
  if (lowAccuracy) {
    locationNotice = t(
      "Your location is approximate, so compare the nearby options before choosing."
    );
  } else if (insideServiceArea === false) {
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

  return (
    <section className={styles.wrapper} aria-labelledby="nearby-stops-title">
      <div className={styles.header}>
        <div>
          <h2 id="nearby-stops-title" className={styles.heading}>
            {destination
              ? t("Nearby stops for {destination}", {
                  destination: destinationLabel,
                })
              : t("Near you")}
          </h2>
          <p className={styles.description}>
            {destination
              ? t("Choose the best fit or switch back to pure distance.")
              : t("Uses your location once. It isn’t saved.")}
          </p>
        </div>

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
              : t("Find nearest stop")}
        </button>
      </div>

      {destination && position && (
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
            {t("Best for {destination}", { destination: destinationLabel })}
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

      {position && (
        <>
          <div className={styles.meta} role="status" aria-live="polite">
            <span>{t("One-time location only")}</span>
            {position.accuracy !== null && (
              <span>
                {t("Accuracy ±{accuracy}", {
                  accuracy: formatAccuracy(position.accuracy),
                })}
              </span>
            )}
            {Number.isFinite(selectedStopDistance) && (
              <span>
                {t("Selected stop ≈ {distance} away", {
                  distance: formatDistance(selectedStopDistance),
                })}
              </span>
            )}
            {destination && fitState === "loading" && (
              <span>{t("Checking routes…")}</span>
            )}
          </div>

          {locationNotice && (
            <p className={styles.notice}>{locationNotice}</p>
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
      )}
    </section>
  );
}

export default NearbyStops;
