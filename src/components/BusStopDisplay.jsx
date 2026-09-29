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
import useLineFilter from "../hooks/useLineFilter";
import useLineTimetable from "../hooks/useLineTimetable";
import useTripEnrichment from "../hooks/useTripEnrichment";
import { mergeRealtimeAndScheduled } from "../utils/gtfsSchedule";
import { providerLanguages, useLanguage } from "../i18n";
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
  const visibleArrivals = (
    followedLines.length > 0
      ? mergeRealtimeAndScheduled(
          upcomingArrivals.filter((arrival) =>
            followedLines.includes(String(arrival.lineref || ""))
          ),
          timetableRows
        ).sort(byDepartureTime(referenceTime))
      : upcomingArrivals
  ).slice(0, MAX_VISIBLE_DEPARTURES);
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
  const [rideCandidateKey, setRideCandidateKey] = useState("");
  // An open setup belongs to the stop it was opened at, so it is dropped the
  // moment the stop changes and coming back later does not reopen it. The
  // board itself stays mounted: remounting it for a stop change dropped
  // keyboard focus and the live region that announces the stop.
  const [candidateStopId, setCandidateStopId] = useState(stopId);
  if (candidateStopId !== stopId) {
    setCandidateStopId(stopId);
    setRideCandidateKey("");
    setLineFilterOpen(false);
  }
  const rowKeys = departureKeys(visibleArrivals, referenceTime, stopId);

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
      />

      {upcomingArrivals.length > 0 && (
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
        upcomingCount={upcomingArrivals.length}
        visibleCount={visibleArrivals.length}
        followedLines={followedLines}
        timetableStatus={lineTimetable.status}
        onRetryTimetable={lineTimetable.retry}
        onRefresh={onRefresh}
        onShowAllLines={showAllLines}
      >
        <DepartureTable
          timesAreOld={offlineSince !== null || (dataIsStale && hasData)}
          arrivals={visibleArrivals}
          rowKeys={rowKeys}
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
