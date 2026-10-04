import { distanceInMeters } from "./geo";
import { normalizeStopQuery, typoDistance } from "./stopSearch";

/** @import { PackPlace } from "../api/placePack" */

const DEFAULT_LIMIT = 8;

/**
 * How well one typed word matches one word of a place: 2 when it starts
 * the word ("lid" in "lidl"), 1 when it is a typing slip away from it
 * ("tamperentie" for "tampereentie"), 0 otherwise.
 *
 * @param {string} token
 * @param {readonly string[]} placeWords
 */
function tokenMatch(token, placeWords) {
  let best = 0;
  for (const word of placeWords) {
    if (word.startsWith(token)) return 2;
    if (token.length >= 5) {
      const limit = token.length >= 8 ? 2 : 1;
      if (
        typoDistance(token, word, limit) <= limit ||
        typoDistance(token, word.slice(0, token.length), limit) <= limit
      ) {
        best = 1;
      }
    }
  }
  return best;
}

/**
 * Places from the shipped pack for what the passenger typed, nearest first
 * when their location is known. Every place must match on its name; the
 * street and town only narrow a name down ("Prisma Tampereentie"). When no
 * place matches every word, the best partial matches are offered: a typo in
 * the street still finds the Prismas.
 *
 * @param {readonly PackPlace[]} places
 * @param {unknown} query
 * @param {{ origin?: { lat: number, lon: number } | null, limit?: number }} [options]
 * @returns {(PackPlace & { distanceMeters: number | null })[]}
 */
export function findPlaces(places, query, { origin = null, limit = DEFAULT_LIMIT } = {}) {
  const normalized = normalizeStopQuery(query);
  const tokens = normalized.split(/[\s,.:;/()&-]+/).filter(Boolean);
  if (normalized.length < 2 || tokens.length === 0) return [];

  const scored = [];
  for (const place of places) {
    let matched = 0;
    let strength = 0;
    let onName = false;
    for (const token of tokens) {
      const name = tokenMatch(token, place.nameWords);
      const other = name === 2 ? 0 : tokenMatch(token, place.otherWords);
      const best = Math.max(name, other);
      if (best > 0) matched += 1;
      if (name > 0) onName = true;
      strength += best;
    }
    if (!onName) continue;
    scored.push({
      place,
      matched,
      strength,
      startsName: normalizeStopQuery(place.name).startsWith(normalized),
      distanceMeters: origin ? distanceInMeters(origin, place) : null,
    });
  }
  if (scored.length === 0) return [];

  const mostMatched = Math.max(...scored.map((item) => item.matched));
  return scored
    .filter((item) => item.matched === mostMatched)
    .sort(
      (a, b) =>
        Number(b.startsName) - Number(a.startsName) ||
        (a.distanceMeters !== null && b.distanceMeters !== null
          ? a.distanceMeters - b.distanceMeters
          : 0) ||
        b.strength - a.strength ||
        a.place.name.localeCompare(b.place.name, "fi")
    )
    .slice(0, Math.max(1, limit))
    .map((item) => ({ ...item.place, distanceMeters: item.distanceMeters }));
}
