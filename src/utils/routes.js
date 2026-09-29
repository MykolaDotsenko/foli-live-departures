/** @import { Route } from "../types/foli" */

/**
 * @param {unknown} color
 * @returns {{ r: number, g: number, b: number } | null}
 */
function hexToRgb(color) {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;

  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

/**
 * @param {number} channel 0–255
 * @returns {number}
 */
function linearChannel(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {string | null | undefined} color
 * @returns {number | null}
 */
function luminance(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return null;

  return (
    0.2126 * linearChannel(rgb.r) +
    0.7152 * linearChannel(rgb.g) +
    0.0722 * linearChannel(rgb.b)
  );
}

/**
 * @param {string | null | undefined} foreground "#rrggbb"
 * @param {string | null | undefined} background "#rrggbb"
 * @returns {number | null} Null unless both are valid colours.
 */
export function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);

  if (foregroundLuminance === null || backgroundLuminance === null) return null;

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {string | null | undefined} background
 * @param {string} [preferred]
 * @returns {string}
 */
export function accessibleRouteTextColor(background, preferred = "#ffffff") {
  if (!hexToRgb(background)) return "#ffffff";

  if (
    hexToRgb(preferred) &&
    (contrastRatio(preferred, background) ?? 0) >= 4.5
  ) {
    return preferred;
  }

  const black = "#000000";
  const white = "#ffffff";
  return (contrastRatio(black, background) ?? 0) >=
    (contrastRatio(white, background) ?? 0)
    ? black
    : white;
}

/**
 * @template {Pick<Route, "id" | "shortName">} R
 * @param {readonly R[]} routes
 * @returns {{ byId: Map<string, R>, byShortName: Map<string, R> }}
 */
export function buildRouteIndexes(routes) {
  /** @type {Map<string, R>} */
  const byId = new Map();
  /** @type {Map<string, R>} */
  const byShortName = new Map();


  routes.forEach((route) => {
    byId.set(route.id, route);
    if (!byShortName.has(route.shortName)) {
      byShortName.set(route.shortName, route);
    }
  });

  return { byId, byShortName };
}
