import { ukPlural } from "./plural.js";

/** @import { Dictionary } from "../index" */

export const serviceUpdates = ({ count }) =>
  `${count} ${ukPlural(count, { one: "зміна", few: "зміни", many: "змін" })} в русі`;
export const moreUpdates = ({ count }) =>
  `Показати ще ${count} ${ukPlural(count, { one: "повідомлення", few: "повідомлення", many: "повідомлень" })}`;
export const upcoming = ({ count }) =>
  `${count} ${ukPlural(count, { one: "наступне", few: "наступні", many: "наступних" })}`;
export const scheduledCount = ({ count }) =>
  `${count} ${ukPlural(count, { one: "за розкладом", few: "за розкладом", many: "за розкладом" })}`;
export const backupStops = ({ count }) =>
  `${count} ${ukPlural(count, { one: "резервна зупинка", few: "резервні зупинки", many: "резервних зупинок" })}`;
export const stops = ({ count }) =>
  `${count} ${ukPlural(count, { one: "зупинка", few: "зупинки", many: "зупинок" })}`;
export const stopsAway = ({ count }) =>
  `через ${count} ${ukPlural(count, { one: "зупинку", few: "зупинки", many: "зупинок" })}`;
export const options = ({ count }) =>
  `${count} ${ukPlural(count, { one: "варіант", few: "варіанти", many: "варіантів" })}`;
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
