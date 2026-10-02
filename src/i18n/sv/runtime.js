/** @import { Dictionary } from "../index" */

/** @param {Record<string, string | number>} params */
export const serviceUpdates = ({ count }) =>
  `${count} trafikmeddelanden`;
/** @param {Record<string, string | number>} params */
export const moreUpdates = ({ count }) =>
  `Visa ${count} fler meddelanden`;
/** @param {Record<string, string | number>} params */
export const upcoming = ({ count }) =>
  `${count} kommande`;
/** @param {Record<string, string | number>} params */
export const scheduledCount = ({ count }) =>
  `${count} enligt tidtabell`;
/** @param {Record<string, string | number>} params */
export const backupStops = ({ count }) =>
  `${count} reservhållplatser`;
/** @param {Record<string, string | number>} params */
export const stops = ({ count }) =>
  `${count} hållplatser`;
/** @param {Record<string, string | number>} params */
export const stopsAway = ({ count }) =>
  `${count} hållplatser kvar`;
/** @param {Record<string, string | number>} params */
export const options = ({ count }) =>
  `${count} alternativ`;
/** @param {Record<string, string | number>} params */
export const transfers = ({ count }) =>
  `${count} byten`;

/** @type {Dictionary} */
export default Object.freeze({
  "{count} service updates": serviceUpdates,
  "Show {count} more updates": moreUpdates,
  "{count} upcoming": upcoming,
  "{count} scheduled": scheduledCount,
  "{count} backup stops": backupStops,
  "{count} stops": stops,
  "{count} stops away": stopsAway,
  "{count} options": options,
  "{count} transfers": transfers,
});
