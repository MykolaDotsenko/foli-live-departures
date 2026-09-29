// Finnish, by area of the app. Terminology is kept in step across areas by
// the glossary in docs/LOCALIZATION.md; a test checks that every phrase the
// code asks for is here, with the same placeholders.
import alerts from "./alerts";
import app from "./app";
import board from "./board";
import places from "./places";
import ride from "./ride";
import search from "./search";

/** @import { Dictionary } from "../index" */

export const AREAS = Object.freeze({ alerts, app, board, places, ride, search });

/** @type {Readonly<Dictionary>} */
export default Object.freeze(Object.assign({}, ...Object.values(AREAS)));
