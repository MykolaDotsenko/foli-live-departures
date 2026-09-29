import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import styles from "./BusStopDisplay.module.css";
import TripJourneyDetails from "./TripJourneyDetails";
import RideSetup from "./RideSetup";
import useClockTick from "../hooks/useClockTick";
import useLineFilter from "../hooks/useLineFilter";
import useLineTimetable from "../hooks/useLineTimetable";
import useTripEnrichment from "../hooks/useTripEnrichment";
import { mergeRealtimeAndScheduled } from "../utils/gtfsSchedule";
import { msg, providerLanguages, t, tc, useLanguage } from "../i18n";
import { distanceInMeters, formatDistance, hasCoordinates } from "../utils/geo";
import { accessibleRouteTextColor, contrastRatio } from "../utils/routes";
import {
  advanceServerTime,
  dataAgeSeconds,
  elapsedSince,
  formatClock,
  formatDueParts,
  formatElapsedAge,
  formatServiceStatus,
  getDepartureTime,
} from "../utils/time";

const MAX_VISIBLE_DEPARTURES = 10;
const DEPARTED_GRACE_SECONDS = 30;

// Each vehicle has its own phrases: in Finnish a bus and a waterbus stop at
// different places, and their names inflect.
const VEHICLE_PHRASES = {
  bus: {
    atStop: msg("Bus is at the stop"),
    lastPosition: msg("Last bus position ≈{distance} from stop · {minutes} min old"),
    atOrNear: msg("Bus at or near stop"),
    nearby: msg("Bus nearby · ≈{distance} from stop"),
    away: msg("Bus ≈{distance} from stop"),
  },
  waterbus: {
    atStop: msg("Waterbus is at the stop"),
    lastPosition: msg(
      "Last waterbus position ≈{distance} from stop · {minutes} min old"
    ),
    atOrNear: msg("Waterbus at or near stop"),
    nearby: msg("Waterbus nearby · ≈{distance} from stop"),
    away: msg("Waterbus ≈{distance} from stop"),
  },
};

function vehicleProximity(arrival, stop, route, serverTime) {
  if (!arrival.monitored) return "";

  const phrases = VEHICLE_PHRASES[route?.type === 4 ? "waterbus" : "bus"];
  const ageSeconds = dataAgeSeconds(arrival.recordedattime, serverTime);

  // ETA can still be realtime when the provider omitted the physical sample
  // timestamp, but position/at-stop telemetry of unknown age is not safe to
  // present as current. Ride Mode uses the same freshness boundary.
  if (ageSeconds === null) return "";

  if (arrival.vehicleatstop === true && ageSeconds <= 120) {
    return t(phrases.atStop);
  }

  if (
    !hasCoordinates(stop) ||
    !hasCoordinates({ lat: arrival.latitude, lon: arrival.longitude })
  ) {
    return "";
  }

  const distance = distanceInMeters(
    { lat: arrival.latitude, lon: arrival.longitude },
    stop
  );
  if (!Number.isFinite(distance)) return "";

  if (ageSeconds !== null && ageSeconds > 120) {
    return t(phrases.lastPosition, {
      distance: formatDistance(distance),
      minutes: Math.max(2, Math.round(ageSeconds / 60)),
    });
  }

  if (distance <= 50) return t(phrases.atOrNear);
  if (distance <= 250) {
    return t(phrases.nearby, { distance: formatDistance(distance) });
  }

  return t(phrases.away, { distance: formatDistance(distance) });
}

// A departure keeps one identity across refreshes. The live estimate moves on
// nearly every poll and the index moves whenever an earlier bus leaves, so a
// row keyed on either was remounted: an open "Next stops" list or get-off
// setup closed mid-choice, taking the chosen stop with it. The planned time
// stays put, and still tells two visits of one looping trip apart. The stop
// is part of it too: a neighbouring stop can list the same trip under the
// same planned minute, and its row must not inherit this one's open panels.
function departureKeys(arrivals, referenceTime, stopId) {
  const seen = new Map();

  return arrivals.map((arrival) => {
    const planned =
      Number(arrival.aimeddeparturetime) ||
      Number(arrival.aimedarrivaltime) ||
      getDepartureTime(arrival, referenceTime);
    const identity = [
      stopId,
      arrival.lineref,
      arrival.tripref || arrival.destinationdisplay,
      planned,
    ].join("-");
    // Identical rows would be a feed quirk, but keys must still be unique.
    const repeat = seen.get(identity) || 0;
    seen.set(identity, repeat + 1);

    return repeat === 0 ? identity : `${identity}#${repeat}`;
  });
}

// Föli cancels a departure stop by stop (ALERTS cancellations, each with the
// line and the stop's planned arrival, active from about ten minutes
// before it). A row matches when its line and planned time agree.
const CANCELLATION_MATCH_SECONDS = 90;
const CANCELLATION_ORIGIN_MATCH_SECONDS = 30;

function isCancelledHere(arrival, cancellations) {
  if (!Array.isArray(cancellations) || cancellations.length === 0) return false;

  const planned =
    Number(arrival.aimedarrivaltime) || Number(arrival.aimeddeparturetime);
  if (!Number.isFinite(planned) || planned <= 0) return false;

  return cancellations.some((cancellation) => {
    if (
      String(cancellation?.line || "") !== String(arrival.lineref || "") ||
      !Number.isFinite(Number(cancellation?.scheduledTime)) ||
      Math.abs(Number(cancellation.scheduledTime) - planned) >
        CANCELLATION_MATCH_SECONDS
    ) {
      return false;
    }

    const cancellationOrigin = Number(cancellation?.originDepartureTime);
    const arrivalOrigin = Number(arrival?.originaimeddeparturetime);
    const hasCancellationOrigin =
      Number.isFinite(cancellationOrigin) && cancellationOrigin > 0;
    const hasArrivalOrigin = Number.isFinite(arrivalOrigin) && arrivalOrigin > 0;

    // The provider exposes the planned trip-origin departure in both ALERTS
    // and SIRI. When both sides have it, use that stronger run identity so a
    // neighbouring same-line departure inside the 90-second stop-time window
    // cannot inherit the cancellation. Keep the stop-time fallback for
    // schedule-only rows and older/partial provider payloads.
    if (hasCancellationOrigin && hasArrivalOrigin) {
      return (
        Math.abs(cancellationOrigin - arrivalOrigin) <=
        CANCELLATION_ORIGIN_MATCH_SECONDS
      );
    }

    return true;
  });
}

function routeBadgeStyle(route) {
  if (!route?.color) return undefined;

  // A route colour close to white (line 1's yellow is 1.07:1 against the
  // row) leaves the badge with no edge, so it gets a hairline outline.
  const blendsIntoRow = (contrastRatio(route.color, "#ffffff") ?? 21) < 1.5;

  return {
    backgroundColor: route.color,
    color: accessibleRouteTextColor(route.color, route.textColor || "#ffffff"),
    ...(blendsIntoRow
      ? { boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.22)" }
      : {}),
  };
}



// The row leads with the name on the bus's own sign, which is the Finnish one.
// A reader whose language Föli also names the destination in gets that name
// beside it, never instead of it: "Harbour" alone gave an English reader
// nothing to match against the "Satama" on the bus pulling in.
function destinationNames(arrival, preferredLanguages) {
  const sign =
    arrival.destinationdisplay ||
    arrival.destinationdisplay_en ||
    arrival.destinationdisplay_sv ||
    "";
  // Marked, so an English screen reader says "Satama" as a Finn would.
  const signLang = arrival.destinationdisplay
    ? "fi"
    : arrival.destinationdisplay_en
      ? "en"
      : arrival.destinationdisplay_sv
        ? "sv"
        : "";

  for (const language of preferredLanguages) {
    const base = String(language || "").toLowerCase().split("-")[0];
    // The sign is already in a Finnish reader's language.
    if (base === "fi") break;

    const translated =
      base === "sv"
        ? arrival.destinationdisplay_sv
        : base === "en"
          ? arrival.destinationdisplay_en
          : "";
    if (!translated) continue;

    const repeatsSign =
      translated.trim().toLocaleLowerCase() === sign.trim().toLocaleLowerCase();
    return {
      sign,
      signLang,
      translation: repeatsSign ? "" : translated,
      lang: base,
    };
  }

  return { sign, signLang, translation: "", lang: "" };
}

function wheelchairLabel(value) {
  if (value === 1) return t("Wheelchair accessible");
  if (value === 2) return t("Not wheelchair accessible");
  return "";
}

// "Today 19:15" and "Tomorrow 06:30" set in the countdown's size would take
// half a phone's width from the destination, so the day sits above the time.
// Under a countdown, the clock time it counts to, as a stop display shows
// it: moved out of the line beside the destination, which it made wrap.
function DueLabel({ parts, clock = "" }) {
  if (!parts.day) {
    return (
      <>
        {parts.time}
        {clock && clock !== "—" && (
          <>
            {" "}
            <span className={styles.dueClock}>{clock}</span>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <span className={styles.dueDay}>{parts.day}</span> {parts.time}
    </>
  );
}

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
  const upcomingArrivals = [...arrivals]
    .filter((arrival) => {
      const departureTime = getDepartureTime(arrival, referenceTime);
      return (
        Number.isFinite(departureTime) &&
        departureTime >= referenceTime - DEPARTED_GRACE_SECONDS
      );
    })
    .sort(
      (a, b) =>
        getDepartureTime(a, referenceTime) - getDepartureTime(b, referenceTime)
    );
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
        ).sort(
          (a, b) =>
            getDepartureTime(a, referenceTime) - getDepartureTime(b, referenceTime)
        )
      : upcomingArrivals
  ).slice(0, MAX_VISIBLE_DEPARTURES);
  const toggleLine = (line) =>
    setFollowedLines(
      followedLines.includes(line)
        ? followedLines.filter((followed) => followed !== line)
        : [...followedLines, line]
    );
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
  const departedSet = listedBusesHaveLeft
    ? arrivals
        .map((arrival) =>
          [
            arrival.lineref,
            arrival.tripref || arrival.datedvehiclejourneyref || "",
            Number(arrival.aimeddeparturetime) ||
              Number(arrival.aimedarrivaltime) ||
              "",
          ].join("|")
        )
        .sort()
        .join(",")
    : "";
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

  return (
    <section
      className={styles.board}
      aria-labelledby="departures-title"
      aria-busy={loading || refreshing}
    >
      <header
        className={styles.header}
        data-filterable={filterable ? "true" : "false"}
      >
        <div className={styles.stopHeading}>
          <div className={styles.stopTitleRow}>
            <h1 id="departures-title" className={styles.stopName}>
              {stopName ? (
                <span lang="fi">{stopName}</span>
              ) : loading ? (
                t("Loading…")
              ) : (
                t("Stop {id}", { id: stopId })
              )}
            </h1>
            {stopName && (
              <button
                type="button"
                className={styles.favoriteButton}
                onClick={onToggleFavorite}
                aria-pressed={isFavorite}
                aria-label={
                  isFavorite
                    ? t("Remove {name} from favourites", { name: stopName })
                    : t("Save {name} to favourites", { name: stopName })
                }
                title={isFavorite ? t("Remove favourite") : t("Save favourite")}
              >
                <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
              </button>
            )}
          </div>
          <p className={styles.stopMeta} aria-live="polite">
            {[
              t("Stop {id}", { id: stopId }),
              serverTime ? t("Updated {time}", { time: formatClock(serverTime) }) : "",
              receiptAgeSeconds !== null && receiptAgeSeconds >= 60
                ? formatElapsedAge(receiptAgeSeconds)
                : "",
              refreshing ? t("Refreshing…") : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Beside the stop's name, not in a row of its own: on an iPhone
            with the service updates open, that row pushed the first
            departure off the screen. */}
        <div className={styles.headerActions}>
          {filterable && (
            <button
              type="button"
              className={styles.filterButton}
              aria-expanded={lineFilterOpen}
              aria-controls="line-filter"
              data-active={followedLines.length > 0 ? "true" : "false"}
              onClick={() => setLineFilterOpen((open) => !open)}
            >
              {followedLines.length === 1
                ? t("Only line {line}", { line: followedLines[0] })
                : followedLines.length > 1
                  ? t("Only lines {lines}", { lines: followedLines.join(", ") })
                  : t("Filter lines")}
            </button>
          )}
          <button
            type="button"
            className={styles.refreshButton}
            onClick={onRefresh}
            disabled={loading || refreshing}
          >
            {refreshing ? t("Refreshing…") : t("Refresh")}
          </button>
        </div>
      </header>

      {upcomingArrivals.length > 0 && (
        <div
          className={styles.summary}
          aria-label={t("Departure data summary")}
        >
          <span>{t("{count} upcoming", { count: visibleArrivals.length })}</span>
          <span>
            <strong>{realtimeCount}</strong>{" "}
            {t("live", { count: realtimeCount })}
          </span>
          <span>
            {t("{count} scheduled", {
              count: visibleArrivals.length - realtimeCount,
            })}
          </span>
        </div>
      )}

      {lineFilterOpen && filterable && (
        <div
          id="line-filter"
          className={styles.lineFilter}
          role="group"
          aria-label={t("Show only these lines")}
        >
          <button
            type="button"
            className={styles.lineChip}
            aria-pressed={followedLines.length === 0}
            onClick={() => setFollowedLines([])}
          >
            {t("All lines")}
          </button>
          {linesOnOffer.map((line) => {
            const followed = followedLines.includes(line);
            return (
              <button
                key={line}
                type="button"
                className={styles.lineChip}
                aria-pressed={followed}
                aria-label={t("Line {line}", { line })}
                onClick={() => toggleLine(line)}
              >
                <span
                  className={styles.lineChipBadge}
                  style={routeBadgeStyle(routesByShortName?.get(line))}
                  aria-hidden="true"
                >
                  {line}
                </span>
                {followed && (
                  <span className={styles.lineChipCheck} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!online && hasData && serverTime ? (
        // Offline, every time below is from the last answer, and says so at
        // once instead of after two minutes.
        <p className={styles.staleNotice} role="status">
          {t("Offline · last updated {time}", { time: formatClock(serverTime) })}
        </p>
      ) : (error || dataIsStale) && hasData && (
        <p className={styles.staleNotice} role="status">
          {error ? t("Live update failed") : t("Live data is getting old")}
          {receiptAgeSeconds !== null
            ? ` · ${t("last successful update {age}", {
                age: formatElapsedAge(receiptAgeSeconds),
              })}`
            : ""}
        </p>
      )}

      {scheduleAvailable &&
        visibleArrivals.length > 0 &&
        realtimeCount === 0 && (
          <p className={styles.staleNotice} role="status">
            {realtimeAvailable === false
              ? t("Live updates are unavailable · showing scheduled Föli times.")
              : t(
                  "No live departure is published right now · showing the next scheduled Föli times."
                )}
            {scheduleIncomplete
              ? ` ${t(
                  "Later departures could not be checked, so more buses may run after these."
                )}`
              : ""}
          </p>
        )}

      {/* An empty board is only "no more buses" when a fresh answer says so.
          A saved board whose buses have all left is no answer: while this
          visit's first update loads, or after it fails, it said "No upcoming
          departures" about a stop nobody had checked. */}
      {loading && upcomingArrivals.length === 0 ? (
        <div className={styles.state} role="status">
          <span className={styles.stateKicker}>{t("Connecting to Föli")}</span>
          <strong>{t("Loading departures…")}</strong>
        </div>
      ) : unknownStop && upcomingArrivals.length === 0 ? (
        // Not an empty stop: a number Föli's stop list does not have.
        <div className={styles.state} role="status">
          <strong>{t("Föli has no stop {id}.", { id: stopId })}</strong>
          <span>{t("Check the number, or search by the stop’s name.")}</span>
        </div>
      ) : error && upcomingArrivals.length === 0 && !answerWasEmpty ? (
        <div className={styles.state} role="alert">
          <strong>{t("Couldn’t load departures.")}</strong>
          <span>{t("Föli’s live times aren’t loading right now. Try again in a moment.")}</span>
          <button type="button" className={styles.retryButton} onClick={onRefresh}>
            {t("Try again")}
          </button>
        </div>
      ) : upcomingArrivals.length === 0 && (scheduleFailed || scheduleIncomplete) ? (
        // The live feed only looks an hour or so ahead. With the timetable
        // unread, or read only up to a trip that could not be checked, an
        // empty board is not "no more buses".
        <div className={styles.state} role="status">
          <strong>{t("No live departures right now.")}</strong>
          <span>
            {t(
              "The timetable could not be checked just now, so later buses may still run."
            )}
          </span>
          <button type="button" className={styles.retryButton} onClick={onRefresh}>
            {t("Try again")}
          </button>
        </div>
      ) : upcomingArrivals.length === 0 && !answerWasEmpty ? (
        <div className={styles.state} role="status">
          <span className={styles.stateKicker}>{t("Updating")}</span>
          <strong>{t("Checking for the next departures…")}</strong>
        </div>
      ) : upcomingArrivals.length === 0 ? (
        <div className={styles.state} role="status">
          <strong>{t("No upcoming departures.")}</strong>
          <span>{t("Try refreshing or choosing another nearby stop.")}</span>
        </div>
      ) : visibleArrivals.length === 0 &&
        (loading || lineTimetable.status === "loading") ? (
        // Buses are leaving here, and the followed lines' timetable is on
        // its way: nothing is known about them yet.
        <div className={styles.state} role="status">
          <span className={styles.stateKicker}>{t("Updating")}</span>
          <strong>
            {followedLines.length === 1
              ? t("Checking the timetable for line {line}…", {
                  line: followedLines[0],
                })
              : t("Checking the timetable for lines {lines}…", {
                  lines: followedLines.join(", "),
                })}
          </strong>
        </div>
      ) : visibleArrivals.length === 0 &&
        (error || lineTimetable.status === "error") ? (
        // Neither the live feed nor the timetable could say, so no claim
        // that the line is not running.
        <div className={styles.state} role="status">
          <strong>
            {followedLines.length === 1
              ? t("Line {line} is not in Föli’s live times right now.", {
                  line: followedLines[0],
                })
              : t("Lines {lines} are not in Föli’s live times right now.", {
                  lines: followedLines.join(", "),
                })}
          </strong>
          <span>
            {t("Its timetable could not be checked either, so buses may still run.")}
          </span>
          <div className={styles.stateActions}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                lineTimetable.retry();
                onRefresh?.();
              }}
            >
              {t("Try again")}
            </button>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => setFollowedLines([])}
            >
              {t("Show all lines")}
            </button>
          </div>
        </div>
      ) : visibleArrivals.length === 0 ? (
        // Buses are leaving here, and the timetable has nothing on the lines
        // followed either.
        <div className={styles.state} role="status">
          <strong>
            {followedLines.length === 1
              ? t("No departures on line {line} from this stop in the next 36 hours.", {
                  line: followedLines[0],
                })
              : t("No departures on lines {lines} from this stop in the next 36 hours.", {
                  lines: followedLines.join(", "),
                })}
          </strong>
          <span>{t("Other lines are leaving from this stop.")}</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setFollowedLines([])}
          >
            {t("Show all lines")}
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("Line")}</th>
                <th scope="col">{t("Destination")}</th>
                <th scope="col">{tc("column", "Due")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleArrivals.map((arrival, index) => {
                const departureTime = getDepartureTime(arrival, referenceTime);
                const tripDetails = arrival.tripref
                  ? tripDetailsById.get(arrival.tripref)
                  : null;
                const route =
                  (tripDetails?.routeId
                    ? routesById?.get(tripDetails.routeId)
                    : null) ||
                  routesByShortName?.get(arrival.lineref);
                const serviceStatus = formatServiceStatus(
                  arrival.monitored,
                  arrival.delay,
                  arrival.recordedattime,
                  effectiveServerTime,
                  { offline: !online }
                );
                // "Bus at stop · board now", read off a saved answer, may
                // be long gone.
                const proximity = online
                  ? vehicleProximity(arrival, stop, route, effectiveServerTime)
                  : "";
                const destinationName = destinationNames(
                  arrival,
                  preferredLanguages
                );
                const destination =
                  destinationName.sign ||
                  tripDetails?.headsign ||
                  t("Unknown destination");
                const destinationLang = destinationName.sign
                  ? destinationName.signLang
                  : tripDetails?.headsign
                    ? "fi"
                    : "";
                const accessibility = wheelchairLabel(
                  tripDetails?.wheelchairAccessible
                );

                const cancelled = isCancelledHere(arrival, cancellations);
                const rowKey = rowKeys[index];
                const rideKey = arrival.tripref && !cancelled ? rowKey : "";
                const rideSetupOpen =
                  Boolean(rideKey) && rideCandidateKey === rideKey;
                const sameRideActive =
                  Boolean(activeRideTripRef) &&
                  activeRideTripRef === arrival.tripref;

                return (
                  <Fragment key={rowKey}>
                  <tr data-cancelled={cancelled ? "true" : undefined}>
                    <td>
                      <span
                        className={styles.lineBadge}
                        style={routeBadgeStyle(route)}
                        title={route?.longName || undefined}
                      >
                        {arrival.lineref || "—"}
                      </span>
                    </td>
                    <td className={styles.destination}>
                      <span lang={destinationLang || undefined}>
                        {destination}
                      </span>
                      {destinationName.translation && (
                        <span
                          className={styles.destinationTranslation}
                          lang={destinationName.lang}
                        >
                          {destinationName.translation}
                        </span>
                      )}
                      {/* One line on a phone: the clock went under the
                          countdown, and an accessible bus is a symbol here
                          rather than a chip wrapping onto two more lines.
                          The symbol is held to the status before it: on
                          its own it was left alone on a line at 360px. */}
                      <span className={styles.tripMeta}>
                        <span>
                          {cancelled
                            ? t("Cancelled at this stop · was due {time}", {
                                time: formatClock(departureTime),
                              })
                            : serviceStatus}
                          {accessibility && tripDetails?.wheelchairAccessible === 1 && (
                            <>
                              {"\u00a0"}
                              <span
                                className={styles.accessibility}
                                data-accessible="true"
                                title={accessibility}
                              >
                                <span aria-hidden="true">{"♿"}</span>
                                <span className={styles.srOnly}>{accessibility}</span>
                              </span>
                            </>
                          )}
                        </span>
                        {!cancelled && lineNotices?.has(String(arrival.lineref || "")) && (
                          <span className={styles.lineNotice}>
                            {lineNotices.get(String(arrival.lineref || "")) ||
                              t("Service update")}
                          </span>
                        )}
                        {accessibility &&
                          (tripDetails?.wheelchairAccessible === 1 ? null : (
                            <span
                              className={styles.accessibility}
                              data-accessible="false"
                              title={accessibility}
                            >
                              <span aria-hidden="true">
                                {"♿ "}
                                {t("Not accessible")}
                              </span>
                              <span className={styles.srOnly}>{accessibility}</span>
                            </span>
                          ))}
                      </span>
                      {proximity && !cancelled && (
                        <span className={styles.proximity}>{proximity}</span>
                      )}
                      {arrival.tripref && !cancelled && (
                        <div className={styles.rowActions}>
                          <TripJourneyDetails
                            tripId={arrival.tripref}
                            currentStopId={stopId}
                            aimedDepartureTime={arrival.aimeddeparturetime}
                            stopsById={stopsById}
                          />
                          <button
                            type="button"
                            className={styles.rideButton}
                            disabled={sameRideActive}
                            aria-expanded={rideSetupOpen}
                            onClick={() =>
                              setRideCandidateKey((current) =>
                                current === rideKey ? "" : rideKey
                              )
                            }
                          >
                            {/* One name at every width. "Alert me" beside a
                                departure read as "remind me before this bus
                                leaves", and the feature that sets the app
                                apart went unfound on the phones it is for. */}
                            {sameRideActive
                              ? t("Alert on")
                              : rideSetupOpen
                                ? t("Close get-off setup")
                                : t("Get-off alert")}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={styles.due}>
                      {cancelled ? (
                        t("Cancelled")
                      ) : (
                        <DueLabel
                          parts={formatDueParts(
                            departureTime,
                            effectiveServerTime * 1000
                          )}
                          clock={formatClock(departureTime)}
                        />
                      )}
                    </td>
                  </tr>
                  {rideSetupOpen && !sameRideActive && (
                    <tr className={styles.rideSetupRow}>
                      <td colSpan={3}>
                        <RideSetup
                          arrival={arrival}
                          currentStopId={stopId}
                          currentStopName={stopName}
                          stopsById={stopsById}
                          placesById={placesById}
                          routesById={routesById}
                          routesByShortName={routesByShortName}
                          onCancel={() => setRideCandidateKey("")}
                          onStart={(config) => {
                            const replacingAnotherRide =
                              Boolean(activeRideTripRef) &&
                              activeRideTripRef !== arrival.tripref;

                            if (replacingAnotherRide) {
                              const line = String(arrival.lineref || "").trim();
                              const message = line
                                ? t(
                                    "Switch get-off alert to line {line}? Your current alert will end.",
                                    { line }
                                  )
                                : t(
                                    "Switch get-off alert to this trip? Your current alert will end."
                                  );

                              if (!globalThis.confirm(message)) return;
                            }

                            onStartRide?.(config);
                            setRideCandidateKey("");
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleArrivals.length > 0 && (
        <details className={styles.legend}>
          <summary>{t("About live estimates")}</summary>
          <p>
            {t(
              "Live times are Föli’s estimates from the buses themselves. A bus’s distance is a straight line from its last reported position. Scheduled means Föli has no live data for that trip right now."
            )}
          </p>
        </details>
      )}
    </section>
  );
}

export default BusStopDisplay;
