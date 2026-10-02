/** @import { Dictionary } from "../index" */

const countOf = (count) => Number(count);

/** @param {Record<string, string | number>} params */
export const serviceUpdates = ({ count }) =>
  countOf(count) === 1 ? "1 trafikmeddelande" : `${count} trafikmeddelanden`;
/** @param {Record<string, string | number>} params */
export const moreUpdates = ({ count }) =>
  countOf(count) === 1 ? "Visa 1 meddelande till" : `Visa ${count} fler meddelanden`;
/** @param {Record<string, string | number>} params */
export const upcoming = ({ count }) => `${count} kommande`;
/** @param {Record<string, string | number>} params */
export const liveCount = ({ count }) =>
  countOf(count) === 1 ? "realtid" : "realtid";
/** @param {Record<string, string | number>} params */
export const scheduledCount = ({ count }) => `${count} enligt tidtabell`;
/** @param {Record<string, string | number>} params */
export const backupStops = ({ count }) =>
  countOf(count) === 1 ? "1 reservhållplats" : `${count} reservhållplatser`;
/** @param {Record<string, string | number>} params */
export const stops = ({ count }) =>
  countOf(count) === 1 ? "1 hållplats" : `${count} hållplatser`;
/** @param {Record<string, string | number>} params */
export const stopsAway = ({ count }) =>
  countOf(count) === 1 ? "1 hållplats kvar" : `${count} hållplatser kvar`;
/** @param {Record<string, string | number>} params */
export const options = ({ count }) =>
  countOf(count) === 1 ? "1 alternativ" : `${count} alternativ`;
/** @param {Record<string, string | number>} params */
export const transfers = ({ count }) =>
  countOf(count) === 1 ? "1 byte" : `${count} byten`;

/** @type {Dictionary} */
export default Object.freeze({
  "{count} service updates": serviceUpdates,
  "Show {count} more updates": moreUpdates,
  "{count} upcoming": upcoming,
  live: liveCount,
  "{count} scheduled": scheduledCount,
  "{count} backup stops": backupStops,
  "{count} stops": stops,
  "{count} stops away": stopsAway,
  "{count} options": options,
  "{count} transfers": transfers,
});
