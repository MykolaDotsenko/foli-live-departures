const DEFAULT_MAX_SUGGESTIONS = 6;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeStopQuery(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {{ id?: unknown, name?: unknown }} stop
 * @param {string} query
 * @returns {number}
 */
function scoreStop(stop, query) {
  const id = normalizeStopQuery(stop.id);
  const name = normalizeStopQuery(stop.name);

  if (id === query || name === query) return 0;
  if (id.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (name.includes(query)) return 3;
  if (id.includes(query)) return 4;
  return Number.POSITIVE_INFINITY;
}

/**
 * @template {{ id: unknown, name: string }} Stop
 * @param {readonly Stop[]} stops
 * @param {unknown} query
 * @param {number} [maxSuggestions]
 * @returns {Stop[]}
 */
export function findStopMatches(
  stops,
  query,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS
) {
  const normalizedQuery = normalizeStopQuery(query);
  if (!normalizedQuery) return [];

  const ranked = stops
    .map((stop) => ({ stop, score: scoreStop(stop, normalizedQuery) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.stop.name.localeCompare(b.stop.name, undefined, {
          sensitivity: "base",
        })
    );

  const exactNameCount = ranked.filter(
    ({ stop }) => normalizeStopQuery(stop.name) === normalizedQuery
  ).length;

  return ranked
    .slice(0, Math.max(Math.max(1, maxSuggestions), exactNameCount))
    .map(({ stop }) => stop);
}

// Shorter queries are too ambiguous for a guess: "kupi" one letter off
// matches half the city.
const MIN_SIMILAR_QUERY_LENGTH = 4;

/**
 * Edit distance with adjacent swaps counting as one ("Kauppatroi"), cut off
 * once it exceeds `limit`.
 * @param {string} a
 * @param {string} b
 * @param {number} limit
 * @returns {number}
 */
function typoDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  /** @type {number[][]} */
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[a.length][b.length];
}

/**
 * Stops whose name is one or two typing slips from the query, for when
 * nothing matches as typed: "Kauppatroi", "Kupitaa", "ylioppilaskyla".
 * Offered as suggestions only; a submit never opens a guessed stop.
 * @template {{ id: unknown, name: string }} Stop
 * @param {readonly Stop[]} stops
 * @param {unknown} query
 * @param {number} [maxSuggestions]
 * @returns {Stop[]}
 */
export function findSimilarStops(
  stops,
  query,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS
) {
  const normalizedQuery = normalizeStopQuery(query);
  if (normalizedQuery.length < MIN_SIMILAR_QUERY_LENGTH) return [];
  if (/^\d+$/.test(normalizedQuery)) return [];
  const limit = normalizedQuery.length >= 7 ? 2 : 1;

  /** @type {Map<string, { stop: Stop, distance: number }>} */
  const best = new Map();
  for (const stop of stops) {
    const name = normalizeStopQuery(stop.name);
    if (!name) continue;
    // The whole name, each word of it, and the name's start as far as the
    // query reaches, so a slip early in a long name still finds it.
    const candidates = [
      name,
      ...name.split(/[\s-]+/),
      name.slice(0, normalizedQuery.length),
    ];
    let distance = limit + 1;
    for (const candidate of candidates) {
      if (!candidate) continue;
      distance = Math.min(distance, typoDistance(normalizedQuery, candidate, limit));
      if (distance === 0) break;
    }
    if (distance > limit) continue;
    const key = String(stop.id);
    const previous = best.get(key);
    if (!previous || distance < previous.distance) best.set(key, { stop, distance });
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.stop.name.localeCompare(b.stop.name, undefined, { sensitivity: "base" })
    )
    .slice(0, Math.max(1, maxSuggestions))
    .map(({ stop }) => stop);
}
