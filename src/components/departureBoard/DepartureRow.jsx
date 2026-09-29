import { useRef } from "react";
import styles from "../BusStopDisplay.module.css";
import RideSetup from "../RideSetup";
import TripJourneyDetails from "../TripJourneyDetails";
import { t } from "../../i18n";
import {
  formatClock,
  formatDueParts,
  formatServiceStatus,
  getDepartureTime,
} from "../../utils/time";
import { isCancelledHere } from "./departures";
import {
  destinationNames,
  routeBadgeStyle,
  vehicleProximity,
  wheelchairLabel,
} from "./rowPresentation";

// One departure as a passenger reads it off the board: line, destination,
// how the bus is doing and when it goes, then the way into its next stops
// and a get-off alert. The setup for that alert opens in a row of its own
// beneath, so the departure it belongs to stays in view above it.

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

function DepartureRow({
  arrival,
  rowKey,
  referenceTime,
  effectiveServerTime,
  tripDetailsById,
  routesById,
  routesByShortName,
  online,
  stop,
  stopId,
  stopName,
  stopsById,
  placesById,
  preferredLanguages,
  cancellations,
  lineNotices,
  rideCandidateKey,
  activeRideTripRef,
  onToggleRideSetup,
  onCloseRideSetup,
  onStartRide,
}) {
  const rideButtonRef = useRef(null);
  const departureTime = getDepartureTime(arrival, referenceTime);
  const tripDetails = arrival.tripref ? tripDetailsById.get(arrival.tripref) : null;
  const route =
    (tripDetails?.routeId ? routesById?.get(tripDetails.routeId) : null) ||
    routesByShortName?.get(arrival.lineref);
  const serviceStatus = formatServiceStatus(
    arrival.monitored,
    arrival.delay,
    arrival.recordedattime,
    effectiveServerTime,
    { offline: !online }
  );
  // "Bus at stop · board now", read off a saved answer, may be long gone.
  const proximity = online
    ? vehicleProximity(arrival, stop, route, effectiveServerTime)
    : "";
  const destinationName = destinationNames(arrival, preferredLanguages);
  const destination =
    destinationName.sign || tripDetails?.headsign || t("Unknown destination");
  const destinationLang = destinationName.sign
    ? destinationName.signLang
    : tripDetails?.headsign
      ? "fi"
      : "";
  const accessibility = wheelchairLabel(tripDetails?.wheelchairAccessible);

  const cancelled = isCancelledHere(arrival, cancellations);
  const rideKey = arrival.tripref && !cancelled ? rowKey : "";
  const rideSetupOpen = Boolean(rideKey) && rideCandidateKey === rideKey;
  const sameRideActive =
    Boolean(activeRideTripRef) && activeRideTripRef === arrival.tripref;

  return (
    <>
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
          <span lang={destinationLang || undefined}>{destination}</span>
          {destinationName.translation && (
            <>
              {/* The gap between the sign and its translation is a margin,
                  so a screen reader ran them together: "SatamaHarbour". */}
              <span className={styles.srOnly}> · </span>
              <span
                className={styles.destinationTranslation}
                lang={destinationName.lang}
              >
                {destinationName.translation}
              </span>
            </>
          )}
          {/* One line on a phone: the clock went under the countdown, and
              an accessible bus is a symbol here rather than a chip wrapping
              onto two more lines. The symbol is held to the status before
              it: on its own it was left alone on a line at 360px. */}
          <span className={styles.tripMeta}>
            <span>
              {cancelled
                ? t("Cancelled at this stop · was due {time}", {
                    time: formatClock(departureTime),
                  })
                : serviceStatus}
              {accessibility && tripDetails?.wheelchairAccessible === 1 && (
                <>
                  {" "}
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
                ref={rideButtonRef}
                type="button"
                className={styles.rideButton}
                disabled={sameRideActive}
                aria-expanded={rideSetupOpen}
                onClick={() => onToggleRideSetup(rideKey)}
              >
                {/* One name at every width. "Alert me" beside a departure
                    read as "remind me before this bus leaves", and the
                    feature that sets the app apart went unfound on the
                    phones it is for. */}
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
              parts={formatDueParts(departureTime, effectiveServerTime * 1000)}
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
              onCancel={() => {
                onCloseRideSetup();
                // Cancel goes with the setup. Back to the button that
                // opened it, so the passenger is where they were on the
                // board instead of at the top of the page.
                rideButtonRef.current?.focus();
              }}
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
                onCloseRideSetup();
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default DepartureRow;
