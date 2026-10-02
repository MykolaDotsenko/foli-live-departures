/** @import { Dictionary } from "../index" */

export const serviceUpdates = ({ count }) => `${count} liikennetiedotetta`;
export const moreUpdates = ({ count }) => `Näytä ${count} tiedotetta lisää`;
export const liveCount = ({ count }) =>
  count === 1 ? "reaaliaikainen" : "reaaliaikaista";
export const scheduledCount = ({ count }) =>
  count === 1 ? "1 aikataulun mukainen" : `${count} aikataulun mukaista`;

/** @type {Dictionary} */
export default Object.freeze({
  "{count} service updates": serviceUpdates,
  "Show {count} more updates": moreUpdates,
  live: liveCount,
  "{count} scheduled": scheduledCount,
});
