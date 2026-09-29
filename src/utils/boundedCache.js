const DEFAULT_MAX_ENTRIES = 50;

/**
 * @template K, V
 * @typedef {object} BoundedCache
 * @property {(key: K) => boolean} has
 * @property {(key: K) => V | undefined} get
 * @property {(key: K, value: V) => V} set
 * @property {() => void} clear
 * @property {number} size
 */

/**
 * Least-recently-used cache for provider responses that would otherwise grow
 * without bound in a long-running session, such as a stop display left open
 * for days.
 *
 * @template K, V
 * @param {number} [maxEntries]
 * @returns {BoundedCache<K, V>}
 */
export default function createBoundedCache(maxEntries = DEFAULT_MAX_ENTRIES) {
  const limit = Math.max(1, Math.floor(Number(maxEntries) || 0) || 1);
  /** @type {Map<K, V>} */
  const entries = new Map();

  return {
    /** @param {K} key */
    has(key) {
      return entries.has(key);
    },

    /** @param {K} key */
    get(key) {
      if (!entries.has(key)) return undefined;

      // Re-insert so the most recently read key is evicted last.
      const value = /** @type {V} */ (entries.get(key));
      entries.delete(key);
      entries.set(key, value);
      return value;
    },

    /**
     * @param {K} key
     * @param {V} value
     */
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);

      while (entries.size > limit) {
        // The loop only runs on a non-empty map, so the oldest key exists.
        entries.delete(/** @type {K} */ (entries.keys().next().value));
      }

      return value;
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
