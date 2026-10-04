const GOOD_BOARDING = new Set(["at-stop", "comfortable"]);
const VIABLE_BOARDING = new Set(["at-stop", "comfortable", "likely"]);

/**
 * Confidence is deliberately categorical, never a synthetic percentage.
 * It summarizes evidence the app already has: realtime freshness,
 * catchability, walking burden, and transfer margin.
 *
 * @param {{
 *   distanceMeters?: number | null,
 *   departure?: { liveState?: string, catchability?: string } | null,
 * }} option
 * @returns {{level:"high"|"medium"|"low", reason:string}}
 */
export function directJourneyConfidence(option) {
  const liveState = String(option?.departure?.liveState || "unknown");
  const catchability = String(option?.departure?.catchability || "unknown");
  const distance = Number(option?.distanceMeters);
  const longWalk = Number.isFinite(distance) && distance > 900;

  if (catchability === "tight") {
    return { level: "low", reason: "tight-boarding" };
  }
  if (!VIABLE_BOARDING.has(catchability)) {
    return { level: "low", reason: "uncertain-boarding" };
  }

  if (liveState === "live" && GOOD_BOARDING.has(catchability)) {
    return longWalk
      ? { level: "medium", reason: "live-long-walk" }
      : { level: "high", reason: "live-comfortable" };
  }

  if (liveState === "live") {
    return { level: "medium", reason: "live-limited-margin" };
  }
  if (liveState === "schedule") {
    return GOOD_BOARDING.has(catchability)
      ? { level: "medium", reason: "schedule-comfortable" }
      : { level: "low", reason: "schedule-limited-margin" };
  }
  if (liveState === "delayed") {
    return { level: "low", reason: "stale-realtime" };
  }
  return { level: "low", reason: "unknown-realtime" };
}

/**
 * @param {{reliability?: string, transfers?: any[], transfer?: any}} option
 * @returns {{level:"high"|"medium"|"low", reason:string}}
 */
export function transferJourneyConfidence(option) {
  const transfers = Array.isArray(option?.transfers)
    ? option.transfers
    : option?.transfer
      ? [option.transfer]
      : [];
  const states = transfers
    .map((item) => String(item?.feasibility?.state || "unknown"))
    .filter(Boolean);
  const reliability = String(option?.reliability || "unknown");

  if (
    reliability === "low" ||
    states.some((state) => ["tight", "unlikely", "broken", "unknown"].includes(state))
  ) {
    return { level: "low", reason: "transfer-risk" };
  }
  if (
    reliability === "high" &&
    states.length > 0 &&
    states.every((state) => state === "comfortable")
  ) {
    return { level: "high", reason: "comfortable-transfers" };
  }
  if (
    states.length > 0 &&
    states.every((state) => ["comfortable", "acceptable"].includes(state))
  ) {
    return { level: "medium", reason: "viable-transfers" };
  }
  return { level: "low", reason: "uncertain-transfers" };
}

/**
 * Passenger-facing boarding urgency from the already-conservative
 * catchability classifier.
 *
 * @param {string | null | undefined} catchability
 * @returns {"at-stop"|"comfortable"|"likely"|"tight"|"unknown"}
 */
export function boardingDecision(catchability) {
  const value = String(catchability || "unknown");
  if (value === "at-stop") return "at-stop";
  if (value === "comfortable") return "comfortable";
  if (value === "likely") return "likely";
  if (value === "tight") return "tight";
  return "unknown";
}
