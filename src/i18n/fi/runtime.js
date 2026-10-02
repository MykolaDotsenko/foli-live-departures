/** @import { Dictionary } from "../index" */

/** @param {Record<string, string | number>} params */
export const serviceUpdates = ({ count }) => `${count} liikennetiedotetta`;
/** @param {Record<string, string | number>} params */
export const moreUpdates = ({ count }) => `Näytä ${count} tiedotetta lisää`;
/** @param {Record<string, string | number>} params */
export const liveCount = ({ count }) =>
  count === 1 ? "reaaliaikainen" : "reaaliaikaista";
/** @param {Record<string, string | number>} params */
export const scheduledCount = ({ count }) =>
  count === 1 ? "1 aikataulun mukainen" : `${count} aikataulun mukaista`;

/** @type {Dictionary} */
export default Object.freeze({
  "{count} service updates": serviceUpdates,
  "Show {count} more updates": moreUpdates,
  live: liveCount,
  "{count} scheduled": scheduledCount,
});
