/** @import { LiveState, TransferFeasibility } from "../types/journey" */

const WALKING_SPEED_MPS = 1.05;
const WALKING_DETOUR_FACTOR = 1.2;
const SAME_STOP_BASE_SEC = 45;
const CROSS_STOP_BASE_SEC = 75;

const ARRIVAL_UNCERTAINTY_SEC = {
  live: 20,
  delayed: 60,
  schedule: 45,
  unknown: 90,
};

/** @param {unknown} value */
function nonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Conservative transfer walking allowance. This is not walking navigation;
 * it deliberately pads straight-line platform distance before ranking.
 *
 * @param {number | null | undefined} distanceM
 * @returns {number | null}
 */
export function transferWalkSeconds(distanceM) {
  const distance = nonNegative(distanceM);
  if (distance === null) return null;
  return Math.ceil(
    (distance * WALKING_DETOUR_FACTOR) / WALKING_SPEED_MPS
  );
}

/**
 * Minimum connection time before the risk-state thresholds are applied.
 * Same-stop transfers do not require a geographic distance. Cross-stop
 * transfers fail closed when the distance is unknown.
 *
 * @param {{
 *   walkingDistanceM?: number | null,
 *   sameStop?: boolean,
 *   incomingLiveState?: LiveState,
 * }} input
 * @returns {number | null}
 */
export function transferRequiredSeconds({
  walkingDistanceM = null,
  sameStop = false,
  incomingLiveState = "unknown",
} = {}) {
  const uncertainty =
    ARRIVAL_UNCERTAINTY_SEC[incomingLiveState] ??
    ARRIVAL_UNCERTAINTY_SEC.unknown;

  if (sameStop) return SAME_STOP_BASE_SEC + uncertainty;

  const walk = transferWalkSeconds(walkingDistanceM);
  if (walk === null) return null;
  return CROSS_STOP_BASE_SEC + uncertainty + walk;
}

/**
 * Classify one concrete transfer using explicit arrival/departure evidence.
 * Tight remains viable but should rank below safer alternatives; unlikely,
 * broken and unknown are never recommendations.
 *
 * @param {{
 *   incomingArrivalAt: number | null | undefined,
 *   outgoingDepartureAt: number | null | undefined,
 *   walkingDistanceM?: number | null,
 *   sameStop?: boolean,
 *   incomingLiveState?: LiveState,
 * }} input
 * @returns {TransferFeasibility}
 */
export function assessTransfer({
  incomingArrivalAt,
  outgoingDepartureAt,
  walkingDistanceM = null,
  sameStop = false,
  incomingLiveState = "unknown",
}) {
  const incoming = positive(incomingArrivalAt);
  const outgoing = positive(outgoingDepartureAt);
  const distance = sameStop ? 0 : nonNegative(walkingDistanceM);
  const requiredSec = transferRequiredSeconds({
    walkingDistanceM: distance,
    sameStop,
    incomingLiveState,
  });

  if (incoming === null || outgoing === null || requiredSec === null) {
    return {
      state: "unknown",
      recommendable: false,
      incomingArrivalAt: incoming,
      outgoingDepartureAt: outgoing,
      walkingDistanceM: distance,
      requiredSec,
      availableSec: null,
      slackSec: null,
    };
  }

  const availableSec = outgoing - incoming;
  const slackSec = availableSec - requiredSec;

  /** @type {import("../types/journey").TransferRiskState} */
  let state;
  if (availableSec <= 0 || slackSec < 0) state = "broken";
  else if (slackSec < 60) state = "unlikely";
  else if (slackSec < 150) state = "tight";
  else if (slackSec < 300) state = "acceptable";
  else state = "comfortable";

  return {
    state,
    recommendable: ["comfortable", "acceptable", "tight"].includes(state),
    incomingArrivalAt: incoming,
    outgoingDepartureAt: outgoing,
    walkingDistanceM: distance,
    requiredSec,
    availableSec,
    slackSec,
  };
}
