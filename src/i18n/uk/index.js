import alerts from "./alerts.js";
import app from "./app.js";
import backup from "./backup.js";
import board from "./board.js";
import places from "./places.js";
import ride from "./ride.js";
import search from "./search.js";

/** @import { Dictionary } from "../index" */

export const AREAS = Object.freeze({ alerts, app, backup, board, places, ride, search });

/** @type {Readonly<Dictionary>} */
export default Object.freeze(Object.assign({}, ...Object.values(AREAS)));
