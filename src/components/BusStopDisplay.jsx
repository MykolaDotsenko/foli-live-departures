import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./BusStopDisplay.module.css";
import BoardHeader from "./departureBoard/BoardHeader";
import {
  DepartureSummary,
  FreshnessNotice,
  LiveEstimatesLegend,
  ScheduleNotice,
} from "./departureBoard/BoardNotices";
import DepartureStates from "./departureBoard/DepartureStates";
import DepartureTable from "./departureBoard/DepartureTable";
import LineFilter from "./departureBoard/LineFilter";
import {
  MAX_VISIBLE_DEPARTURES,
  byDepartureTime,
  departedSetKey,
  departureKeys,
  isCancelledHere,
  upcomingDepartures,
} from "./departureBoard/departures";
import useClockTick from "../hooks/useClockTick";
import useDestinationBoardFits from "../hooks/useDestinationBoardFits";
import { arrivalMatchesActiveJourney } from "../utils/activeJourney";
import useLineFilter from "../hooks/useLineFilter";
import useLineTimetable from "../hooks/useLineTimetable";
import useTripEnrichment from "../hooks/useTripEnrichment";
import { mergeRealtimeAndScheduled } from "../utils/gtfsSchedule";
import { providerLanguages, t, useLanguage } from "../i18n";
import {
  advanceServerTime,
  elapsedSince,
  getDepartureTime,
} from "../utils/time";

// The departure board for one stop. It works out, from the latest answer
// and the clock, which buses are still to come and which of them the
// passenger follows here, and keeps the state that has to outlive a
// refresh: the open line filter and the get-off setup being filled in. The
// pieces it is drawn with live in ./departureBoard.

// A bus due within this long when the feed last listed it was leaving, not
// withdrawn, when the feed let it go.
const SETUP_HOLD_LEAVING_SECONDS = 120;

function BusStopDisplay({
  stopId,
  stopName,
  stop,
  stops = [],
  arrivals,
  routesById,
  routesByShortName,
  serverTime,
  receivedAtMs,
  realtimeAvailable,
  scheduleAvailable,
  scheduleFailed = false,
  scheduleIncomplete = false,
  loading,
  refreshing,
  error,
  onRefresh,
  isFavorite,
  onToggleFavorite,
  placesById,
  destination = null,
  selectedJourney = null,
  onStartRide,
  activeRideTripRef = "",
  cancellations = [],
  unknownStop = false,
  online = true,
  lineNotices = null,
}) {
  const language = useLanguage();
  // Keeps due times, freshness and the departed-row filter counting between
  // the 30-second provider refreshes instead of freezing at the last payload.
  const nowMs = useClockTick(10_000);
  const effectiveServerTime =
    advanceServerTime(serverTime, receivedAtMs, nowMs) ??
    Math.floor(nowMs / 1000);
  const receiptAgeSeconds = elapsedSince(receivedAtMs, nowMs);
  const dataIsStale =
    receiptAgeSeconds !== null && receiptAgeSeconds > 120;
  const referenceTime = effectiveServerTime;
  // Every departure still ahead, whatever the line filter shows.
  const upcomingArrivals = upcomingDepartures(arrivals, referenceTime);
  // A commuter waiting for the 32 at a busy stop saw mostly other lines, and
  // the 32 after next not at all. The lines followed here are kept per stop.
  const [followedLines, setFollowedLines] = useLineFilter(stopId);
  const [lineFilterOpen, setLineFilterOpen] = useState(false);
  const linesOnOffer = [
    ...new Set([
      ...upcomingArrivals.map((arrival) => String(arrival.lineref || "")),
      ...followedLines,
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // Whether this stop has had a departure answer at all, fresh or saved. The
  // stop's name is not one: the catalogue names the stop long before its board
  // first loads, and counting it said "No upcoming departures" while loading,
  // and again when the load failed.
  const hasData = arrivals.length > 0 || Number(receivedAtMs) > 0;
  // Offline, every time below is from the last answer, and says so at once
  // instead of after two minutes.
  const offlineSince = !online && hasData && serverTime ? serverTime : null;
  // A followed line with no row here may still run: the live feed looks an
  // hour or so ahead, so an hourly line at a busy stop was missing while it
  // ran and the board said it had none. Its next buses come from the
  // timetable instead.
  // A cancelled row is no departure: an hourly line whose next bus was
  // cancelled showed only "Cancelled", and nothing of the one after it.
  const linesMissing = followedLines.filter(
    (line) =>
      !upcomingArrivals.some(
        (arrival) =>
          String(arrival.lineref || "") === line &&
          !isCancelledHere(arrival, cancellations)
      )
  );
  const lineTimetable = useLineTimetable(
    hasData ? stopId : "",
    linesMissing,
    referenceTime
  );
  const timetableRows = lineTimetable.rows.filter(
    (row) =>
      linesMissing.includes(String(row.lineref || "")) &&
      getDepartureTime(row, referenceTime) >= referenceTime - 30
  );
  // The timetable lists a cancelled bus too, and its live row stays on the
  // board as "Cancelled": the same bus is not shown twice.
  const listedArrivals = (
    followedLines.length > 0
      ? mergeRealtimeAndScheduled(
          upcomingArrivals.filter((arrival) =>
            followedLines.includes(String(arrival.lineref || ""))
          ),
          timetableRows
        ).sort(byDepartureTime(referenceTime))
      : upcomingArrivals
  ).slice(0, MAX_VISIBLE_DEPARTURES);
  const [rideCandidateKey, setRideCandidateKey] = useState("");
  // The departure the open get-off setup belongs to, as last listed, and the
  // board time of the answer that listed it.
  const [setupDeparture, setSetupDeparture] = useState(null);
  // An open setup belongs to the stop it was opened at, so it is dropped the
  // moment the stop changes and coming back later does not reopen it. The
  // board itself stays mounted: remounting it for a stop change dropped
  // keyboard focus and the live region that announces the stop.
  const [candidateStopId, setCandidateStopId] = useState(stopId);
  if (candidateStopId !== stopId) {
    setCandidateStopId(stopId);
    setRideCandidateKey("");
    setSetupDeparture(null);
    setLineFilterOpen(false);
  }
  // A passenger sets up the alert for the bus they are boarding, so it is
  // often still open as that bus pulls away. Half a minute after it left its
  // row went, and the setup with it, stop chosen and all, before Start. The
  // row stays while its setup is open: as the feed lists it, departed or
  // not, and if the feed has let it go altogether, as it was last listed,
  // since that is still the bus the passenger is on and the setup needs
  // nothing newer to start the ride. That last case only for a bus that was
  // leaving when last seen: one still minutes away that drops out of the
  // feed was withdrawn or replaced, and its setup goes with it as before.
  // Only while the setup is open, and only on this stop's board: Start and
  // Cancel close it, and so does a stop change. A row the line filter hides
  // is not held: the passenger hid it.
  const listedKeys = departureKeys(listedArrivals, referenceTime, stopId);
  const listedIndex = rideCandidateKey
    ? listedKeys.indexOf(rideCandidateKey)
    : -1;
  const feedArrival =
    listedIndex >= 0
      ? listedArrivals[listedIndex]
      : rideCandidateKey
        ? arrivals.find(
            (arrival) =>
              departureKeys([arrival], referenceTime, stopId)[0] ===
              rideCandidateKey
          )
        : undefined;
  if (!rideCandidateKey) {
    if (setupDeparture) setSetupDeparture(null);
  } else if (
    feedArrival &&
    (setupDeparture?.key !== rideCandidateKey ||
      setupDeparture.arrival !== feedArrival)
  ) {
    setSetupDeparture({
      key: rideCandidateKey,
      arrival: feedArrival,
      seenAt: referenceTime,
    });
  }
  const lastSeenLeaving =
    setupDeparture?.key === rideCandidateKey &&
    getDepartureTime(setupDeparture.arrival, setupDeparture.seenAt) <=
      setupDeparture.seenAt + SETUP_HOLD_LEAVING_SECONDS;
  const heldArrival =
    listedIndex >= 0
      ? null
      : feedArrival ?? (lastSeenLeaving ? setupDeparture.arrival : null);
  const holdsSetupRow =
    Boolean(heldArrival) &&
    (followedLines.length === 0 ||
      followedLines.includes(String(heldArrival.lineref || "")));

  // A saved line filter is a convenience, never stronger than an explicit
  // journey choice. Keep the selected concrete trip visible even when the
  // passenger's old filter would otherwise hide its line. This exception is
  // one row only; all other departures still obey the filter.
  const selectedJourneyFeedArrival =
    selectedJourney?.stopId === stopId
      ? arrivals.find((arrival) =>
          arrivalMatchesActiveJourney(arrival, selectedJourney)
        ) || null
      : null;
  const forcedArrivals = [];
  if (holdsSetupRow && heldArrival) forcedArrivals.push(heldArrival);
  if (
    selectedJourneyFeedArrival &&
    !listedArrivals.includes(selectedJourneyFeedArrival) &&
    !forcedArrivals.includes(selectedJourneyFeedArrival)
  ) {
    forcedArrivals.push(selectedJourneyFeedArrival);
  }

  const visibleArrivals =
    forcedArrivals.length > 0
      ? [
          ...forcedArrivals,
          ...listedArrivals.filter(
            (arrival) => !forcedArrivals.includes(arrival)
          ),
        ].slice(0, MAX_VISIBLE_DEPARTURES)
      : listedArrivals;
  // A forced row still belongs to the passenger's immediate decision even
  // when it has just crossed the generic 30-second upcoming cutoff. Count each
  // distinct forced-past row once so DepartureStates keeps the table visible
  // during setup/selected-journey grace without redefining normal departures.
  const forcedPastCount = forcedArrivals.filter(
    (arrival) => !upcomingArrivals.includes(arrival)
  ).length;
  const upcomingCount = upcomingArrivals.length + forcedPastCount;
  // Only an answer that itself listed nothing says nothing is coming. One
  // whose buses have all left since says nothing about what comes after
  // them: the timetable was never asked, because they were still ahead.
  const answerWasEmpty = hasData && arrivals.length === 0;
  // The filter hiding them is not them leaving.
  const listedBusesHaveLeft =
    arrivals.length > 0 && upcomingArrivals.length === 0;
  // So ask again as the last one leaves, instead of calling the stop empty
  // until the next poll half a minute later. Once per set of departed buses,
  // not per answer: at the end of the day the feed can keep listing a bus
  // that has gone, and every answer would have asked again at once.
  const departedSet = listedBusesHaveLeft ? departedSetKey(arrivals) : "";
  const askedAfterDepartedRef = useRef("");
  useEffect(() => {
    if (!departedSet || loading || refreshing || error) return;
    if (askedAfterDepartedRef.current === departedSet) return;
    askedAfterDepartedRef.current = departedSet;
    onRefresh?.();
  }, [departedSet, error, loading, onRefresh, refreshing]);
  const realtimeCount = visibleArrivals.filter(
    (arrival) => arrival.monitored
  ).length;
  const tripDetailsById = useTripEnrichment(visibleArrivals);
  const stopsById = useMemo(
    () => new Map(stops.map((candidate) => [candidate.id, candidate])),
    [stops]
  );
  // Whose name for the destination goes beside the sign: none in Finnish,
  // where the sign already is.
  const preferredLanguages = useMemo(
    () => providerLanguages(language),
    [language]
  );
  const rowKeys = departureKeys(visibleArrivals, referenceTime, stopId);
  const { fitsByRowKey: destinationFitsByKey, state: destinationFitState } =
    useDestinationBoardFits({
      stopId,
      arrivals: visibleArrivals,
      rowKeys,
      destination,
    });

  const destinationRows = visibleArrivals.map((arrival, index) => ({
    arrival,
    rowKey: rowKeys[index],
    fit: destinationFitsByKey[rowKeys[index]] || null,
    selected:
      selectedJourney?.stopId === stopId &&
      arrivalMatchesActiveJourney(arrival, selectedJourney),
    originalIndex: index,
  }));

  if (
    selectedJourney?.stopId === stopId ||
    (destination && destinationFitState === "ready")
  ) {
    destinationRows.sort((left, right) => {
      const leftRank = left.selected
        ? 0
        : left.fit?.status === "compatible"
          ? 1
          : 2;
      const rightRank = right.selected
        ? 0
        : right.fit?.status === "compatible"
          ? 1
          : 2;
      return leftRank - rightRank || left.originalIndex - right.originalIndex;
    });
  }

  const displayedArrivals = destinationRows.map((item) => item.arrival);
  const displayedRowKeys = destinationRows.map((item) => item.rowKey);
  const destinationLabel = destination
    ? destination.kind === "saved-place"
      ? t(destination.label)
      : destination.label
    : "";

  const filterable = linesOnOffer.length > 1 && upcomingArrivals.length > 0;
  const showAllLines = () => setFollowedLines([]);
  const toggleRideSetup = (rideKey) =>
    setRideCandidateKey((current) => (current === rideKey ? "" : rideKey));
  const closeRideSetup = () => setRideCandidateKey("");

  return (
    <section
      className={styles.board}
      aria-labelledby="departures-title"
      aria-busy={loading || refreshing}
    >
      <BoardHeader
        stopId={stopId}
        stopName={stopName}
        loading={loading}
        refreshing={refreshing}
        serverTime={serverTime}
        receiptAgeSeconds={receiptAgeSeconds}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        filterable={filterable}
        followedLines={followedLines}
        lineFilterOpen={lineFilterOpen}
        onToggleLineFilter={() => setLineFilterOpen((open) => !open)}
        onRefresh={onRefresh}
        unknownStop={unknownStop}
      />

      {upcomingCount > 0 && (
        <DepartureSummary
          visibleCount={visibleArrivals.length}
          realtimeCount={realtimeCount}
        />
      )}

      {lineFilterOpen && filterable && (
        <LineFilter
          linesOnOffer={linesOnOffer}
          followedLines={followedLines}
          onFollowedLinesChange={setFollowedLines}
          routesByShortName={routesByShortName}
        />
      )}

      {(offlineSince !== null || ((error || dataIsStale) && hasData)) && (
        <FreshnessNotice
          offlineSince={offlineSince}
          error={error}
          receiptAgeSeconds={receiptAgeSeconds}
        />
      )}

      {scheduleAvailable &&
        visibleArrivals.length > 0 &&
        realtimeCount === 0 && (
          <ScheduleNotice
            realtimeAvailable={realtimeAvailable}
            scheduleIncomplete={scheduleIncomplete}
          />
        )}

      <DepartureStates
        stopId={stopId}
        loading={loading}
        unknownStop={unknownStop}
        error={error}
        answerWasEmpty={answerWasEmpty}
        scheduleFailed={scheduleFailed}
        scheduleIncomplete={scheduleIncomplete}
        upcomingCount={upcomingCount}
        visibleCount={visibleArrivals.length}
        followedLines={followedLines}
        timetableStatus={lineTimetable.status}
        onRetryTimetable={lineTimetable.retry}
        onRefresh={onRefresh}
        onShowAllLines={showAllLines}
      >
        {destination && destinationFitState === "ready" && (
          <p className={styles.destinationBoardNote}>
            {t("Trips to {destination} are shown first. Other departures stay below.", {
              destination: destinationLabel,
            })}
          </p>
        )}

        <DepartureTable
          timesAreOld={offlineSince !== null || (dataIsStale && hasData)}
          arrivals={displayedArrivals}
          rowKeys={displayedRowKeys}
          destination={destination}
          selectedJourney={selectedJourney}
          destinationFitsByKey={destinationFitsByKey}
          referenceTime={referenceTime}
          effectiveServerTime={effectiveServerTime}
          tripDetailsById={tripDetailsById}
          routesById={routesById}
          routesByShortName={routesByShortName}
          online={online}
          stop={stop}
          stopId={stopId}
          stopName={stopName}
          stopsById={stopsById}
          placesById={placesById}
          preferredLanguages={preferredLanguages}
          cancellations={cancellations}
          lineNotices={lineNotices}
          rideCandidateKey={rideCandidateKey}
          activeRideTripRef={activeRideTripRef}
          onToggleRideSetup={toggleRideSetup}
          onCloseRideSetup={closeRideSetup}
          onStartRide={onStartRide}
        />
      </DepartureStates>

      {visibleArrivals.length > 0 && <LiveEstimatesLegend />}
    </section>
  );
}

export default BusStopDisplay;
