import { t } from "../i18n";

// Föli does not always name a stop: its live feed often leaves the name out,
// and a catalogue entry can lack one. Such a stop is called by its number on
// screen, in the reader's language, and that stand-in is never stored or
// shared. Kept as "Stop 123", it stayed English in the Finnish interface for
// as long as it was saved.
const STAND_IN = /^(?:Stop|Pysäkki) \d+$/;

// A name worth keeping: Föli's own, never a stand-in, including one an
// earlier version stored.
/**
 * @param {unknown} name
 * @returns {string}
 */
export function realStopName(name) {
  const text = String(name ?? "").trim();
  return STAND_IN.test(text) ? "" : text;
}

// What to call a stop on screen.
/**
 * @param {{ id?: string | number | null, name?: unknown } | null | undefined} stop
 * @param {string | number | null} [id] The stop's own id unless given.
 * @returns {string}
 */
export function stopLabel(stop, id = stop?.id) {

  return realStopName(stop?.name) || t("Stop {id}", { id: id ?? "" });
}
