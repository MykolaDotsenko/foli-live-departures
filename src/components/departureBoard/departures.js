import { getDepartureTime } from "../../utils/time";

// Which of the answer's departures the board lists, and how it tells them
// apart: a bus that has just left, a row that must survive a refresh, and a
// departure Föli has cancelled at this stop. No wording lives here; the
// board decides what to say about them.

export const MAX_VISIBLE_DEPARTURES = 10;
export const DEPARTED_GRACE_SECONDS = 30;

export function byDepartureTime(referenceTime) {
  return (a, b) =>
    getDepartureTime(a, referenceTime) - getDepartureTime(b, referenceTime);
}

// Soonest first, and a bus is given half a minute to pull away before it
// counts as gone.
export function upcomingDepartures(arrivals, referenceTime) {
  return [...arrivals]
    .filter((arrival) => {
      const departureTime = getDepartureTime(arrival, referenceTime);
      return (
        Number.isFinite(departureTime) &&
        departureTime >= referenceTime - DEPARTED_GRACE_SECONDS
      );
    })
    .sort(byDepartureTime(referenceTime));
}

// One identity for the whole set of buses an answer listed, so the board
// can tell a new set of departed buses from the same one listed again.
export function departedSetKey(arrivals) {
  return arrivals
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
    .join(",");
}

// A departure keeps one identity across refreshes. The live estimate moves on
// nearly every poll and the index moves whenever an earlier bus leaves, so a
// row keyed on either was remounted: an open "Next stops" list or get-off
// setup closed mid-choice, taking the chosen stop with it. The planned time
// stays put, and still tells two visits of one looping trip apart. The stop
// is part of it too: a neighbouring stop can list the same trip under the
// same planned minute, and its row must not inherit this one's open panels.
export function departureKeys(arrivals, referenceTime, stopId) {
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

export function isCancelledHere(arrival, cancellations) {
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
