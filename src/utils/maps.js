/** @import { MaybeLatLon } from "./geo" */

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function coordinate(value, min, max) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

/**
 * @param {MaybeLatLon | null | undefined} stop
 * @param {"walking" | "transit"} travelmode
 * @param {boolean} [navigate]
 * @returns {string} "" when the stop has no usable coordinates.
 */
function buildDirectionsUrl(stop, travelmode, navigate = false) {
  const lat = coordinate(stop?.lat, -90, 90);
  const lon = coordinate(stop?.lon, -180, 180);

  if (lat === null || lon === null) return "";

  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lon}`,
    travelmode,
  });

  if (navigate) {
    params.set("dir_action", "navigate");
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * @param {MaybeLatLon | null | undefined} stop
 * @returns {string}
 */
export function buildWalkingDirectionsUrl(stop) {
  return buildDirectionsUrl(stop, "walking", true);
}

/**
 * @param {MaybeLatLon | null | undefined} stop
 * @returns {string}
 */
export function buildTransitDirectionsUrl(stop) {

  return buildDirectionsUrl(stop, "transit");
}
