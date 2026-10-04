import { distanceInMeters } from "./geo";
import { normalizeStopQuery, typoDistance } from "./stopSearch";

/** @import { ParsedAddressPack } from "../api/addressPack" */

const DEFAULT_LIMIT = 6;

/** @param {string} query @param {string} streetKey */
function streetScore(query, streetKey) {
  if (streetKey === query) return 40;
  if (streetKey.startsWith(query)) return 30;
  if (query.length < 5) return 0;
  const limit = query.length >= 9 ? 2 : 1;
  return typoDistance(query, streetKey, limit) <= limit ? 20 : 0;
}

/** @param {string} normalized */
function hasHouseNumber(normalized) {
  return /\d/.test(normalized);
}

/**
 * Local OSM address/street search. With a number, only address rows are
 * considered; without a number, only unique street rows are considered.
 * A bare number is never a destination.
 *
 * @param {ParsedAddressPack | null | undefined} pack
 * @param {unknown} query
 * @param {{ origin?: {lat:number,lon:number}|null, limit?: number }} [options]
 */
export function findAddresses(
  pack,
  query,
  { origin = null, limit = DEFAULT_LIMIT } = {}
) {
  const normalized = normalizeStopQuery(query);
  if (normalized.length < 3 || /^[-/\d\s]+$/.test(normalized)) return [];

  const numbered = hasHouseNumber(normalized);
  const source = numbered ? pack?.addresses || [] : pack?.streets || [];
  const scored = [];

  for (const item of source) {
    let score = 0;
    if (numbered) {
      if (item.addressKey === normalized) score = 100;
      else if (item.addressKey.startsWith(normalized)) score = 90;
      else {
        // Split at the first numeric token. Finnish house numbers may have
        // suffixes, ranges or spaces; addressKey prefix matching handles them
        // once the street part is recognized.
        const firstDigit = normalized.search(/\d/);
        const streetQuery = normalized.slice(0, firstDigit).trim();
        const houseQuery = normalized.slice(firstDigit).trim();
        const street = streetScore(streetQuery, item.streetKey);
        const houseKey = normalizeStopQuery(item.house);
        if (street > 0 && houseKey.startsWith(houseQuery)) score = 60 + street;
      }
    } else {
      score = streetScore(normalized, item.streetKey);
    }

    if (score <= 0) continue;
    scored.push({
      item,
      score,
      distanceMeters: origin ? distanceInMeters(origin, item) : null,
    });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.distanceMeters !== null && b.distanceMeters !== null
          ? a.distanceMeters - b.distanceMeters
          : 0) ||
        a.item.title.localeCompare(b.item.title, "fi", { numeric: true })
    )
    .slice(0, Math.max(1, limit))
    .map(({ item, distanceMeters }) => ({ ...item, distanceMeters }));
}
