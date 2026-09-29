import { msg } from "../i18n";
import { hasCoordinates } from "./geo";

/**
 * @import { LatLon } from "../types/foli"
 */

/**
 * A browser fix, reduced to what the app keeps. Accuracy is in meters, or
 * null when the browser gave none.
 * @typedef {LatLon & { accuracy: number | null }} LocatedPosition
 */

/**
 * A caught error as far as this file reads it: a GeolocationPositionError
 * carries a numeric code; anything else has none.
 * @typedef {{ code?: unknown } | null | undefined} MaybeCoded
 */

export const HIGH_ACCURACY_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 8_000,
  maximumAge: 0,
};

export const FALLBACK_LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5_000,
  maximumAge: 0,
};

/**
 * @param {Geolocation} geolocation
 * @param {PositionOptions} options
 * @returns {Promise<GeolocationPosition>}
 */
function readPosition(geolocation, options) {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// The phrase, in English; the caller shows it with t() so it follows a
// language change while it is on screen.
/**
 * @param {unknown} error
 * @returns {string}
 */
export function locationErrorMessage(error) {
  if (/** @type {MaybeCoded} */ (error)?.code === 1) {
    return msg("Location access is blocked. Allow location for this site in your browser settings and try again.");
  }

  if (/** @type {MaybeCoded} */ (error)?.code === 2) {
    return msg("Your device could not determine its location. Check location services and try again.");
  }

  if (/** @type {MaybeCoded} */ (error)?.code === 3) {
    return msg("Location took too long to respond. Move near a window or try again.");
  }

  return msg("Your location could not be read. Try again or choose a stop manually.");
}

/**
 * @param {Geolocation | null | undefined} geolocation
 * @returns {Promise<LocatedPosition>}
 */
export async function requestOneTimePosition(geolocation) {
  if (!geolocation?.getCurrentPosition) {
    throw new Error("Geolocation unsupported.");
  }

  /** @type {GeolocationPosition} */
  let result;

  try {
    result = await readPosition(geolocation, HIGH_ACCURACY_LOCATION_OPTIONS);
  } catch (error) {
    if (/** @type {MaybeCoded} */ (error)?.code !== 3) throw error;
    result = await readPosition(geolocation, FALLBACK_LOCATION_OPTIONS);
  }

  // Read as untrusted: a browser, or a stand-in for one, may leave it out.
  /** @type {unknown} */
  const rawAccuracy = result?.coords?.accuracy;

  const accuracy =
    rawAccuracy === null || rawAccuracy === undefined || rawAccuracy === ""
      ? null
      : Number(rawAccuracy);

  const position = {
    lat: Number(result?.coords?.latitude),
    lon: Number(result?.coords?.longitude),
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };

  if (!hasCoordinates(position)) {
    throw new Error("Invalid browser location.");
  }

  return position;
}
