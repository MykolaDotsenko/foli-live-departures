import { ukPlural } from "./plural.js";

/** @import { Dictionary } from "../index" */

/** @param {Record<string, string | number>} params */
export const serviceUpdates = ({ count }) =>
  `${count} ${ukPlural(count, { one: "зміна", few: "зміни", many: "змін" })} в русі`;
/** @param {Record<string, string | number>} params */
export const moreUpdates = ({ count }) =>
  `Показати ще ${count} ${ukPlural(count, { one: "повідомлення", few: "повідомлення", many: "повідомлень" })}`;
/** @param {Record<string, string | number>} params */
export const upcoming = ({ count }) =>
  `${count} ${ukPlural(count, { one: "наступне", few: "наступні", many: "наступних" })}`;
/** @param {Record<string, string | number>} params */
export const scheduledCount = ({ count }) =>
  `${count} ${ukPlural(count, { one: "за розкладом", few: "за розкладом", many: "за розкладом" })}`;
/** @param {Record<string, string | number>} params */
export const backupStops = ({ count }) =>
  `${count} ${ukPlural(count, { one: "резервна зупинка", few: "резервні зупинки", many: "резервних зупинок" })}`;
/** @param {Record<string, string | number>} params */
export const stops = ({ count }) =>
  `${count} ${ukPlural(count, { one: "зупинка", few: "зупинки", many: "зупинок" })}`;
/** @param {Record<string, string | number>} params */
export const stopsAway = ({ count }) =>
  `через ${count} ${ukPlural(count, { one: "зупинку", few: "зупинки", many: "зупинок" })}`;
/** @param {Record<string, string | number>} params */
export const options = ({ count }) =>
  `${count} ${ukPlural(count, { one: "варіант", few: "варіанти", many: "варіантів" })}`;
/** @param {Record<string, string | number>} params */
export const transfers = ({ count }) =>
  `${count} ${ukPlural(count, { one: "пересадка", few: "пересадки", many: "пересадок" })}`;

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
