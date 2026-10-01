import { getDepartureTime } from "./time";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption } from "../types/journey" */

const DEPARTED_GRACE_SECONDS = 120;
const MISSING_CONFIRMATION_MS = 30_000;
const PLANNED_MATCH_TOLERANCE_SECONDS = 90;
const ORIGIN_MATCH_TOLERANCE_SECONDS = 30;

/** @param {unknown} value */
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** @param {DestinationIntent | null | undefined} destination */
function destinationLabel(destination) {
  return String(destination?.label || "").trim();
}

/**
 * @param {DirectJourneyOption} option
 * @param {DestinationIntent} destination
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function activeJourneyFromOption(
  option,
  destination,
  nowMs = Date.now()
) {
  const stopId = String(option?.stopId || "");
  const tripRef = String(option?.departure?.tripRef || "");
  const lineRef = String(option?.departure?.lineRef || "");
  const destinationId = String(destination?.id || "");
  const label = destinationLabel(destination);
  const departureAt = finitePositive(option?.departure?.departureAt);
  const selectedAt = Number(nowMs);

  if (
    !/^\d+$/.test(stopId) ||
    !tripRef ||
    !destinationId ||
    !label ||
    departureAt === null ||
    !Number.isFinite(selectedAt) ||
    selectedAt <= 0
  ) {
    return null;
  }

  const aimedDepartureAt =
    finitePositive(option?.departure?.aimedDepartureAt) ?? null;
  const originAimedDepartureAt =
    finitePositive(option?.departure?.originAimedDepartureAt) ?? null;
  const destinationArrivalAt =
    finitePositive(option?.departure?.destinationArrivalAt) ?? null;

  return {
    id: String(option.id || [stopId, tripRef, departureAt].join(":")),
    destinationId,
    destinationKind: destination.kind,
    destinationLabel: label,
    optionLabel: option.label,
    stopId,
    stopName: String(option.stopName || stopId),
    distanceMeters: Math.max(0, Number(option.distanceMeters) || 0),
    tripRef,
    lineRef,
    destinationStopId: String(option.departure.destinationStopId || ""),
    departureAt,
    aimedDepartureAt,
    originAimedDepartureAt,
    destinationArrivalAt,
    liveState: option.departure.liveState || "unknown",
    phase: "walking-to-stop",
    recoveryReason: null,
    selectedAt,
    atStopConfirmedAt: null,
    lastSeenAt: selectedAt,
  };
}

/**
 * Compare a Journey Assistant option with an already selected concrete trip.
 * Used to keep a failed selected trip out of recovery alternatives without
 * hiding other departures that happen to share a line.
 *
 * @param {DirectJourneyOption | null | undefined} option
 * @param {ActiveDirectJourney | null | undefined} journey
 * @returns {boolean}
 */
export function directOptionMatchesActiveJourney(option, journey) {
  if (
    !journey ||
    String(option?.stopId || "") !== journey.stopId ||
    String(option?.departure?.tripRef || "") !== journey.tripRef
  ) {
    return false;
  }

  const selectedOrigin = finitePositive(
    journey.originAimedDepartureAt
  );
  const optionOrigin = finitePositive(
    option?.departure?.originAimedDepartureAt
  );

  if (selectedOrigin !== null && optionOrigin !== null) {
    return (
      Math.abs(selectedOrigin - optionOrigin) <=
      ORIGIN_MATCH_TOLERANCE_SECONDS
    );
  }

  const selectedPlanned = finitePositive(journey.aimedDepartureAt);
  const optionPlanned =
    finitePositive(option?.departure?.aimedDepartureAt) ??
    finitePositive(option?.departure?.departureAt);

  if (selectedPlanned === null || optionPlanned === null) return true;

  return (
    Math.abs(selectedPlanned - optionPlanned) <=
    PLANNED_MATCH_TOLERANCE_SECONDS
  );
}

/**
 * A trip ref identifies the run in normal service. Planned boarding time is
 * an additional occurrence anchor for loops/repeated visits when both sides
 * expose it.
 *
 * @param {any} arrival
 * @param {ActiveDirectJourney | null | undefined} journey
 * @returns {boolean}
 */
export function arrivalMatchesActiveJourney(arrival, journey) {
  if (!journey || String(arrival?.tripref || "") !== journey.tripRef) {
    return false;
  }

  const selectedOrigin = finitePositive(
    journey.originAimedDepartureAt
  );
  const observedOrigin = finitePositive(
    arrival?.originaimeddeparturetime
  );

  if (
    selectedOrigin !== null &&
    observedOrigin !== null &&
    Math.abs(selectedOrigin - observedOrigin) >
      ORIGIN_MATCH_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const selectedPlanned = finitePositive(journey.aimedDepartureAt);
  const observedPlanned =
    finitePositive(arrival?.aimeddeparturetime) ??
    finitePositive(arrival?.aimedarrivaltime);

  if (selectedPlanned === null || observedPlanned === null) return true;

  return (
    Math.abs(selectedPlanned - observedPlanned) <=
    PLANNED_MATCH_TOLERANCE_SECONDS
  );
}

/**
 * @param {ActiveDirectJourney | null} journey
 * @param {number} [nowMs]
 * @returns {ActiveDirectJourney | null}
 */
export function confirmActiveJourneyAtStop(journey, nowMs = Date.now()) {
  if (!journey || journey.phase === "recovery") return journey;

  const confirmedAt = Number(nowMs);
  if (!Number.isFinite(confirmedAt) || confirmedAt <= 0) return journey;

  return {
    ...journey,
    phase: "waiting",
    atStopConfirmedAt: confirmedAt,
  };
}

/**
 * Reconcile the selected journey with the already-open stop board feed.
 * Missing data fails closed: provider/network failure never becomes
 * "your bus departed".
 *
 * @param {ActiveDirectJourney | null} journey
 * @param {{
 *   stopId: string,
 *   arrival: any | null,
 *   referenceTimeSec: number | null,
 *   receivedAtMs: number | null,
 *   feedError?: boolean,
 *   cancelled?: boolean,
 * }} observation
 * @returns {ActiveDirectJourney | null}
 */
export function observeActiveJourney(journey, observation) {
  if (!journey || String(observation?.stopId || "") !== journey.stopId) {
    return journey;
  }

  const arrival =
    observation?.arrival &&
    arrivalMatchesActiveJourney(observation.arrival, journey)
      ? observation.arrival
      : null;

  const receivedAtMs = finitePositive(observation?.receivedAtMs);
  const referenceTimeSec = finitePositive(observation?.referenceTimeSec);

  // A cancellation alert is stronger than disappearance from the board and
  // remains actionable even when the cancelled SIRI row has already gone.
  if (observation?.cancelled === true) {
    const updatedDeparture =
      arrival && referenceTimeSec !== null
        ? finitePositive(getDepartureTime(arrival, referenceTimeSec)) ??
          journey.departureAt
        : journey.departureAt;
    const observedPlanned = arrival
      ? finitePositive(arrival.aimeddeparturetime) ??
        finitePositive(arrival.aimedarrivaltime) ??
        journey.aimedDepartureAt
      : journey.aimedDepartureAt;
    const nextLastSeenAt =
      receivedAtMs === null
        ? journey.lastSeenAt
        : Math.max(journey.lastSeenAt, receivedAtMs);

    if (
      journey.departureAt === updatedDeparture &&
      journey.aimedDepartureAt === observedPlanned &&
      journey.phase === "recovery" &&
      journey.recoveryReason === "cancelled" &&
      journey.lastSeenAt === nextLastSeenAt
    ) {
      return journey;
    }

    return {
      ...journey,
      departureAt: updatedDeparture,
      aimedDepartureAt: observedPlanned,
      phase: "recovery",
      recoveryReason: "cancelled",
      lastSeenAt: nextLastSeenAt,
    };
  }

  if (arrival) {
    // The board can initially be a cached snapshot from before the passenger
    // selected this route. It may be useful to display, but it must not
    // overwrite the selected journey or undo recovery. Wait for a board
    // response received after selection.
    if (receivedAtMs === null || receivedAtMs <= journey.selectedAt) {
      return journey;
    }

    const updatedDeparture =
      finitePositive(getDepartureTime(arrival, referenceTimeSec)) ??
      journey.departureAt;
    const observedPlanned =
      finitePositive(arrival.aimeddeparturetime) ??
      finitePositive(arrival.aimedarrivaltime) ??
      journey.aimedDepartureAt;

    const nextLastSeenAt = Math.max(journey.lastSeenAt, receivedAtMs);
    const recoveredPhase = journey.atStopConfirmedAt
      ? "waiting"
      : "walking-to-stop";
    const nextPhase =
      journey.phase === "recovery" ? recoveredPhase : journey.phase;
    const nextLineRef = String(arrival.lineref || journey.lineRef);

    if (
      journey.departureAt === updatedDeparture &&
      journey.aimedDepartureAt === observedPlanned &&
      journey.lineRef === nextLineRef &&
      journey.phase === nextPhase &&
      journey.recoveryReason === null &&
      journey.lastSeenAt === nextLastSeenAt
    ) {
      return journey;
    }

    return {
      ...journey,
      departureAt: updatedDeparture,
      aimedDepartureAt: observedPlanned,
      lineRef: nextLineRef,
      phase: nextPhase,
      recoveryReason: null,
      lastSeenAt: nextLastSeenAt,
    };
  }

  if (
    observation?.feedError === true ||
    receivedAtMs === null ||
    referenceTimeSec === null ||
    receivedAtMs <= journey.selectedAt ||
    referenceTimeSec <= journey.departureAt + DEPARTED_GRACE_SECONDS ||
    receivedAtMs - journey.lastSeenAt < MISSING_CONFIRMATION_MS
  ) {
    return journey;
  }

  if (
    journey.phase === "recovery" &&
    journey.recoveryReason === "departed"
  ) {
    return journey;
  }

  return {
    ...journey,
    phase: "recovery",
    recoveryReason: "departed",
  };
}
