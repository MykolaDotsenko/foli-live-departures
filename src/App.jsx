import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import ActiveJourney from "./components/ActiveJourney";
import BusStopDisplay from "./components/BusStopDisplay";
import BusStopForm from "./components/BusStopForm";
import ConnectivityStatus from "./components/ConnectivityStatus";
import FinalWalk from "./components/FinalWalk";
import FieldTestReport from "./components/FieldTestReport";
import HomeRecovery from "./components/HomeRecovery";
import HelpGuide from "./components/HelpGuide";
import IosInstallHint from "./components/IosInstallHint";
import LanguageSwitch from "./components/LanguageSwitch";
import LocalStateBackup from "./components/LocalStateBackup";
import JourneySearch from "./components/JourneySearch";
import TransferRecoveryPanel from "./components/TransferRecoveryPanel";
import ThemeSwitch from "./components/ThemeSwitch";
import MyPlaces from "./components/MyPlaces";
import NearbyStops from "./components/NearbyStops";
import QuickStops from "./components/QuickStops";
import RideMode from "./components/RideMode";
import ServiceAlerts from "./components/ServiceAlerts";
import useOnlineStatus from "./hooks/useOnlineStatus";
import useActiveJourney from "./hooks/useActiveJourney";
import useDestinationIntent from "./hooks/useDestinationIntent";
import usePendingFocus from "./hooks/usePendingFocus";
import useRouteCatalog from "./hooks/useRouteCatalog";
import useRideMode from "./hooks/useRideMode";
import useSavedPlaces from "./hooks/useSavedPlaces";
import useSavedStops, { stopToReopen } from "./hooks/useSavedStops";
import useServiceBoundary from "./hooks/useServiceBoundary";
import useStopAlerts from "./hooks/useStopAlerts";
import useStopCatalog from "./hooks/useStopCatalog";
import useStopMonitor from "./hooks/useStopMonitor";
import useTransferLegRevalidation from "./hooks/useTransferLegRevalidation";
import useTransferRecoveryOptions from "./hooks/useTransferRecoveryOptions";
import { t, useLanguage } from "./i18n";
import { buildRouteIndexes } from "./utils/routes";
import {
  arrivalMatchesActiveJourney,
  transferJourneyForRideSelection,
} from "./utils/activeJourney";
import { applyTransferRevalidation } from "./utils/transferRevalidation";
import { canSearchTransferRecovery } from "./utils/transferRecovery";
import { advanceServerTime } from "./utils/time";
import { isCancelledHere } from "./components/departureBoard/departures";
import { clearSharedPlaceHash, parseSharedPlaceHash } from "./utils/sharedPlaces";
import { realStopName } from "./utils/stopNames";
import {
  completedFinalWalk,
  finalWalkFromRideSelection,
} from "./utils/finalWalk";

const PRODUCT_NAME = "Turku Departures";
const MAKER_NAME = "Mykola Dotsenko";

// The page's one h1: the stop's name on the board, or the app's own name
// before a stop is open. It is where focus goes when the button pressed
// has gone and the page itself is the answer.
function pageHeading() {
  return (
    document.getElementById("departures-title") ||
    document.getElementById("app-title")
  );
}

function rideHeading() {
  return document.getElementById("ride-mode-title");
}

function activeJourneyHeading() {
  return document.getElementById("active-journey-title");
}

function finalWalkHeading() {
  return document.getElementById("final-walk-title");
}

function recoveryJourneyTarget() {
  const option = document.querySelector(
    '[aria-labelledby="recovery-journey-options-title"] button'
  );
  if (option instanceof globalThis.HTMLElement) return option;
  return document.getElementById("recovery-journey-options-title");
}

function selectedJourneyDepartureAction() {
  return (
    document.getElementById("selected-journey-departure-action") ||
    pageHeading()
  );
}

function firstJourneyOption() {
  const element = document.querySelector(
    '[aria-labelledby="recovery-journey-options-title"] button, [aria-labelledby="direct-journey-options-title"] button, [aria-labelledby="transfer-journey-options-title"] button'
  );
  return element instanceof globalThis.HTMLElement ? element : null;
}

function announceStop(stopId, name, loading) {
  if (name) return t("Departures for {name}, stop {id}", { name, id: stopId });
  // Still loading, the name may be a moment away: one announcement, with
  // it, rather than the number and then the name.
  return loading ? "" : t("Departures for stop {id}", { id: stopId });
}


function stopFromLocation() {
  const stopFromUrl = new URLSearchParams(window.location.search).get("stop");
  return /^\d+$/.test(stopFromUrl || "") ? stopFromUrl : "";
}

// The home-screen icon opens the bare address, and a daily passenger opens
// it for their own stop: the one they last looked at, or their first
// favourite. A link that names a stop, even one that does not exist, and a
// shared place's link still decide for themselves.
function openingStop() {
  if (new URLSearchParams(window.location.search).has("stop")) {
    return stopFromLocation();
  }
  if (parseSharedPlaceHash(window.location.hash)) return "";
  return stopToReopen();
}

// A shared-place token belongs to the page it arrived on. Carried into
// every stop URL, it put the "Add Home?" question back one Back press
// after "Not now". So an entry keeps it only while it is the page the link
// opened; leaving for another stop drops it from both entries.
function stopUrl(stopId, { keepSharedPlace = false } = {}) {
  const url = new globalThis.URL(window.location.href);

  if (/^\d+$/.test(stopId || "")) {
    url.searchParams.set("stop", stopId);
  } else {
    url.searchParams.delete("stop");
  }

  if (!keepSharedPlace && url.hash.startsWith("#place=")) {
    url.hash = "";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function withCatalogNames(savedStops, stops) {
  if (!savedStops.some((stop) => !stop.name)) return savedStops;
  const names = new Map(stops.map((stop) => [stop.id, stop.name]));
  return savedStops.map((stop) =>
    stop.name ? stop : { ...stop, name: names.get(stop.id) || "" }
  );
}

function currentHistoryState() {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : {};
}

function canonicalizeCurrentStop(stopId, options) {
  window.history.replaceState(
    currentHistoryState(),
    "",
    stopUrl(stopId, options)
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
  const journey = useDestinationIntent();
  const [finalWalk, setFinalWalk] = useState(null);
  const pendingFinalWalkRef = useRef(null);
  const pendingTransferJourneyRef = useRef(null);
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
  } = useStopMonitor(stopId);
  const activeLines = useMemo(
    () => [...new Set(arrivals.map((arrival) => arrival.lineref).filter(Boolean))],
    [arrivals]
  );
  const {
    alerts: serviceAlerts,
    error: serviceAlertsError,
    receivedAtMs: serviceAlertsReceivedAtMs,
  } = useStopAlerts(stopId, activeLines, routesById);
  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === stopId) || null,
    [stopId, stops]
  );
  // A number Föli's up-to-date stop list does not have: "?stop=1640" for
  // 164 read as a stop with no departures.
  const unknownStop =
    Boolean(stopId) &&
    catalogStatus === "ready" &&
    stops.length > 0 &&
    !selectedStop;
  // A notice about a line, on that line's buses: with the list folded on a
  // phone, "Detour" on the row is what says line 1 is affected.
  const lineNotices = useMemo(() => {
    const notices = new Map();
    for (const alert of serviceAlerts) {
      if (alert.type !== "message" && alert.type !== "emergency") continue;
      for (const line of alert.routeNames || []) {
        if (!notices.has(String(line))) {
          notices.set(String(line), alert.effectLabel || "");
        }
      }
    }
    return notices;
  }, [serviceAlerts]);
  const stopCancellations = useMemo(
    () => serviceAlerts.filter((alert) => alert.type === "cancellation"),
    [serviceAlerts]
  );

  const transferWatchJourney =
    selectedJourney?.transferPlan &&
    selectedJourney.transferLeg === 1 &&
    selectedJourney.phase !== "recovery"
      ? selectedJourney
      : ride.session &&
          pendingTransferJourneyRef.current?.transferPlan &&
          pendingTransferJourneyRef.current.transferLeg === 1 &&
          pendingTransferJourneyRef.current.phase !== "recovery"
        ? pendingTransferJourneyRef.current
        : null;
  const transferSecondLeg = transferWatchJourney?.transferPlan?.second || null;
  const transferWatchStopId = String(transferSecondLeg?.boardStopId || "");
  const transferWatchLineRefs = useMemo(
    () =>
      transferSecondLeg?.lineRef
        ? [String(transferSecondLeg.lineRef)]
        : [],
    [transferSecondLeg?.lineRef]
  );
  const { alerts: transferServiceAlerts } = useStopAlerts(
    transferWatchStopId,
    transferWatchLineRefs,
    routesById,
    {
      enabled: Boolean(transferWatchJourney),
      // A five-minute service-alert cadence is fine for a normal stop board,
      // but too slow for a committed connection that may disappear while the
      // passenger is already on leg 1.
      refreshIntervalMs: 60_000,
    }
  );
  const transferCancellations = useMemo(
    () =>
      transferServiceAlerts.filter(
        (alert) => alert.type === "cancellation"
      ),
    [transferServiceAlerts]
  );
  const transferCancellationProbe = transferSecondLeg
    ? {
        lineref: transferSecondLeg.lineRef,
        aimeddeparturetime:
          transferSecondLeg.aimedDepartureAt ||
          transferSecondLeg.departureAt,
        originaimeddeparturetime:
          transferSecondLeg.originAimedDepartureAt || undefined,
      }
    : null;
  const transferSecondCancelled =
    transferCancellationProbe &&
    isCancelledHere(transferCancellationProbe, transferCancellations);

  const ridingSelectedTransfer =
    Boolean(ride.session) &&
    Boolean(transferWatchJourney) &&
    pendingTransferJourneyRef.current?.id === transferWatchJourney?.id;
  const rideEtaSec = Number(ride.runtime?.etaSec);
  const transferIncomingArrivalAt =
    ridingSelectedTransfer &&
    Number.isFinite(rideEtaSec) &&
    rideEtaSec >= 0
      ? Math.floor(Date.now() / 1000 + rideEtaSec)
      : transferWatchJourney?.transferPlan?.first?.arrivalAt || null;
  const transferIncomingLiveState = ridingSelectedTransfer
    ? ride.runtime?.etaSource === "live"
      ? "live"
      : ride.runtime?.etaSource === "location"
        ? "delayed"
        : "schedule"
    : transferWatchJourney?.transferPlan?.first?.liveState || "unknown";

  const transferRevalidation = useTransferLegRevalidation({
    enabled: Boolean(transferWatchJourney),
    journey: transferWatchJourney,
    incomingArrivalAt: transferIncomingArrivalAt,
    incomingLiveState: transferIncomingLiveState,
    cancelled: transferSecondCancelled === true,
  });

  useEffect(() => {
    if (
      !transferWatchJourney ||
      transferRevalidation.providerState === "idle"
    ) {
      return;
    }

    if (
      selectedJourney?.id === transferWatchJourney.id &&
      selectedJourney.transferLeg === 1
    ) {
      revalidateTransfer(transferRevalidation);
    }

    if (
      ride.session &&
      pendingTransferJourneyRef.current?.id === transferWatchJourney.id
    ) {
      pendingTransferJourneyRef.current = applyTransferRevalidation(
        pendingTransferJourneyRef.current,
        transferRevalidation
      );
    }
  }, [
    revalidateTransfer,
    ride.session,
    selectedJourney,
    transferRevalidation,
    transferWatchJourney,
  ]);

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

  // A saved stop's chip leaves the list once its stop is open, so the
  // button pressed is gone. Focus goes to the board it opened, and a screen
  // reader starts at the new stop's name.
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
    const started = ride.startRide(config);
    if (started) {
      pendingTransferJourneyRef.current = pendingTransfer;
      pendingFinalWalkRef.current = nextFinalWalk;
      setFinalWalk(null);
      clearJourney();
      requestFocus(rideHeading);
    }
    return started;
  };

  // Turning the alert off, or getting off, takes the whole panel away with
  // the button in it. Focus goes back to the board, which is what is left.
  const endRide = () => {
    const pendingTransfer = pendingTransferJourneyRef.current;
    const continuedTransfer = pendingTransfer
      ? continueTransferAfterRide(pendingTransfer, ride.session)
      : null;
    const transferRecovery =
      pendingTransfer && !continuedTransfer
        ? recoverTransferAfterRide(pendingTransfer, ride.session)
        : null;
    const completed = completedFinalWalk(
      pendingFinalWalkRef.current,
      ride.session
    );
    pendingTransferJourneyRef.current = null;
    pendingFinalWalkRef.current = null;
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

  const currentStop = stopId
    ? {
        id: stopId,
        // Stored with a favourite, so never a stand-in.
        name: displayStopName,
      }
    : null;

  const dismissSharedPlace = () => {
    setSharedPlace(null);
    clearSharedPlaceHash();
  };

  const importSharedPlace = () => {
    if (!sharedPlace) return;
    savePlace(sharedPlace);
    dismissSharedPlace();
  };

  return (
    // The header and footer sit beside the main content, not inside it, so
    // they are the page's banner and contentinfo: inside <main> they were
    // neither, and a screen reader's landmark list had only "main".
    <div className="app-shell">
      <header className="topbar">
        <div className="brandLockup">
          {/* The favicon, and the source scripts/build-icons.mjs renders the
              home-screen and get-off notification icons from, so the mark
              someone tapped is the mark that greets them. Decorative here:
              the wordmark beside it already carries the name, so a second
              "Turku Departures" for a screen reader would only repeat it. */}
          <img
            className="brandMark"
            src={`${import.meta.env.BASE_URL}foli-icon.svg`}
            alt=""
            width="48"
            height="48"
            decoding="async"
          />
          <div className="brandText">
            {/* Turku is officially bilingual, and the pairing is itself a
                local signal. The independence disclaimer keeps its place in
                the footer; this line has one job, which is "you are here". */}
            {/* The language switch rides on this short line's spare end: in a
                row of its own it cost every phone screen a line of board. */}
            <div className="eyebrow-row">
              <p className="eyebrow">
                <span lang="fi">Turku</span> · <span lang="sv">Åbo</span>
              </p>
              <div className="header-controls">
                <ThemeSwitch />
                <LanguageSwitch />
              </div>
            </div>
            {/* The name stays English in either interface, and is read so.
                Before a stop is open it is the page's heading: a first
                visit had no h1 at all. With a stop open, the stop's name on
                the board is the h1, and a page has only one. */}
            {stopId ? (
              <p className="brand" lang="en">
                {PRODUCT_NAME}
              </p>
            ) : (
              <h1 id="app-title" className="brand" lang="en" tabIndex={-1}>
                {PRODUCT_NAME}
              </h1>
            )}
            <p
              className="context"
              data-firstrun={
                placesById.size === 0 && (firstVisit || !stopId) ? "true" : "false"
              }
            >
              {t("Live bus times, disruptions and get-off alerts.")}
            </p>
          </div>
        </div>
        {/* Out of sight, and always in the page, so a change of connection
            is announced: a live region added at that moment often is not.
            The Offline banner below is what the eye gets. */}
        <span className="live-pill" aria-live="polite">
          {online ? t("Online") : t("Offline mode")}
        </span>
      </header>

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
            transferJourney={
              pendingTransferJourneyRef.current?.transferPlan &&
              pendingTransferJourneyRef.current.transferLeg === 1
                ? pendingTransferJourneyRef.current
                : null
            }
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

        {!ride.session &&
          !finalWalk &&
          (!stopId || journey.destination) && (
          <JourneySearch
            compact={Boolean(stopId)}
            stops={stops}
            places={places}
            destination={journey.destination}
            coordinatesStatus={coordinatesStatus}
            online={online}
            onChoosePlace={chooseJourneyPlace}
            onChooseStop={chooseJourneyStop}
            onChooseExternalPlace={chooseJourneyExternalPlace}
            onClear={clearJourneyDestination}
          />
        )}

        {!ride.session && selectedJourney && (
          <ActiveJourney
            journey={selectedJourney}
            stop={selectedJourneyStop}
            online={online}
            monitoringState={selectedJourneyMonitoringState}
            onConfirmAtStop={confirmJourneyAtStop}
            onShowDeparture={showSelectedJourneyDeparture}
            onChooseAnother={chooseAnotherJourney}
            onOpenStop={openSelectedJourneyStop}
          />
        )}

        {!ride.session &&
          selectedJourney?.phase === "recovery" &&
          selectedJourney?.transferPlan && (
            <TransferRecoveryPanel
              state={online ? transferRecovery.state : "offline"}
              options={transferRecovery.options}
              destination={journey.destination}
              onSelectJourney={selectJourneyOption}
            />
          )}

        {/* One column on a phone. On a wide screen, Get me Home takes the
            left and search, saved stops and service updates the right, so
            the board starts on the first screen (App.css). */}
        <div className="top-section">
          {/* During a ride its route link would open Google Maps and leave
              the page the alert runs in. It comes back when the ride ends. */}
          {!ride.session && (
            <HomeRecovery
              home={placesById.get("home") || null}
              stops={stops}
              online={online}
              compact={Boolean(stopId)}
              onOpenStop={selectStop}
            />
          )}

          <section className="search-panel" aria-label={t("Choose a bus stop")}>
            <BusStopForm
              compact={Boolean(stopId) && !firstVisit}
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
              onStartRide={startRide}
              activeRideTripRef={ride.session?.tripRef || ""}
              cancellations={stopCancellations}
              unknownStop={unknownStop}
              online={online}
              lineNotices={lineNotices}
            />
          </>
        )}

        {/* Before a stop is chosen, location is the quickest way to one, and
            with no board yet this is where it lands. One instance in one place:
            a second copy for first visits unmounted under the passenger's
            finger as they chose a stop, dropping keyboard focus to the page
            and the list they had just found. */}
        {!transferRecoveryContext && (
          <NearbyStops
          stops={stops}
          coordinatesStatus={coordinatesStatus}
          activeStopId={stopId || ""}
          serviceBoundary={serviceBoundary}
          online={online}
          searchEdits={readSearchEdits}
          destination={journey.destination}
          excludedJourney={
            selectedJourney?.phase === "recovery" ? selectedJourney : null
          }
          onSelectJourney={selectJourneyOption}
          onSelectTransferJourney={selectTransferJourneyOption}
          onSelect={selectStop}
        />
        )}

        {!sharedPlace && (
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

      <footer className="source-note">
        <p className="source-line">
          {t("Independent app · Data: Föli open data")} ·{" "}
          <a href="https://data.foli.fi/" target="_blank" rel="noreferrer">
            data.foli.fi
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </p>

        <div className="maker-row">
          <span>
            {t("Built by")}{" "}
            <a
              href="https://github.com/MykolaDotsenko"
              target="_blank"
              rel="noreferrer"
            >
              {MAKER_NAME}
            </a>
          </span>
          <nav className="project-links" aria-label={t("Project links")}>
            <a
              href="mailto:docnikolaj1990@gmail.com?subject=Turku%20Departures%20feedback"
              aria-label={t("Contact the maker by email")}
            >
              {t("Contact")}
            </a>
            <a
              href="https://github.com/MykolaDotsenko/foli-live-departures/issues/new?template=bug_report.yml"
              target="_blank"
              rel="noreferrer"
            >
              {t("Report a problem (GitHub)")}
            </a>
            <a
              href="https://github.com/MykolaDotsenko/foli-live-departures"
              target="_blank"
              rel="noreferrer"
            >
              {t("Source code")}
            </a>
          </nav>
        </div>

        {/* Trust needs one place that says who makes this, what stays on
            the phone and what leaves it. The facts were spread over a
            dozen fine-print lines, and a one-line disclaimer was all a
            passenger saw without scrolling to the bottom. */}
        <div className="footer-actions">
          <HelpGuide />
          <details className="about">
            <summary>{t("About & privacy")}</summary>
          <dl>
            <dt>{t("Who makes it")}</dt>
            <dd>
              {t(
                "Turku Departures is an independent project by Mykola Dotsenko. It uses Föli open data but is not made by or affiliated with Föli or the City of Turku. For tickets and official journey planning, use Föli’s own services."
              )}{" "}
              {/* It is a companion to the official services, not a stand-in
                  for them, so it points the way. */}
              <a href="https://www.foli.fi/" target="_blank" rel="noreferrer">
                {t("Föli’s website")}
              </a>
            </dd>
            <dt>{t("Where the times come from")}</dt>
            <dd>
              {t(
                "Föli open data at data.foli.fi, under CC BY 4.0, as processed by this app. Live times are estimates from the buses and can change."
              )}
            </dd>
            <dt>{t("What stays on this phone")}</dt>
            <dd>
              {t(
                "Favourites, recent stops and when you last looked at them, each stop’s line filter, My Places (public stop numbers and names, never an address), the last few departure boards for up to 15 minutes, a ride in progress for up to six hours, and recent place-search results for this browser session only. Clearing this site’s data removes all of it."
              )}
            </dd>
            <dt>{t("What leaves the phone")}</dt>
            {/* One fact per entry: a single paragraph ran to 90 words. */}
            <dd>
              {t(
                "The app is loaded from GitHub Pages, which sees your IP address. The stops you look up and the buses whose stops you open are fetched from data.foli.fi, which sees your IP address and what was asked for. During a ride, so are your exit stop and the one before it."
              )}
            </dd>
            <dd>
              {t(
                "Your location is used to find a stop when you ask, and during a ride while Follow my location is on. It stays on the phone and is never saved."
              )}
            </dd>
            <dd>
              {t(
                "Direct address and place lookup is disabled in the production web app. Address and place text stays on this device, and the app offers the official Turku journey planner instead. Föli stop search remains available inside Turku Departures."
              )}
            </dd>
            <dd>
              {t(
                "Google Maps opens only when you tap a route link. It gets the stop you chose and may then use your location to plan the route."
              )}
            </dd>
            <dt>{t("What it doesn’t have")}</dt>
            <dd>{t("No account, no ads, no analytics.")}</dd>
          </dl>
          <LocalStateBackup />
          </details>
        </div>
      </footer>
    </div>
  );
}

export default App;
