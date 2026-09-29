import { msg } from "../i18n";

/** @import { RideExitInstruction } from "../types/ride" */

// Phrases, not text: each is translated where it is shown, spoken or sent,
// so it is in the passenger's language at that moment.
// Nearly every Föli trip is a bus, where a missed "Press STOP" can cost the
// passenger their stop and an extra one costs nothing. So a type that could
// not be loaded (trip details failed on a weak connection) counts as a bus;
// only a type known not to be one gets the generic wording.
/**
 * @param {unknown} routeType A GTFS route_type, as a number or text, or
 *   nothing when it could not be loaded.
 * @returns {boolean}
 */
function busLike(routeType) {
  if (routeType === null || routeType === undefined || routeType === "") return true;
  const type = Number(routeType);
  if (!Number.isFinite(type)) return true;
  return (
    type === 3 ||
    type === 11 ||
    (type >= 200 && type < 300) ||
    (type >= 700 && type < 800)
  );
}

/**
 * @param {unknown} routeType As for busLike().
 * @returns {RideExitInstruction}
 */
export function rideExitInstruction(routeType) {
  if (busLike(routeType)) {
    return {
      kind: "request-stop",
      soonText: msg("Get your things together. We will tell you when to press STOP."),
      nextText: msg("Press the STOP button now."),
      nextVoice: msg("Press the stop button now."),
      nextNotification: msg("Press the STOP button now."),
      // STOP asks for the next stop. Pressed before the bus has left the
      // stop before the exit, it stops the bus there, and the request is
      // spent. Until the bus is seen leaving that stop, this is said instead.
      afterPreviousTitle: msg("Get ready to press STOP"),
      afterPreviousText: msg("Press STOP when the bus leaves {name}."),
      afterPreviousLead: msg("Your stop comes after"),
      afterPreviousVoice: msg("Press the stop button when the bus leaves it."),
      unnamedPreviousText: msg("Press STOP once the bus has left the stop before yours."),
    };
  }

  return {
    kind: "prepare-exit",
    soonText: msg("Get your things together. We will tell you when your stop is next."),
    nextText: msg("Get ready to exit at the next stop."),
    nextVoice: msg("Get ready to exit at the next stop."),
    nextNotification: msg("Get ready to exit at the next stop."),
  };
}
