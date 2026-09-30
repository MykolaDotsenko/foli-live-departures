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
