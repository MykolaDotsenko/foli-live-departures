import { Fragment, useMemo, useRef, useState } from "react";
import { t, useLanguage } from "../i18n";
import {
  findNearestStops,
  formatDistance,
  hasCoordinates,
  isInsideMultiPolygon,
} from "../utils/geo";
import { locationErrorMessage, requestOneTimePosition } from "../utils/location";
import { PLACE_PRESETS } from "../hooks/useSavedPlaces";
import usePendingFocus from "../hooks/usePendingFocus";
import styles from "./MyPlaces.module.css";
import EmptyPlaceCard from "./places/EmptyPlaceCard";
import PlaceCard from "./places/PlaceCard";
import { isAccurateFix, MAX_SETUP_DISTANCE_METERS } from "./places/placeSetup";
import SetupPlace from "./places/SetupPlace";
import SharedPlaceImport from "./places/SharedPlaceImport";

// On a phone a card folds down to its summary button and the buttons
// inside are hidden, so "visible" is asked of the browser. Where it cannot
// say (no layout), nothing counts as visible and the caller falls back.
function isShown(element) {
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : element.getClientRects().length > 0;
}

function cardControls(grid, placeId) {
  const card = grid?.querySelector(`[data-place="${placeId}"]`);
  return card
    ? [...card.querySelectorAll("a[href], button:not(:disabled)")]
    : [];
}

function MyPlaces({
  stops,
  coordinatesStatus,
  activeStopId,
  placesById,
  sharedPlace,
  serviceBoundary = null,
  online = true,
  onSavePlace,
  onImportSharedPlace,
  onDismissSharedPlace,
  onRemovePlace,
  onSetPrimaryStop,
  onOpenStop,
}) {
  useLanguage();
  const [setupId, setSetupId] = useState("");
  const [setupCandidates, setSetupCandidates] = useState([]);
  const [setupAccuracy, setSetupAccuracy] = useState(null);
  const [setupPreselectFirst, setSetupPreselectFirst] = useState(false);
  const [status, setStatus] = useState("idle");
  // One location lookup at a time. A double tap on "Replace using where I
  // am now" started two, and whichever answered last reopened the setup
  // over the one the passenger had begun. A ref, not the status, so a
  // second tap in the same frame is caught too.
  const lookupInFlightRef = useRef(false);
  // How to word the problem, not the words, so a language switch while it
  // shows rewords it.
  const [error, setError] = useState(null);
  const showError = (text) => setError({ text });
  // Opening the setup replaces an empty place's card, and closing it
  // brings the card back: both times the button pressed was taken away and
  // focus fell to the top of the page. The setup's heading takes focus as
  // it opens; on the way out focus goes back to the button that opened it,
  // or, when that has gone with its card, to the card's first control.
  const requestFocus = usePendingFocus();
  const gridRef = useRef(null);
  const setupOpenerRef = useRef(null);
  const focusSetupHeading = (placeId) => {
    setupOpenerRef.current = document.activeElement;
    requestFocus(() => document.getElementById(`setup-${placeId}-title`));
  };
  const focusPlaceCard = (placeId) => {
    const opener = setupOpenerRef.current;
    setupOpenerRef.current = null;
    requestFocus(() => {
      const openerStillThere =
        opener instanceof globalThis.HTMLElement &&
        opener.isConnected &&
        !opener.matches(":disabled") &&
        gridRef.current?.contains(opener);
      if (openerStillThere && isShown(opener)) return opener;
      const controls = cardControls(gridRef.current, placeId);
      return (
        controls.find(isShown) ||
        (openerStillThere ? opener : null) ||
        controls[0]
      );
    });
  };
  const closeSetup = () => {
    if (setupId) focusPlaceCard(setupId);
    setSetupId("");
    setSetupCandidates([]);
    setSetupAccuracy(null);
    setSetupPreselectFirst(false);
    setStatus("idle");
  };

  const hasStopCoordinates = useMemo(
    () => stops.some(hasCoordinates),
    [stops]
  );
  const activeStop = useMemo(
    () => stops.find((stop) => stop.id === activeStopId) || null,
    [activeStopId, stops]
  );

  const startSetup = async (placeId) => {
    const preset = PLACE_PRESETS.find((candidate) => candidate.id === placeId);
    if (!preset || lookupInFlightRef.current) return;

    if (!hasStopCoordinates) {
      showError(() =>
        coordinatesStatus === "loading"
          ? t("Stop locations are still loading. Try again in a moment.")
          : t("Stop locations are temporarily unavailable.")
      );
      return;
    }

    if (!navigator.geolocation) {
      showError(() => t("This browser does not support location access."));
      return;
    }

    setStatus("locating");
    setError(null);
    lookupInFlightRef.current = true;
    // Asked now, while focus is still on the button pressed: if the
    // passenger has gone elsewhere by the time the location answers, the
    // setup opens without pulling them back.
    focusSetupHeading(preset.id);

    try {
      const position = await requestOneTimePosition(navigator.geolocation);
      const insideServiceArea = isInsideMultiPolygon(
        position,
        serviceBoundary
      );

      const boundaryDecisionReliable = isAccurateFix(position.accuracy);

      if (insideServiceArea === false && boundaryDecisionReliable) {
        setStatus("idle");
        showError(() =>
          t(
            "This location appears outside Föli’s published service area. Choose a public stop manually instead."
          )
        );
        return;
      }

      const nearest = findNearestStops(stops, position, 3);

      if (nearest.length === 0) {
        throw new Error("No nearby stops found.");
      }

      const nearestMeters = nearest[0].distanceMeters;
      if (nearestMeters > MAX_SETUP_DISTANCE_METERS) {
        setStatus("idle");
        showError(() =>
          t(
            "The nearest Föli stop is {distance} away. Move closer to the place before saving it.",
            { distance: formatDistance(nearestMeters) }
          )
        );
        return;
      }

      setSetupId(preset.id);
      setSetupCandidates(nearest);
      setSetupAccuracy(position.accuracy);
      setSetupPreselectFirst(false);
      setStatus("ready");
    } catch (locationError) {
      setStatus("idle");
      showError(() => t(locationErrorMessage(locationError)));
    } finally {
      lookupInFlightRef.current = false;
    }
  };

  const startFromSelectedStop = (placeId) => {
    const preset = PLACE_PRESETS.find((candidate) => candidate.id === placeId);
    if (!preset || !activeStop) return;

    setError(null);
    focusSetupHeading(preset.id);
    setSetupId(preset.id);
    setSetupCandidates([{ id: activeStop.id, name: activeStop.name }]);
    setSetupAccuracy(null);
    setSetupPreselectFirst(true);
    setStatus("ready");
  };

  return (
    <section className={styles.wrapper} aria-labelledby="my-places-title">
      <div className={styles.header}>
        <div>
          <h2 id="my-places-title">{t("My Places")}</h2>
          <p className={styles.description}>
            {t(
              "Save the stop nearest Home, School or Work. No address needed."
            )}
          </p>
        </div>
      </div>

      {sharedPlace && (
        <SharedPlaceImport
          place={sharedPlace}
          replacing={placesById.has(sharedPlace.id)}
          onImport={onImportSharedPlace}
          onDismiss={onDismissSharedPlace}
        />
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error.text()}
        </p>
      )}

      <div className={styles.grid} ref={gridRef}>
        {PLACE_PRESETS.map((preset) => {
          const place = placesById.get(preset.id);
          // The form opens where its place is, instead of after Work with
          // the place's empty card repeating its heading and buttons.
          // Keyed by place, so a confirmation ticked for Home can never be
          // carried into School's setup as if it had been given for School.
          const setupForm =
            setupId === preset.id && setupCandidates.length > 0 ? (
              <SetupPlace
                key={`setup-${preset.id}`}
                preset={preset}
                candidates={setupCandidates}
                accuracy={setupAccuracy}
                preselectFirst={setupPreselectFirst}
                onCancel={closeSetup}
                onSave={(saved) => {
                  onSavePlace(saved);
                  closeSetup();
                }}
              />
            ) : null;

          if (place) {
            return (
              <Fragment key={preset.id}>
                <PlaceCard
                  place={place}
                  stops={stops}
                  online={online}
                  onOpenStop={onOpenStop}
                  onSetPrimaryStop={onSetPrimaryStop}
                  onReplace={startSetup}
                  locating={status === "locating"}
                  onRemove={onRemovePlace}
                />
                {setupForm}
              </Fragment>
            );
          }

          return (
            setupForm || (
              <EmptyPlaceCard
                key={preset.id}
                preset={preset}
                activeStop={activeStop}
                status={status}
                onStartSetup={startSetup}
                onStartFromSelectedStop={startFromSelectedStop}
              />
            )
          );
        })}
      </div>

      {status === "locating" && (
        <p className={styles.meta} role="status">
          {t("Finding the closest Föli stops…")}
        </p>
      )}

      {/* Said once, under all three: in each empty card it repeated the
          heading's promise three times over. "Use my location" finds the
          stops near the place, so what matters is being at the place, not
          at its stop; and the way round it names the button to press. */}
      {PLACE_PRESETS.some((preset) => !placesById.get(preset.id)) && (
        <p className={styles.meta}>
          {t(
            "Not at the place now? Search for its stop at the top of the page, then tap “Use …” above."
          )}
        </p>
      )}

      {/* True to the letter, "not where you are" misled: Google Maps then
          plans the route from where the phone is. Said once there is a
          route link to follow. */}
      {placesById.size > 0 && (
        <p className={styles.privacy}>
          {t(
            "Route links send Google Maps only the stop you’re going to. Google Maps may then use your location to plan the route."
          )}
        </p>
      )}
    </section>
  );
}

export default MyPlaces;
