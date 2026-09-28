import { msg } from "../i18n";
import { hasCoordinates } from "./geo";

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

function readPosition(geolocation, options) {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// The phrase, in English; the caller shows it with t() so it follows a
// language change while it is on screen.
export function locationErrorMessage(error) {
  if (error?.code === 1) {
    return msg("Location access is blocked. Allow location for this site in your browser settings and try again.");
  }

  if (error?.code === 2) {
    return msg("Your device could not determine its location. Check location services and try again.");
  }

  if (error?.code === 3) {
    return msg("Location took too long to respond. Move near a window or try again.");
  }

  return msg("Your location could not be read. Try again or choose a stop manually.");
}

export async function requestOneTimePosition(geolocation) {
  if (!geolocation?.getCurrentPosition) {
    throw new Error("Geolocation unsupported.");
  }

  let result;

  try {
    result = await readPosition(geolocation, HIGH_ACCURACY_LOCATION_OPTIONS);
  } catch (error) {
    if (error?.code !== 3) throw error;
    result = await readPosition(geolocation, FALLBACK_LOCATION_OPTIONS);
  }

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
