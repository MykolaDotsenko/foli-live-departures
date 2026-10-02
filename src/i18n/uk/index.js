import alerts from "./alerts";
import app from "./app";
import backup from "./backup";
import board from "./board";
import places from "./places";
import ride from "./ride";
import search from "./search";

/** @import { Dictionary } from "../index" */

export const AREAS = Object.freeze({ alerts, app, backup, board, places, ride, search });

/** @type {Readonly<Dictionary>} */
export default Object.freeze(Object.assign({}, ...Object.values(AREAS)));
