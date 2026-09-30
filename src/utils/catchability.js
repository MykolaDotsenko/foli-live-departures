/** @import { Catchability } from "../types/journey" */

const WALKING_SPEED_MPS = 1.15;
const DETOUR_FACTOR = 1.25;
const BASE_DECISION_BUFFER_SEC = 75;
const MAX_ACCURACY_ALLOWANCE_SEC = 90;

/**
 * Internal conservative access estimate for ranking. This is deliberately
 * not presented as exact walking navigation.
 *
 * @param {number | null | undefined} distanceM
 * @param {number | null | undefined} accuracyM
 * @returns {number | null}
 */
export function conservativeAccessSeconds(distanceM, accuracyM) {
  const distance = Number(distanceM);
  if (!Number.isFinite(distance) || distance < 0) return null;

  const accuracy = Number(accuracyM);
  const accuracyAllowance =
    Number.isFinite(accuracy) && accuracy >= 0
      ? Math.min(MAX_ACCURACY_ALLOWANCE_SEC, accuracy / WALKING_SPEED_MPS)
      : 45;

  return Math.ceil(
    (distance * DETOUR_FACTOR) / WALKING_SPEED_MPS +
      BASE_DECISION_BUFFER_SEC +
      accuracyAllowance
  );
}

/**
 * @param {{
 *   distanceM: number | null | undefined,
 *   accuracyM: number | null | undefined,
 *   departureAtSec: number | null | undefined,
 *   nowSec: number | null | undefined,
 * }} input
 * @returns {Catchability}
 */
export function classifyCatchability({
  distanceM,
  accuracyM,
  departureAtSec,
  nowSec,
}) {
  const distance = Number(distanceM);
  const accuracy = Number(accuracyM);
  const departure = Number(departureAtSec);
  const now = Number(nowSec);

  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(departure) ||
    departure <= 0 ||
    !Number.isFinite(now) ||
    now <= 0
  ) {
    return "unknown";
  }

  const atStopRadius =
    Number.isFinite(accuracy) && accuracy >= 0
      ? Math.max(20, Math.min(40, accuracy))
      : 25;

  if (distance <= atStopRadius) return "at-stop";

  const access = conservativeAccessSeconds(distance, accuracyM);
  if (access === null) return "unknown";

  const margin = departure - now - access;
  if (margin < 0) return "too-late";
  if (margin < 75) return "tight";
  if (margin < 180) return "likely";
  return "comfortable";
}
