/** @import { ItineraryTransfer, MultiLegJourneyOption, TransferJourneyOption, TransferTransitLeg } from "../types/journey" */

/** @param {unknown} value */
function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** @param {unknown} value */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Normalize old one-transfer options and new generic itinerary options to one
 * source-of-truth shape. Invalid shapes fail closed.
 *
 * @param {any} option
 * @returns {MultiLegJourneyOption | null}
 */
export function normalizeItineraryOption(option) {
  const legacyLegs =
    option?.first && option?.second ? [option.first, option.second] : [];
  const legacyTransfers = option?.transfer ? [option.transfer] : [];
  const legs = Array.isArray(option?.legs) ? option.legs : legacyLegs;
  const transfers = Array.isArray(option?.transfers)
    ? option.transfers
    : legacyTransfers;

  if (
    legs.length < 1 ||
    legs.length > 3 ||
    transfers.length !== Math.max(0, legs.length - 1)
  ) {
    return null;
  }

  for (const leg of legs) {
    if (
      !String(leg?.tripRef || "") ||
      !String(leg?.boardStopId || "") ||
      !String(leg?.exitStopId || "") ||
      positive(leg?.departureAt) === null ||
      positive(leg?.arrivalAt) === null
    ) {
      return null;
    }
  }

  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index];
    if (
      !String(transfer?.alightStopId || "") ||
      !String(transfer?.boardStopId || "") ||
      nonNegative(transfer?.walkingDistanceM) === null ||
      String(legs[index]?.exitStopId || "") !==
        String(transfer.alightStopId) ||
      String(legs[index + 1]?.boardStopId || "") !==
        String(transfer.boardStopId)
    ) {
      return null;
    }
  }

  /** @type {TransferTransitLeg[]} */
  const typedLegs = legs;
  /** @type {ItineraryTransfer[]} */
  const typedTransfers = transfers;

  const originStopId = String(option?.originStopId || typedLegs[0]?.boardStopId || "");
  const destinationStopId = String(
    option?.destinationStopId || typedLegs.at(-1)?.exitStopId || ""
  );
  const destinationArrivalAt =
    positive(option?.destinationArrivalAt) ?? positive(typedLegs.at(-1)?.arrivalAt);
  const journeyArrivalAt =
    positive(option?.journeyArrivalAt) ?? destinationArrivalAt;

  if (
    !originStopId ||
    !destinationStopId ||
    destinationArrivalAt === null ||
    journeyArrivalAt === null
  ) {
    return null;
  }

  return {
    id: String(
      option?.id ||
        typedLegs
          .map((leg) => [leg.tripRef, leg.boardStopId, leg.exitStopId].join(":"))
          .join("|")
    ),
    originStopId,
    originStopName: String(option?.originStopName || originStopId),
    originDistanceMeters: nonNegative(option?.originDistanceMeters) ?? 0,
    legs: typedLegs.map((leg) => ({ ...leg })),
    transfers: typedTransfers.map((transfer) => ({ ...transfer })),
    destinationStopId,
    destinationArrivalAt,
    finalWalkDistanceM: nonNegative(option?.finalWalkDistanceM),
    finalWalkSecEstimate: nonNegative(option?.finalWalkSecEstimate),
    journeyArrivalAt,
    totalWalkingDistanceM:
      nonNegative(option?.totalWalkingDistanceM) ??
      (nonNegative(option?.originDistanceMeters) ?? 0) +
        typedTransfers.reduce(
          (sum, transfer) => sum + (nonNegative(transfer.walkingDistanceM) ?? 0),
          0
        ) +
        (nonNegative(option?.finalWalkDistanceM) ?? 0),
    reliability: ["high", "medium", "low"].includes(option?.reliability)
      ? option.reliability
      : "medium",
  };
}

/**
 * Add legacy one-transfer aliases without making them authoritative.
 * Two-transfer itineraries intentionally expose only the first legacy pair;
 * generic callers must use legs/transfers.
 *
 * @param {MultiLegJourneyOption} itinerary
 * @returns {MultiLegJourneyOption & Partial<TransferJourneyOption>}
 */
export function withLegacyTransferAliases(itinerary) {
  const normalized = normalizeItineraryOption(itinerary);
  if (!normalized) return itinerary;
  if (normalized.legs.length < 2) return normalized;
  return {
    ...normalized,
    first: normalized.legs[0],
    transfer: normalized.transfers[0],
    second: normalized.legs[1],
  };
}

/** @param {any} option */
export function itineraryTransferCount(option) {
  return normalizeItineraryOption(option)?.transfers.length ?? 0;
}

/** @param {any} option @param {number} index */
export function itineraryLeg(option, index) {
  const normalized = normalizeItineraryOption(option);
  if (!normalized || !Number.isInteger(index)) return null;
  return normalized.legs[index] || null;
}

/** @param {any} option @param {number} index */
export function itineraryTransfer(option, index) {
  const normalized = normalizeItineraryOption(option);
  if (!normalized || !Number.isInteger(index)) return null;
  return normalized.transfers[index] || null;
}

/**
 * Prefer fewer transfers when arrivals are near-equivalent, but allow a
 * materially earlier two-transfer itinerary to win.
 *
 * @param {any} left
 * @param {any} right
 * @param {number} [nearEquivalentSec]
 */
export function compareItineraries(left, right, nearEquivalentSec = 120) {
  const a = normalizeItineraryOption(left);
  const b = normalizeItineraryOption(right);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const arrivalDelta = a.journeyArrivalAt - b.journeyArrivalAt;
  if (Math.abs(arrivalDelta) > Math.max(0, nearEquivalentSec)) {
    return arrivalDelta;
  }

  const transferDelta = a.transfers.length - b.transfers.length;
  if (transferDelta !== 0) return transferDelta;

  return (
    arrivalDelta ||
    a.totalWalkingDistanceM - b.totalWalkingDistanceM ||
    a.legs[0].departureAt - b.legs[0].departureAt
  );
}
