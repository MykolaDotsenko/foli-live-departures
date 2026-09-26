import { Fragment, useMemo, useState } from "react";
import { msg, t, useLanguage } from "../i18n";
import {
  findNearestStops,
  formatAccuracy,
  formatDistance,
  hasCoordinates,
  isInsideMultiPolygon,
} from "../utils/geo";
import { locationErrorMessage, requestOneTimePosition } from "../utils/location";
import { buildTransitDirectionsUrl } from "../utils/maps";
import { buildSharedPlaceUrl } from "../utils/sharedPlaces";
import { PLACE_PRESETS, placeLabel } from "../hooks/useSavedPlaces";
import SafePlaceDriverCard from "./SafePlaceDriverCard";
import styles from "./MyPlaces.module.css";
import { stopLabel } from "../utils/stopNames";
import PlaceIcon from "./PlaceIcon";
import StopName from "./StopName";

const MAX_SETUP_DISTANCE_METERS = 10_000;
const AUTO_PRESELECT_MAX_DISTANCE_METERS = 2_000;
const LOW_ACCURACY_METERS = 250;

// Phrases that name a place are the place's own: Finnish puts the place in
// the case the sentence needs ("kotiin", "kodin", "koulun", "työpaikan"),
// which a label set into a shared phrase cannot take. Stop names are the
// ones never inflected (docs/LOCALIZATION.md).
const PLACE_PHRASES = {
  home: {
    go: msg("Get me Home"),
    choose: msg("Tick the stops you use to get Home, and mark one as the main stop."),
    rightStop: msg("Yes, this is the right stop for Home."),
    rightStops: msg("Yes, these are the right stops for Home."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at Home."
    ),
    open: msg("Open Home stop"),
    setupTitle: msg("Choose stops for Home"),
    locate: msg("Use my location to set up Home"),
    useStop: msg("Use {name} for Home"),
    manage: msg("Manage Home"),
    sharing: msg(
      "Sharing Home reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save Home"),
    add: msg("Add Home"),
    replace: msg("Replace Home"),
    addQuestion: msg("Add Home?"),
    replaceQuestion: msg("Replace Home?"),
    shareText: msg("Add Home to My Places"),
  },
  school: {
    go: msg("Go to School"),
    choose: msg("Tick the stops you use to get to School, and mark one as the main stop."),
    rightStop: msg("Yes, this is the right stop for School."),
    rightStops: msg("Yes, these are the right stops for School."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at School."
    ),
    open: msg("Open School stop"),
    setupTitle: msg("Choose stops for School"),
    locate: msg("Use my location to set up School"),
    useStop: msg("Use {name} for School"),
    manage: msg("Manage School"),
    sharing: msg(
      "Sharing School reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save School"),
    add: msg("Add School"),
    replace: msg("Replace School"),
    addQuestion: msg("Add School?"),
    replaceQuestion: msg("Replace School?"),
    shareText: msg("Add School to My Places"),
  },
  work: {
    go: msg("Go to Work"),
    choose: msg("Tick the stops you use to get to Work, and mark one as the main stop."),
    rightStop: msg("Yes, this is the right stop for Work."),
    rightStops: msg("Yes, these are the right stops for Work."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at Work."
    ),
    open: msg("Open Work stop"),
    setupTitle: msg("Choose stops for Work"),
    locate: msg("Use my location to set up Work"),
    useStop: msg("Use {name} for Work"),
    manage: msg("Manage Work"),
    sharing: msg(
      "Sharing Work reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save Work"),
    add: msg("Add Work"),
    replace: msg("Replace Work"),
    addQuestion: msg("Add Work?"),
    replaceQuestion: msg("Replace Work?"),
    shareText: msg("Add Work to My Places"),
  },
};

function resolvePlaceStops(place, stops) {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));

  return place.stops.map((savedStop) => ({
    ...savedStop,
    ...(byId.get(savedStop.id) || {}),
  }));
}

function SetupPlace({
  preset,
  candidates,
  accuracy,
  preselectFirst = false,
  onCancel,
  onSave,
}) {
  const reliableLocation =
    Number.isFinite(accuracy) &&
    accuracy <= LOW_ACCURACY_METERS &&
    Number.isFinite(candidates[0]?.distanceMeters) &&
    candidates[0].distanceMeters <= AUTO_PRESELECT_MAX_DISTANCE_METERS;
  const shouldPreselectFirst = preselectFirst || reliableLocation;
  const [selectedIds, setSelectedIds] = useState(
    () =>
      new Set(shouldPreselectFirst && candidates[0] ? [candidates[0].id] : [])
  );
  const [primaryStopId, setPrimaryStopId] = useState(
    shouldPreselectFirst ? candidates[0]?.id || "" : ""
  );
  const [confirmedSafe, setConfirmedSafe] = useState(false);

  const toggleStop = (stopId) => {
    const next = new Set(selectedIds);
    setConfirmedSafe(false);

    if (next.has(stopId)) {
      next.delete(stopId);
      if (primaryStopId === stopId) {
        setPrimaryStopId(
          candidates.find(
            (candidate) => candidate.id !== stopId && next.has(candidate.id)
          )?.id || ""
        );
      }
    } else {
      next.add(stopId);
      if (!primaryStopId) setPrimaryStopId(stopId);
    }

    setSelectedIds(next);
  };

  const selectedStops = candidates.filter((stop) => selectedIds.has(stop.id));
  const phrases = PLACE_PHRASES[preset.id];
  // Plain words, and no "safe": a parent reads that as a promise about the
  // stop itself, which no app can make.
  const confirmationLabel = t(
    selectedStops.length === 1 ? phrases.rightStop : phrases.rightStops
  );

  return (
    <section
      className={styles.setup}
      aria-labelledby={`setup-${preset.id}-title`}
    >
      <div className={styles.setupHeader}>
        <div>
          <p className={styles.kicker}>{t("My Places")}</p>
          <h3 id={`setup-${preset.id}-title`}>
            {t(phrases.setupTitle)}
          </h3>
        </div>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>

      {/* One thing to do, then the list. The reasoning behind it read as a
          wall of text above the stops, so it waits behind "How this works";
          what is kept about the passenger stays in plain view. */}
      <p className={styles.helper}>
        {preselectFirst
          ? t(
              "Review the public stop you selected and confirm that it is suitable for this destination."
            )
          : t(phrases.choose)}
      </p>
      <details className={styles.setupDetails}>
        <summary>{t("How this works")}</summary>
        <p>
          {preselectFirst
            ? ""
            : `${t(
                "When location quality is good and a stop is reasonably close, the nearest stop is selected first. Otherwise you must choose manually."
              )} `}
          {t(phrases.backupAdvice)}
        </p>
      </details>
      <p className={styles.privacy}>
        {t(
          "Only public stop numbers and names are saved; your exact location is discarded."
        )}
      </p>

      <p className={styles.meta}>
        {preselectFirst
          ? t("Using the stop you selected manually")
          : Number.isFinite(accuracy)
            ? t("Location accuracy ±{accuracy}", {
                accuracy: formatAccuracy(accuracy),
              })
            : t("Location accuracy unavailable")}
        {!preselectFirst && !reliableLocation
          ? ` · ${t(
              "no stop was preselected — choose and confirm an arrival stop yourself"
            )}`
          : ""}
      </p>

      <div className={styles.candidateList}>
        {candidates.map((stop) => {
          const checked = selectedIds.has(stop.id);
          return (
            <div key={stop.id} className={styles.candidate}>
              <label className={styles.safeChoice}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStop(stop.id)}
                />
                <span>
                  <strong><StopName stop={stop} /></strong>
                  <small>
                    {t("Stop {id}", { id: stop.id })} ·{" "}
                    {formatDistance(stop.distanceMeters)}
                  </small>
                </span>
              </label>

              <label className={styles.primaryChoice}>
                <input
                  type="radio"
                  name={`primary-${preset.id}`}
                  checked={primaryStopId === stop.id}
                  disabled={!checked}
                  onChange={() => setPrimaryStopId(stop.id)}
                />
                {t("Main stop")}
              </label>
            </div>
          );
        })}
      </div>

      <label className={styles.confirmSafe}>
        <input
          type="checkbox"
          checked={confirmedSafe}
          onChange={(event) => setConfirmedSafe(event.target.checked)}
        />
        <span>{confirmationLabel}</span>
      </label>

      <div className={styles.setupActions}>
        {(selectedStops.length === 0 || !primaryStopId || !confirmedSafe) && (
          <p id={`setup-${preset.id}-needs`} className={styles.saveHint}>
            {selectedStops.length === 0
              ? t("Tick at least one stop to save.")
              : t("Confirm the stop above to save.")}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          aria-describedby={
            selectedStops.length === 0 || !primaryStopId || !confirmedSafe
              ? `setup-${preset.id}-needs`
              : undefined
          }
          disabled={
            selectedStops.length === 0 || !primaryStopId || !confirmedSafe
          }
          onClick={() =>
            onSave({
              id: preset.id,
              stops: selectedStops.map((stop) => ({
                id: stop.id,
                name: stop.name,
              })),
              primaryStopId,
            })
          }
        >
          {t(phrases.save)}
        </button>
      </div>
    </section>
  );
}

function journeyAction(place) {
  return t(PLACE_PHRASES[place.id].go);
}

function SharedPlaceImport({ place, replacing, onImport, onDismiss }) {
  const preset = PLACE_PRESETS.find((candidate) => candidate.id === place.id);
  if (!preset) return null;

  const phrases = PLACE_PHRASES[preset.id];

  return (
    <section
      className={styles.importCard}
      aria-labelledby="shared-place-title"
    >
      <p className={styles.kicker}>{t("Shared place")}</p>
      <h3 id="shared-place-title">
        {replacing ? t(phrases.replaceQuestion) : t(phrases.addQuestion)}
      </h3>
      {/* What is being added comes first; the warning a passenger acts on
          follows it, in one sentence each. */}
      <div className={styles.importStops}>
        {place.stops.map((stop) => (
          <span key={stop.id}>
            <strong><StopName stop={stop} /></strong>
            <small>
              {t("Stop {id}", { id: stop.id })}
              {stop.id === place.primaryStopId ? ` · ${t("main stop")}` : ""}
            </small>
          </span>
        ))}
      </div>
      <p className={styles.helper}>
        {t(
          "Only add places from people you trust. The stops show roughly where this place is, though never an address."
        )}
      </p>
      <div className={styles.setupActions}>
        <button type="button" className={styles.primaryButton} onClick={onImport}>
          {replacing ? t(phrases.replace) : t(phrases.add)}
        </button>
        <button type="button" className={styles.textButton} onClick={onDismiss}>
          {t("Not now")}
        </button>
      </div>
    </section>
  );
}

function PlaceCard({
  place,
  stops,
  online,
  onOpenStop,
  onSetPrimaryStop,
  onReplace,
  onRemove,
}) {
  const [showDriver, setShowDriver] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  // The phrase, worded when shown, so it follows a language switch.
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const label = placeLabel(place);
  const resolvedStops = resolvePlaceStops(place, stops);
  const primaryStop =
    resolvedStops.find((stop) => stop.id === place.primaryStopId) ||
    resolvedStops[0];
  const backupCount = resolvedStops.length - 1;
  const transitUrl =
    online && hasCoordinates(primaryStop)
      ? buildTransitDirectionsUrl(primaryStop)
      : "";

  const sharePlace = async () => {
    const url = buildSharedPlaceUrl(place);
    if (!url) return;

    setShareFeedback("");
    setShareUrl("");

    try {
      if (typeof navigator?.share === "function") {
        await navigator.share({
          title: t("{label} · My Places", { label }),
          text: t(PLACE_PHRASES[place.id].shareText),
          url,
        });
        setShareFeedback(msg("Link shared."));
        return;
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareFeedback(msg("Share link copied."));
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }

    setShareUrl(url);
    setShareFeedback(msg("Copy the share link below."));
  };

  return (
    <article
      className={styles.placeCard}
      data-mobile-expanded={mobileExpanded ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.mobileSummary}
        onClick={() =>
          setMobileExpanded((current) => {
            if (current) setShowDriver(false);
            return !current;
          })
        }
        aria-expanded={mobileExpanded}
      >
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={place.id} />
        </span>
        <span className={styles.mobileSummaryText}>
          <strong>{label}</strong>
          <small>
            {place.needsReview ? `${t("Needs review")} · ` : ""}
            <StopName stop={primaryStop} /> · {t("stop {id}", { id: primaryStop.id })}
          </small>
        </span>
        <span className={styles.mobileSummaryAction} aria-hidden="true">
          {mobileExpanded ? "−" : "›"}
        </span>
      </button>

      <div className={styles.placeHeading}>
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={place.id} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>
            {t("Main stop: {name} · stop {id}", {
              name: stopLabel(primaryStop),
              id: primaryStop.id,
            })}
          </p>
        </div>
      </div>

      {place.needsReview && (
        <p className={styles.reviewNotice} role="status">
          {t(
            "One or more of its stops are no longer in Föli’s stop list. Check this place before you rely on it."
          )}
        </p>
      )}

      <div className={styles.placeActions}>
        {transitUrl ? (
          <a
            className={styles.goButton}
            href={transitUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("{action} by public transit", {
              action: journeyAction(place),
            })}
          >
            {journeyAction(place)}
          </a>
        ) : (
          <button type="button" className={styles.goButton} disabled>
            {journeyAction(place)}
          </button>
        )}

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onOpenStop(primaryStop.id)}
        >
          {t(PLACE_PHRASES[place.id].open)}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setShowDriver(true)}
        >
          {t("Show to driver")}
        </button>
      </div>

      {backupCount > 0 && (
        <details className={styles.backups}>
          <summary>
            {backupCount === 1
              ? t("1 backup stop")
              : t("{count} backup stops", { count: backupCount })}
          </summary>
          <div className={styles.backupList}>
            {resolvedStops.map((stop) => (
              <div key={stop.id} className={styles.backupRow}>
                <span>
                  <strong><StopName stop={stop} /></strong>
                  <small>{t("Stop {id}", { id: stop.id })}</small>
                </span>
                {stop.id === primaryStop.id ? (
                  <span className={styles.primaryBadge}>{t("Main stop")}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => onSetPrimaryStop(place.id, stop.id)}
                  >
                    {t("Make main stop")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <details className={styles.manage}>
        <summary>{t(PLACE_PHRASES[place.id].manage)}</summary>
        <p className={styles.sharePrivacyHint}>
          {t(PLACE_PHRASES[place.id].sharing)}
        </p>
        <div className={styles.manageActions}>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => onReplace(place.id)}
          >
            {t("Replace using where I am now")}
          </button>
          <button
            type="button"
            className={styles.textButton}
            onClick={sharePlace}
          >
            {t("Share {label}", { label })}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => {
              if (window.confirm(t("Remove {label} from My Places?", { label }))) {
                onRemove(place.id);
              }
            }}
          >
            {t("Remove {label}", { label })}
          </button>
        </div>
        {shareFeedback && (
          <p className={styles.shareFeedback} role="status">
            {t(shareFeedback)}
          </p>
        )}
        {shareUrl && (
          <input
            className={styles.shareInput}
            aria-label={t("Share link for {label}", { label })}
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </details>

      {showDriver && (
        <SafePlaceDriverCard
          place={place}
          primaryStop={primaryStop}
          idPrefix="place"
          onClose={() => setShowDriver(false)}
        />
      )}
    </article>
  );
}

function EmptyPlaceCard({
  preset,
  activeStop,
  status,
  onStartSetup,
  onStartFromSelectedStop,
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const label = placeLabel(preset);

  return (
    <article
      className={styles.emptyCard}
      data-mobile-expanded={mobileExpanded ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.mobileSummary}
        onClick={() => setMobileExpanded((current) => !current)}
        aria-expanded={mobileExpanded}
      >
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={preset.id} />
        </span>
        <span className={styles.mobileSummaryText}>
          <strong>{label}</strong>
          <small>{t("Not set")}</small>
        </span>
        <span className={styles.mobileSummaryAction} aria-hidden="true">
          {mobileExpanded ? "−" : "+"}
        </span>
      </button>

      <div className={styles.emptyBody}>
        <span className={styles.placeIcon} aria-hidden="true">
          <PlaceIcon id={preset.id} />
        </span>
        <div>
          <h3>{label}</h3>
        </div>
        <div className={styles.emptyActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onStartSetup(preset.id)}
            disabled={status === "locating"}
            aria-busy={status === "locating"}
            aria-label={t(PLACE_PHRASES[preset.id].locate)}
          >
            {t("Use my location")}
          </button>
          {activeStop && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => onStartFromSelectedStop(preset.id)}
              aria-label={t(PLACE_PHRASES[preset.id].useStop, {
                name: stopLabel(activeStop),
              })}
            >
              {t("Use {name}", { name: stopLabel(activeStop) })}
            </button>
          )}
        </div>
      </div>
    </article>
  );
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
  // How to word the problem, not the words, so a language switch while it
  // shows rewords it.
  const [error, setError] = useState(null);
  const showError = (text) => setError({ text });
  const closeSetup = () => {
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
    if (!preset) return;

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

    try {
      const position = await requestOneTimePosition(navigator.geolocation);
      const insideServiceArea = isInsideMultiPolygon(
        position,
        serviceBoundary
      );

      const boundaryDecisionReliable =
        Number.isFinite(position.accuracy) &&
        position.accuracy <= LOW_ACCURACY_METERS;

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
    }
  };

  const startFromSelectedStop = (placeId) => {
    const preset = PLACE_PRESETS.find((candidate) => candidate.id === placeId);
    if (!preset || !activeStop) return;

    setError(null);
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
              "Save Home, School or Work as public stops — no address to type or remember."
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

      <div className={styles.grid}>
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
          heading's promise three times over. */}
      {PLACE_PRESETS.some((preset) => !placesById.get(preset.id)) && (
        <p className={styles.meta}>
          {t("Not at the stop? Open its departures first, then use it here.")}
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
