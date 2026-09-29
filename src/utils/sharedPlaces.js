import { realStopName } from "./stopNames";

/** @import { StopSummary } from "../types/foli" */

/**
 * A place as it is handed over: a saved place in its long form, or a link
 * payload in its short one (p, m, and s as [id, name] pairs). Nothing in it
 * is trusted; every field is checked below.
 * @typedef {{
 *   id?: unknown,
 *   stops?: unknown,
 *   primaryStopId?: unknown,
 *   p?: unknown,
 *   s?: unknown,
 *   m?: unknown,
 * }} SharedPlaceInput
 */

/**
 * @typedef {{ id?: unknown, name?: unknown } | null | undefined} SharedStopInput
 */

/**
 * @typedef {object} SharedPlace
 * @property {string} id "home", "school" or "work".
 * @property {StopSummary[]} stops One to three, without stand-in names.
 * @property {string} primaryStopId One of the stops' ids.
 */

const VERSION = 1;
const ALLOWED_PLACE_IDS = new Set(["home", "school", "work"]);
const MAX_STOPS = 3;
const MAX_STOP_NAME_LENGTH = 80;

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanStopName(value) {
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_STOP_NAME_LENGTH);

  // Carried in the link and saved on import, so only Föli's own name: a
  // stand-in is worked out on screen in the reader's language.
  return realStopName(cleaned);
}

/**
 * @param {SharedPlaceInput | null | undefined} place
 * @returns {SharedPlace | null}
 */
function normalizeSharedPlace(place) {
  if (!place || typeof place !== "object") return null;

  const id = String(place.id || place.p || "").trim();
  if (!ALLOWED_PLACE_IDS.has(id)) return null;

  /** @type {unknown[]} */
  const sourceStops = Array.isArray(place.stops)
    ? place.stops
    : Array.isArray(place.s)
      ? place.s.map((stop) =>
          Array.isArray(stop) ? { id: stop[0], name: stop[1] } : stop
        )
      : [];

  /** @type {Set<string>} */
  const seenStopIds = new Set();
  const stops = sourceStops
    .map((stop) => {
      // An entry that is not an object reads as a stop without an id.
      const stopId = String(
        /** @type {SharedStopInput} */ (stop)?.id || ""
      ).trim();
      if (!/^\d+$/.test(stopId) || seenStopIds.has(stopId)) return null;

      seenStopIds.add(stopId);
      return {
        id: stopId,
        name: cleanStopName(/** @type {SharedStopInput} */ (stop)?.name),
      };
    })
    .filter(
      /** @returns {stop is StopSummary} */
      (stop) => Boolean(stop)
    )
    .slice(0, MAX_STOPS);

  if (stops.length === 0) return null;

  const requestedPrimary = String(
    place.primaryStopId || place.m || ""
  ).trim();
  const primaryStopId = stops.some((stop) => stop.id === requestedPrimary)
    ? requestedPrimary
    : stops[0].id;

  return { id, stops, primaryStopId };
}

/**
 * @param {string} value
 * @returns {string}
 */
function base64UrlEncode(value) {
  const bytes = new globalThis.TextEncoder().encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

/**
 * @param {string} value
 * @returns {string}
 */
function base64UrlDecode(value) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  );

  return new globalThis.TextDecoder().decode(bytes);
}

/**
 * @param {SharedPlaceInput | null | undefined} place
 * @returns {string} The link token, or "" for a place that cannot be shared.
 */
export function encodeSharedPlace(place) {
  const normalized = normalizeSharedPlace(place);
  if (!normalized) return "";

  const payload = {
    v: VERSION,
    p: normalized.id,
    m: normalized.primaryStopId,
    s: normalized.stops.map((stop) => [stop.id, stop.name]),
  };

  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * @param {unknown} token
 * @returns {SharedPlace | null}
 */
export function decodeSharedPlace(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return null;
  }

  try {
    // Any JSON at all; a primitive has no v and is turned away below.
    /** @type {(SharedPlaceInput & { v?: unknown }) | null} */
    const payload = JSON.parse(base64UrlDecode(token));
    if (payload?.v !== VERSION) return null;
    return normalizeSharedPlace(payload);
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} hash
 * @returns {SharedPlace | null}
 */
export function parseSharedPlaceHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const token = new URLSearchParams(raw).get("place");
  return decodeSharedPlace(token || "");
}

/**
 * @param {SharedPlaceInput | null | undefined} place
 * @param {string} [currentHref] The page's own address unless given.
 * @returns {string} "" when there is nothing to share.
 */
export function buildSharedPlaceUrl(place, currentHref) {
  const token = encodeSharedPlace(place);
  if (!token) return "";

  const href =
    currentHref ||
    (typeof window !== "undefined" ? window.location.href : "");
  if (!href) return "";

  const url = new globalThis.URL(href);
  url.search = "";
  url.hash = `place=${token}`;
  return url.toString();
}

/** @returns {void} */
export function clearSharedPlaceHash() {

  if (typeof window === "undefined") return;

  const url = new globalThis.URL(window.location.href);
  if (!url.hash) return;

  url.hash = "";
  window.history.replaceState(null, "", url);
}
