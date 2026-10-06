import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import AppFooter from "./app/AppFooter";
import AppHeader from "./app/AppHeader";
import useStopBoard from "./app/useStopBoard";
import useTransferWatch from "./app/useTransferWatch";
import ActiveJourney from "./components/ActiveJourney";
import BusStopDisplay from "./components/BusStopDisplay";
import BusStopForm from "./components/BusStopForm";
import ConnectivityStatus from "./components/ConnectivityStatus";
import FinalWalk from "./components/FinalWalk";
import FieldTestReport from "./components/FieldTestReport";
import HomeRecovery from "./components/HomeRecovery";
import IosInstallHint from "./components/IosInstallHint";
import JourneySearch from "./components/JourneySearch";
import TransferRecoveryPanel from "./components/TransferRecoveryPanel";
import MyPlaces from "./components/MyPlaces";
import NearbyStops from "./components/NearbyStops";
import QuickStops from "./components/QuickStops";
import RideMode from "./components/RideMode";
import ServiceAlerts from "./components/ServiceAlerts";
import StopRadarPanel from "./components/StopRadarPanel";
import useOnlineStatus from "./hooks/useOnlineStatus";
import useActiveJourney from "./hooks/useActiveJourney";
import useDestinationIntent from "./hooks/useDestinationIntent";
import useJourneyPlanSettings from "./hooks/useJourneyPlanSettings";
import usePendingFocus from "./hooks/usePendingFocus";
import useRouteCatalog from "./hooks/useRouteCatalog";
import useRideMode from "./hooks/useRideMode";
import useSavedPlaces from "./hooks/useSavedPlaces";
import useSavedStops from "./hooks/useSavedStops";
import useServiceBoundary from "./hooks/useServiceBoundary";
import useStopCatalog from "./hooks/useStopCatalog";
import useTransferRecoveryOptions from "./hooks/useTransferRecoveryOptions";
import { t, useLanguage } from "./i18n";
import { buildRouteIndexes } from "./utils/routes";
import {
  arrivalMatchesActiveJourney,
  transferJourneyForRideSelection,
} from "./utils/activeJourney";
import { canSearchTransferRecovery } from "./utils/transferRecovery";
import { advanceServerTime } from "./utils/time";
import { isCancelledHere } from "./components/departureBoard/departures";
import { clearSharedPlaceHash, parseSharedPlaceHash } from "./utils/sharedPlaces";
import {
  activeJourneyHeading,
  finalWalkHeading,
  firstJourneyOption,
  pageHeading,
  nearbyHeading,
  placeCardControl,
  recoveryJourneyTarget,
  rideHeading,
  selectedJourneyDepartureAction,
} from "./app/focusTargets";
import {
  canonicalizeCurrentStop,
  currentHistoryState,
  openingStop,
  stopFromLocation,
  stopUrl,
} from "./app/stopNavigation";
import { realStopName } from "./utils/stopNames";
import {
  completedFinalWalk,
  finalWalkFromRideSelection,
} from "./utils/finalWalk";
import { hasCoordinates } from "./utils/geo";


function announceStop(stopId, name, loading) {
  if (name) return t("Departures for {name}, stop {id}", { name, id: stopId });
  // Still loading, the name may be a moment away: one announcement, with
  // it, rather than the number and then the name.
  return loading ? "" : t("Departures for stop {id}", { id: stopId });
}


function withCatalogNames(savedStops, stops) {
  if (!savedStops.some((stop) => !stop.name)) return savedStops;
  const names = new Map(stops.map((stop) => [stop.id, stop.name]));
  return savedStops.map((stop) =>
    stop.name ? stop : { ...stop, name: names.get(stop.id) || "" }
  );
}

function App() {
  // Everything below reads its words from the current language.
  const language = useLanguage();
  const [stopId, setStopId] = useState(openingStop);
  const openedStopRef = useRef(stopId);
  const [sharedPlace, setSharedPlace] = useState(() =>
    parseSharedPlaceHash(window.location.hash)
  );
  const online = useOnlineStatus();
  const ride = useRideMode();
  const activeRideSession = ride.session;
  const rideContinuation = ride.continuation;
  const updateRideContinuation = ride.updateContinuation;
  const pendingTransferJourney =
    rideContinuation?.transferJourney || null;
  const pendingFinalWalk = rideContinuation?.finalWalk || null;
  const journey = useDestinationIntent(rideContinuation?.destination || null);
  const journeyDestinationId = journey.destination?.id || "";
  const restoreJourneyDestination = journey.restoreDestination;
  const journeyPlan = useJourneyPlanSettings();
  const [finalWalk, setFinalWalk] = useState(null);
  const [journeyRadarOpen, setJourneyRadarOpen] = useState(false);
  const [boardingRequest, setBoardingRequest] = useState(0);
  const {
    journey: selectedJourney,
    selectDirectJourney,
    selectTransferJourney,
    continueTransferAfterRide,
    recoverTransferAfterRide,
    revalidateTransfer,
    confirmAtStop,
    clearJourney,
    observeStopFeed,
  } = useActiveJourney();

  useEffect(() => {
    const restoredDestination = rideContinuation?.destination || null;
    if (
      activeRideSession &&
      restoredDestination &&
      journeyDestinationId !== restoredDestination.id
    ) {
      restoreJourneyDestination(restoredDestination);
    }
  }, [
    activeRideSession,
    journeyDestinationId,
    restoreJourneyDestination,
    rideContinuation,
  ]);
  const requestFocus = usePendingFocus();
  // The passenger's own edits to the stop search, counted, so a late "Near
  // you" fix can tell that they started typing while it was on its way. A
  // ref, not state: nothing is drawn from it, and every key would redraw
  // the whole page.
  const searchEditsRef = useRef(0);
  const noteSearchEdit = useCallback(() => {
    searchEditsRef.current += 1;
  }, []);
  const readSearchEdits = useCallback(() => searchEditsRef.current, []);
  const { geometry: serviceBoundary } = useServiceBoundary();
  const {
    stops,
    coordinatesStatus,
    catalogStatus,
    catalogSavedAt,
  } = useStopCatalog();
  const routes = useRouteCatalog();
  const { byId: routesById, byShortName: routesByShortName } = useMemo(
    () => buildRouteIndexes(routes),
    [routes]
  );
  const transferRecovery = useTransferRecoveryOptions({
    enabled: online && !ride.session,
    journey: selectedJourney,
    destination: journey.destination,
    allStops: stops,
  });
  const transferRecoveryContext = canSearchTransferRecovery(selectedJourney);
  const {
    favorites,
    recents,
    favoriteIds,
    rememberRecent,
    toggleFavorite,
  } = useSavedStops();
  // A first visit, on this phone: nothing looked at or saved before it. A
  // phone then still says what the app is and what the search takes; after
  // that the board gets the room.
  const firstVisitRef = useRef(null);
  if (firstVisitRef.current === null) {
    firstVisitRef.current = favorites.length === 0 && recents.length === 0;
  }
  const firstVisit = firstVisitRef.current;
  const {
    places,
    byId: placesById,
    savePlace,
    revalidatePlaces,
    removePlace,
    setPrimaryStop,
  } = useSavedPlaces();
  const {
    stopName,
    arrivals,
    serverTime,
    receivedAtMs,
    realtimeAvailable,
    scheduleAvailable,
    scheduleFailed,
    scheduleIncomplete,
    loading,
    refreshing,
    error,
    refresh,
    serviceAlerts,
    serviceAlertsError,
    serviceAlertsReceivedAtMs,
    selectedStop,
    unknownStop,
    lineNotices,
    stopCancellations,
  } = useStopBoard({ stopId, stops, catalogStatus, routesById });

  const transferRevalidation = useTransferWatch({
    selectedJourney,
    pendingTransferJourney,
    ride,
    routesById,
    revalidateTransfer,
    updateRideContinuation,
  });

  const selectedJourneyArrival = useMemo(() => {
    if (!selectedJourney || selectedJourney.stopId !== stopId) return null;
    return (
      arrivals.find((arrival) =>
        arrivalMatchesActiveJourney(arrival, selectedJourney)
      ) || null
    );
  }, [arrivals, selectedJourney, stopId]);

  const selectedJourneyCancellationProbe =
    selectedJourneyArrival ||
    (selectedJourney?.stopId === stopId
      ? {
          lineref: selectedJourney.lineRef,
          aimeddeparturetime:
            selectedJourney.aimedDepartureAt ||
            selectedJourney.departureAt,
          originaimeddeparturetime:
            selectedJourney.originAimedDepartureAt || undefined,
        }
      : null);
  const selectedJourneyCancelled =
    selectedJourneyCancellationProbe &&
    isCancelledHere(
      selectedJourneyCancellationProbe,
      stopCancellations
    );

  const selectedJourneyStop = useMemo(
    () =>
      selectedJourney
        ? stops.find((candidate) => candidate.id === selectedJourney.stopId) ||
          null
        : null,
    [selectedJourney, stops]
  );

  useEffect(() => {
    setJourneyRadarOpen(false);
  }, [selectedJourney?.id, selectedJourney?.stopId]);

  const selectedJourneyMonitoringState = !selectedJourney
    ? "active"
    : selectedJourney.stopId !== stopId
      ? "paused"
      : error ||
          !Number.isFinite(Number(receivedAtMs)) ||
          Number(receivedAtMs) <= selectedJourney.selectedAt
        ? "degraded"
        : "active";

  useEffect(() => {
    if (!selectedJourney || selectedJourney.stopId !== stopId) return;

    observeStopFeed({
      stopId,
      arrival: selectedJourneyArrival,
      referenceTimeSec: advanceServerTime(serverTime, receivedAtMs),
      receivedAtMs,
      feedError: error,
      cancelled: selectedJourneyCancelled === true,
    });
  }, [
    observeStopFeed,
    error,
    receivedAtMs,
    selectedJourney,
    selectedJourneyArrival,
    selectedJourneyCancelled,
    serverTime,
    stopId,
  ]);

  useEffect(() => {
    if (
      selectedJourney &&
      selectedJourney.destinationId !== journey.destination?.id
    ) {
      clearJourney();
    }
  }, [
    clearJourney,
    journey.destination?.id,
    selectedJourney,
  ]);
  // Föli's own name for the stop, or "" while none is known: the board and
  // the title then call it by its number, in the reader's language.
  const displayStopName = selectedStop?.name || realStopName(stopName);
  // Saved stops kept before their name was known pick it up from the
  // catalogue instead of showing a number for good.
  const namedFavorites = useMemo(
    () => withCatalogNames(favorites, stops),
    [favorites, stops]
  );
  const namedRecents = useMemo(
    () => withCatalogNames(recents, stops),
    [recents, stops]
  );

  useEffect(() => {
    // A reopened stop goes into the address too, so reload, Back and a
    // copied link all agree with the screen.
    canonicalizeCurrentStop(openedStopRef.current, { keepSharedPlace: true });

    const handlePopState = () => {
      // The shareable URL is the single source of truth for browser history.
      // Avoid duplicating stop identity in history.state, which can diverge
      // across same-document navigation implementations.
      setFocusSaysStopId("");
      setStopId(stopFromLocation());
    };
    const handleHashChange = () =>
      setSharedPlace(parseSharedPlaceHash(window.location.hash));

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (catalogStatus === "ready" && catalogSavedAt > 0) {
      revalidatePlaces(stops, catalogSavedAt);
    }
  }, [
    catalogSavedAt,
    catalogStatus,
    places,
    revalidatePlaces,
    stops,
  ]);

  useEffect(() => {
    if (displayStopName) {
      rememberRecent({ id: stopId, name: displayStopName });
    }
  }, [displayStopName, rememberRecent, stopId]);

  // Every stop used to share one title, so tabs, bookmarks and history
  // could not be told apart.
  useEffect(() => {
    // The page's own title in index.html is this same phrase.
    document.title = stopId
      ? t("{name} ({id}) · Turku Departures", {
          name: displayStopName || t("Stop {id}", { id: stopId }),
          id: stopId,
        })
      : t("Turku Departures · Live bus times & get-off alerts");
  }, [displayStopName, language, stopId]);

  // A change of stop is said, once, by a line that changes with nothing
  // else. The board's meta line did it before, and as it also carried the
  // update time, every 30-second refresh was read out twice. The stop the
  // page opened on is not announced: it is the page's own heading.
  const [openedStopId] = useState(stopId);
  const [stopChanged, setStopChanged] = useState(false);
  if (!stopChanged && stopId !== openedStopId) setStopChanged(true);
  // A stop whose heading is given focus is said by the heading itself:
  // announcing it as well read "Turun linna" twice.
  const [focusSaysStopId, setFocusSaysStopId] = useState("");
  const stopAnnouncement =
    stopChanged && stopId && stopId !== focusSaysStopId
      ? announceStop(stopId, displayStopName, loading)
      : "";

  const selectStop = (nextStopId) => {
    if (!/^\d+$/.test(nextStopId || "")) return;
    setFinalWalk(null);

    if (nextStopId === stopId) {
      refresh();
      return;
    }

    // Preserve unrelated browser/router state, but keep the stop identity only
    // in the shareable URL so Back/Forward has one canonical source of truth.
    canonicalizeCurrentStop(stopId);
    window.history.pushState(currentHistoryState(), "", stopUrl(nextStopId));
    setFocusSaysStopId("");
    setStopId(nextStopId);
  };

  // A saved stop's chip leaves the list once its stop is open, and the stop
  // radar closes on "Open target stop", so the button pressed is gone. Focus
  // goes to the board it opened, and a screen reader starts at the new
  // stop's name.
  const selectSavedStop = (nextStopId) => {
    requestFocus(pageHeading);
    selectStop(nextStopId);
    setFocusSaysStopId(nextStopId);
  };

  // Start takes the setup away, and the alert that replaces it is at the
  // top of the page. Focus goes to its heading, so a screen reader hears
  // "No need to watch for your stop" instead of nothing.
  const startRide = (config) => {
    const pendingTransfer = transferJourneyForRideSelection(
      selectedJourney,
      config
    );
    const nextFinalWalk = pendingTransfer
      ? null
      : finalWalkFromRideSelection({
          journey: selectedJourney,
          destination: journey.destination,
          rideConfig: config,
        });
    const started = ride.startRide({
      ...config,
      continuation: {
        transferJourney: pendingTransfer,
        finalWalk: nextFinalWalk,
        destination:
          pendingTransfer || nextFinalWalk ? journey.destination : null,
      },
    });
    if (started) {
      setFinalWalk(null);
      clearJourney();
      requestFocus(rideHeading);
    }
    return started;
  };

  // Turning the alert off, or getting off, takes the whole panel away with
  // the button in it. Focus goes back to the board, which is what is left.
  const endRide = () => {
    const continuedTransfer = pendingTransferJourney
      ? continueTransferAfterRide(pendingTransferJourney, ride.session)
      : null;
    const transferRecovery =
      pendingTransferJourney && !continuedTransfer
        ? recoverTransferAfterRide(pendingTransferJourney, ride.session)
        : null;
    const completed = completedFinalWalk(
      pendingFinalWalk,
      ride.session
    );
    ride.endRide();

    if (continuedTransfer) {
      setFinalWalk(null);
      selectStop(continuedTransfer.stopId);
      requestFocus(activeJourneyHeading);
      return;
    }

    if (transferRecovery) {
      setFinalWalk(null);
      requestFocus(activeJourneyHeading);
      return;
    }

    if (completed) {
      selectStop(completed.fromStopId);
      setFinalWalk(completed);
      requestFocus(finalWalkHeading);
      return;
    }

    requestFocus(pageHeading);
  };

  const chooseJourneyPlace = (place) => {
    setFinalWalk(null);
    clearJourney();
    journey.choosePlace(place);
  };

  const chooseJourneyStop = (stop) => {
    setFinalWalk(null);
    clearJourney();
    journey.chooseStop(stop);
  };

  const chooseJourneyExternalPlace = (place) => {
    const prepared = journey.chooseExternalPlace(
      place,
      stops,
      serviceBoundary
    );
    if (prepared.ok) {
      setFinalWalk(null);
      clearJourney();
    }
    return prepared;
  };

  const clearJourneyDestination = () => {
    setFinalWalk(null);
    clearJourney();
    journey.clearDestination();
  };

  const finishFinalWalk = () => {
    setFinalWalk(null);
    journey.clearDestination();
    requestFocus(pageHeading);
  };

  const selectJourneyOption = (option) => {
    if (!journey.destination) return;
    const selected = selectDirectJourney(
      option,
      journey.destination
    );
    if (!selected) return;

    requestFocus(activeJourneyHeading);
    selectStop(option.stopId);
  };

  const selectTransferJourneyOption = (option) => {
    if (!journey.destination) return;
    const selected = selectTransferJourney(option, journey.destination);
    if (!selected) return;

    requestFocus(activeJourneyHeading);
    selectStop(option.originStopId);
  };

  const confirmJourneyAtStop = () => {
    requestFocus(activeJourneyHeading);
    confirmAtStop();
  };

  const showSelectedJourneyDeparture = () => {
    if (!selectedJourney) return;
    requestFocus(selectedJourneyDepartureAction);
    selectStop(selectedJourney.stopId);
  };

  const chooseAnotherJourney = () => {
    // In recovery the alternative cards are already on this page, so move
    // focus immediately when possible. A pending request remains useful when
    // the replacement options are still loading.
    const visibleOption =
      selectedJourney?.phase === "recovery"
        ? firstJourneyOption()
        : null;
    if (visibleOption) visibleOption.focus();
    else if (transferRecoveryContext) requestFocus(recoveryJourneyTarget);
    else requestFocus(firstJourneyOption);

    // Keep recovery context until another concrete trip is selected. This
    // prevents the cancelled/departed trip from immediately returning as a
    // recommendation while the passenger is choosing a replacement.
    if (selectedJourney?.phase !== "recovery") {
      clearJourney();
    }
  };

  const openSelectedJourneyStop = () => {
    if (!selectedJourney) return;
    requestFocus(pageHeading);
    selectStop(selectedJourney.stopId);
  };

  const openJourneyRadar = () => {
    if (
      !selectedJourney?.stopId ||
      !selectedJourneyStop ||
      !hasCoordinates(selectedJourneyStop)
    ) {
      return;
    }
    setJourneyRadarOpen(true);
  };

  const closeJourneyRadar = () => {
    setJourneyRadarOpen(false);
    globalThis.requestAnimationFrame?.(() => {
      activeJourneyHeading()?.focus({ preventScroll: true });
    });
  };

  const confirmJourneyBoarding = () => {
    if (!selectedJourney?.stopId || !selectedJourney.tripRef) return;
    setJourneyRadarOpen(false);
    setBoardingRequest((request) => request + 1);
    selectStop(selectedJourney.stopId);
  };

  const currentStop = stopId
    ? {
        id: stopId,
        // Stored with a favourite, so never a stand-in.
        name: displayStopName,
      }
    : null;

  // Either answer removes the question, and the button pressed with it:
  // focus fell to the page's start. It goes to the place just added, or
  // back to the page's heading after "Not now".
  const dismissSharedPlace = () => {
    requestFocus(pageHeading);
    setSharedPlace(null);
    clearSharedPlaceHash();
  };

  const importSharedPlace = () => {
    if (!sharedPlace) return;
    const placeId = sharedPlace.id;
    savePlace(sharedPlace);
    setSharedPlace(null);
    clearSharedPlaceHash();
    requestFocus(() => placeCardControl(placeId));
  };

  // What the planner shares wherever it appears: the plan's settings, and
  // that changing one drops a journey chosen under the old ones.
  const planSearchProps = {
    stops,
    places,
    timeConstraint: journeyPlan.timeConstraint,
    timeLocalValue: journeyPlan.timeLocalValue,
    timeValid: journeyPlan.timeValid,
    routingPreference: journeyPlan.preference,
    coordinatesStatus,
    online,
    onTimeModeChange: (mode) => {
      clearJourney();
      journeyPlan.setTimeMode(mode);
    },
    onTimeLocalValueChange: (value) => {
      clearJourney();
      journeyPlan.setTimeLocalValue(value);
    },
    onPreferenceChange: (preference) => {
      clearJourney();
      journeyPlan.setPreference(preference);
    },
    onClear: clearJourneyDestination,
  };

  const homeRecovery =
    !ride.session && (
      <HomeRecovery
        home={placesById.get("home") || null}
        stops={stops}
        online={online}
        compact={Boolean(stopId)}
        onOpenStop={selectStop}
      />
    );

  return (
    // The header and footer sit beside the main content, not inside it, so
    // they are the page's banner and contentinfo: inside <main> they were
    // neither, and a screen reader's landmark list had only "main".
    <div className="app-shell">
      <AppHeader
        stopId={stopId}
        firstRun={placesById.size === 0 && (firstVisit || !stopId)}
        online={online}
      />

      <main className="app-main">
        <ConnectivityStatus online={online} />
        {/* Installation education must never push a live departure board or
            Ride Mode below the first phone viewport. Offer it only before a
            stop has been opened; returning/active journeys keep transit
            information visually authoritative. */}
        {!ride.session && !stopId && <IosInstallHint />}

        {!ride.session &&
          ride.fieldDiagnosticsEnabled &&
          ride.fieldReport && <FieldTestReport report={ride.fieldReport} />}

        {ride.session && (
          <RideMode
            session={ride.session}
            runtime={ride.runtime}
            gps={ride.gps}
            wakeLockState={ride.wakeLockState}
            onTestAlert={ride.testAlert}
            onEndRide={endRide}
            onOpenStop={selectStop}
            // The saved continuation is created only by
            // transferJourneyForRideSelection(), which already proves an
            // exact current-leg/exit-occurrence match and a committed future
            // leg. It survives a same-tab reload with the active ride.
            transferJourney={pendingTransferJourney}
            transferRevalidation={transferRevalidation}
          />
        )}

        {!ride.session && finalWalk && (
          <FinalWalk
            walk={finalWalk}
            online={online}
            onDone={finishFinalWalk}
          />
        )}

        {sharedPlace && (
          <MyPlaces
            stops={stops}
            coordinatesStatus={coordinatesStatus}
            activeStopId={stopId}
            placesById={placesById}
            sharedPlace={sharedPlace}
            serviceBoundary={serviceBoundary}
            online={online}
            onSavePlace={savePlace}
            onImportSharedPlace={importSharedPlace}
            onDismissSharedPlace={dismissSharedPlace}
            onRemovePlace={removePlace}
            onSetPrimaryStop={setPrimaryStop}
            onOpenStop={selectStop}
          />
        )}

        {/* With a stop open and a destination chosen, the destination
            stays in view above the board as one line. */}
        {!ride.session && !finalWalk && stopId && journey.destination && (
          <JourneySearch
            {...planSearchProps}
            compact
            destination={journey.destination}
            onChoosePlace={chooseJourneyPlace}
            onChooseStop={chooseJourneyStop}
            onChooseExternalPlace={chooseJourneyExternalPlace}
          />
        )}

        {!ride.session && selectedJourney && (
          <ActiveJourney
            journey={selectedJourney}
            stop={selectedJourneyStop}
            online={online}
            monitoringState={selectedJourneyMonitoringState}
            boardingAvailable={Boolean(
              selectedJourneyArrival && !selectedJourneyCancelled
            )}
            onConfirmAtStop={confirmJourneyAtStop}
            onShowDeparture={showSelectedJourneyDeparture}
            onBoard={confirmJourneyBoarding}
            onGuideWithRadar={
              hasCoordinates(selectedJourneyStop) ? openJourneyRadar : null
            }
            onChooseAnother={chooseAnotherJourney}
            onOpenStop={openSelectedJourneyStop}
          />
        )}

        {!ride.session && selectedJourney && journeyRadarOpen && (
          <StopRadarPanel
            stops={stops}
            initialTargetStopId={selectedJourney.stopId}
            recommendedTargetStopId={selectedJourney.stopId}
            activeStopId={stopId}
            onOpenStop={(id) => {
              setJourneyRadarOpen(false);
              requestFocus(pageHeading);
              selectStop(id);
              setFocusSaysStopId(id);
            }}
            onClose={closeJourneyRadar}
          />
        )}

        {!ride.session &&
          selectedJourney?.phase === "recovery" &&
          transferRecoveryContext && (
            <TransferRecoveryPanel
              state={online ? transferRecovery.state : "offline"}
              directOptions={transferRecovery.directOptions}
              transferOptions={transferRecovery.transferOptions}
              destination={journey.destination}
              onSelectJourney={selectJourneyOption}
              onSelectTransferJourney={selectTransferJourneyOption}
            />
          )}

        {/* On an idle Home, lead with the passenger's destination intent.
            Stop-first remains a parallel first-class path immediately below:
            neither flow is a tab or global app mode. */}
        {!ride.session && !finalWalk && !stopId && (
          <JourneySearch
            {...planSearchProps}
            homeEntry
            compact={Boolean(journey.destination)}
            destination={journey.destination}
            onChoosePlace={(place) => {
              chooseJourneyPlace(place);
              requestFocus(nearbyHeading);
            }}
            onChooseStop={(stop) => {
              chooseJourneyStop(stop);
              requestFocus(nearbyHeading);
            }}
            onChooseExternalPlace={(place) => {
              const prepared = chooseJourneyExternalPlace(place);
              if (prepared?.ok) requestFocus(nearbyHeading);
              return prepared;
            }}
          />
        )}

        {/* Keep the existing stop-search surface as the parallel
            first-class path. No second component or app mode is introduced:
            only its position in the idle Home hierarchy changes. */}
        {!selectedJourney && (
          <div className="top-section">
            {stopId && homeRecovery}

            <section className="search-panel" aria-label={t("Choose a bus stop")}>
              <BusStopForm
                compact={Boolean(stopId) && !firstVisit}
                showLocationAction={!journey.destination || Boolean(stopId)}
                activeStopId={stopId}
                stops={stops}
                coordinatesStatus={coordinatesStatus}
                serviceBoundary={serviceBoundary}
                onSubmit={selectStop}
                onEdit={noteSearchEdit}
              />
            </section>

            <QuickStops
              favorites={namedFavorites}
              recents={namedRecents}
              activeStopId={stopId}
              onSelect={selectSavedStop}
            />

            {stopId && (
              <ServiceAlerts
                alerts={serviceAlerts}
                error={serviceAlertsError}
                receivedAtMs={serviceAlertsReceivedAtMs}
              />
            )}
          </div>
        )}

        {selectedJourney && stopId && (
          <ServiceAlerts
            alerts={serviceAlerts}
            error={serviceAlertsError}
            receivedAtMs={serviceAlertsReceivedAtMs}
          />
        )}

        {/* Always in the page, so a change is announced: a live region
            added at that moment often is not. */}
        <p className="visually-hidden" role="status">
          {stopAnnouncement}
        </p>

        {stopId && (
          <>
            <BusStopDisplay
              stopId={stopId}
              stopName={displayStopName}
              stop={selectedStop}
              stops={stops}
              arrivals={arrivals}
              routesById={routesById}
              routesByShortName={routesByShortName}
              serverTime={serverTime}
              receivedAtMs={receivedAtMs}
              realtimeAvailable={realtimeAvailable}
              scheduleAvailable={scheduleAvailable}
              scheduleFailed={scheduleFailed === true}
              scheduleIncomplete={scheduleIncomplete === true}
              loading={loading}
              refreshing={refreshing}
              error={error}
              onRefresh={() => refresh()}
              isFavorite={favoriteIds.has(stopId)}
              onToggleFavorite={() =>
                currentStop && toggleFavorite(currentStop)
              }
              placesById={placesById}
              destination={journey.destination}
              selectedJourney={selectedJourney}
              boardingRequest={boardingRequest}
              onStartRide={startRide}
              activeRideTripRef={ride.session?.tripRef || ""}
              cancellations={stopCancellations}
              unknownStop={unknownStop}
              online={online}
              lineNotices={lineNotices}
            />
          </>
        )}

        {/* With a stop's board open and no destination, the planner waits
            below the board as one line. A returning passenger reopens on
            their last stop, and with nothing here "Where do you want to go?"
            was out of reach. Below the board, it never pushes a departure
            off the first screen. Once a destination is chosen it leaves for
            the line above the board, and focus goes to the board's heading:
            sent below it, the page scrolled the buses to that destination,
            now listed first, out of sight. */}
        {!ride.session &&
          !finalWalk &&
          !selectedJourney &&
          stopId &&
          !journey.destination && (
          <JourneySearch
            key="journey-entry"
            {...planSearchProps}
            compact
            destination={null}
            onChoosePlace={(place) => {
              requestFocus(pageHeading);
              chooseJourneyPlace(place);
            }}
            onChooseStop={(stop) => {
              requestFocus(pageHeading);
              chooseJourneyStop(stop);
            }}
            onChooseExternalPlace={(place) => {
              const prepared = chooseJourneyExternalPlace(place);
              if (prepared?.ok) requestFocus(pageHeading);
              return prepared;
            }}
          />
        )}

        {/* Before a stop is chosen, location is the quickest way to one, and
            with no board yet this is where it lands. One instance in one place:
            a second copy for first visits unmounted under the passenger's
            finger as they chose a stop, dropping keyboard focus to the page
            and the list they had just found. */}
        {!selectedJourney && !transferRecoveryContext && (
          <NearbyStops
            stops={stops}
            coordinatesStatus={coordinatesStatus}
            activeStopId={stopId || ""}
            serviceBoundary={serviceBoundary}
            online={online}
            searchEdits={readSearchEdits}
            destination={journey.destination}
            timeConstraint={journeyPlan.timeConstraint}
            timeValid={journeyPlan.timeValid}
            routingPreference={journeyPlan.preference}
            excludedJourney={
              selectedJourney?.phase === "recovery" ? selectedJourney : null
            }
            onSelectJourney={selectJourneyOption}
            onSelectTransferJourney={selectTransferJourneyOption}
            onSelect={selectStop}
            onOpenStop={selectSavedStop}
          />
        )}

        {/* Home recovery is useful, but on idle Home it must not compete with
            destination, stop search or physical nearby-stop orientation. */}
        {!selectedJourney && !stopId && homeRecovery}

        {!sharedPlace && !selectedJourney && (
          <MyPlaces
            stops={stops}
            coordinatesStatus={coordinatesStatus}
            activeStopId={stopId}
            placesById={placesById}
            sharedPlace={sharedPlace}
            serviceBoundary={serviceBoundary}
            online={online}
            onSavePlace={savePlace}
            onImportSharedPlace={importSharedPlace}
            onDismissSharedPlace={dismissSharedPlace}
            onRemovePlace={removePlace}
            onSetPrimaryStop={setPrimaryStop}
            onOpenStop={selectStop}
          />
        )}

      </main>

      <AppFooter />
    </div>
  );
}

export default App;
