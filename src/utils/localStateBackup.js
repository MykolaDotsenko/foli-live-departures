import { normalizedPastTimestamp } from "./cacheTime";
import { realStopName } from "./stopNames";
import { LOCAL_STATE_IMPORTED_EVENT } from "./localStateEvents";

/** @typedef {{ id: string, name: string }} BackupStop */
/** @typedef {BackupStop & { viewedAt?: number }} RecentStop */
/** @typedef {{
 *   id: string,
 *   label: string,
 *   stops: BackupStop[],
 *   primaryStopId: string,
 *   updatedAt: number,
 *   validatedAt: number,
 *   needsReview: boolean,
 * }} BackupPlace */
/** @typedef {{ stopId: string, lines: string[], savedAt: number }} LineFilter */
/** @typedef {"en" | "fi"} InterfaceLanguage */
/** @typedef {"light" | "dark"} InterfaceTheme */
/** @typedef {Pick<Storage, "getItem" | "setItem" | "removeItem">} StorageLike */
/** @typedef {{
 *   places: BackupPlace[],
 *   favorites: BackupStop[],
 *   recents: RecentStop[],
 *   lineFilters: LineFilter[],
 *   language: InterfaceLanguage | null,
 *   theme: InterfaceTheme | null,
 * }} LocalState */
/** @typedef {{
 *   places: BackupPlace[],
 *   favorites: BackupStop[],
 *   lineFilters: LineFilter[],
 *   language: InterfaceLanguage | null,
 *   theme: InterfaceTheme | null,
 * }} IncomingState */
/** @typedef {{
 *   placeCount: number,
 *   favoriteCount: number,
 *   lineFilterCount: number,
 *   placesAdded: number,
 *   placesUpdated: number,
 *   placesKept: number,
 *   favoritesAdded: number,
 *   lineFiltersAdded: number,
 *   lineFiltersUpdated: number,
 *   lineFiltersKept: number,
 *   lineFiltersSkipped: number,
 *   language: InterfaceLanguage | null,
 *   theme: InterfaceTheme | null,
 *   languageWillImport: boolean,
 *   themeWillImport: boolean,
 * }} ImportPreview */
/** @typedef {{
 *   places: BackupPlace[],
 *   savedStops: { favorites: BackupStop[], recents: RecentStop[] },
 *   lineFilters: LineFilter[],
 *   language: InterfaceLanguage | null,
 *   theme: InterfaceTheme | null,
 * }} NextLocalState */
/** @typedef {{
 *   incoming: IncomingState,
 *   preview: ImportPreview,
 *   next: NextLocalState,
 * }} PreparedImport */

export const BACKUP_KIND = "turku-departures-local-state";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 128_000;

export const LOCAL_STATE_KEYS = Object.freeze({
  places: "foli-my-places-v1",
  savedStops: "foli-saved-stops-v1",
  lineFilters: "foli-line-filter-v1",
  language: "foli-language-v1",
  theme: "foli-theme-v1",
});

/** @type {Readonly<Record<string, string>>} */
const PLACE_PRESETS = Object.freeze({
  home: "Home",
  school: "School",
  work: "Work",
});
const PLACE_IDS = new Set(Object.keys(PLACE_PRESETS));
const LANGUAGES = new Set(["en", "fi"]);
const THEMES = new Set(["light", "dark"]);
const MAX_PLACE_STOPS = 3;
const MAX_FILTER_STOPS = 20;
const MAX_LINE_LENGTH = 12;
const MAX_STOP_NAME_LENGTH = 80;

/**
 * @param {string | null | undefined} value
 * @param {any} fallback
 * @returns {any}
 */
function parseJson(value, fallback) {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
}

/** @param {unknown} value @returns {string} */
function cleanStopName(value) {
  return realStopName(
    String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_STOP_NAME_LENGTH)
  );
}

/** @param {any} stop @returns {BackupStop | null} */
function normalizeStop(stop) {
  if (!stop || typeof stop !== "object") return null;
  const id = String(stop.id || "").trim();
  if (!/^\d+$/.test(id)) return null;
  return { id, name: cleanStopName(stop.name) };
}

/** @param {any} stops @param {number} limit @returns {BackupStop[]} */
function uniqueStops(stops, limit) {
  const seen = new Set();
  const result = [];
  for (const source of Array.isArray(stops) ? stops : []) {
    const stop = normalizeStop(source);
    if (!stop || seen.has(stop.id)) continue;
    seen.add(stop.id);
    result.push(stop);
    if (result.length >= limit) break;
  }
  return result;
}

/** @param {any} place @returns {BackupPlace | null} */
function normalizePlace(place) {
  if (!place || typeof place !== "object") return null;
  const id = String(place.id || "").trim();
  if (!PLACE_IDS.has(id)) return null;
  const stops = uniqueStops(place.stops, MAX_PLACE_STOPS);
  if (stops.length === 0) return null;
  const requestedPrimary = String(place.primaryStopId || "");
  const primaryStopId = stops.some((stop) => stop.id === requestedPrimary)
    ? requestedPrimary
    : stops[0].id;
  return {
    id,
    label: PLACE_PRESETS[id],
    stops,
    primaryStopId,
    updatedAt: normalizedPastTimestamp(place.updatedAt),
    validatedAt: 0,
    needsReview: false,
  };
}

/** @param {any} places @returns {BackupPlace[]} */
function normalizePlaces(places) {
  const byId = new Map();
  for (const source of Array.isArray(places) ? places : []) {
    const place = normalizePlace(source);
    if (!place) continue;
    const existing = byId.get(place.id);
    if (!existing || place.updatedAt > existing.updatedAt) {
      byId.set(place.id, place);
    }
  }
  return [...byId.values()];
}

/** @param {any} favorites @returns {BackupStop[]} */
function normalizeFavorites(favorites) {
  // Saved favourites have no product-level capacity. Preserve every valid
  // unique favourite; the import document itself is already byte-capped.
  return uniqueStops(favorites, Number.POSITIVE_INFINITY);
}

/** @param {any} recents @returns {RecentStop[]} */
function normalizeRecentStops(recents) {
  return uniqueStops(recents, 5)
    .map((stop) => {
      const source = Array.isArray(recents)
        ? recents.find((item) => String(item?.id || "") === stop.id)
        : null;
      const viewedAt = normalizedPastTimestamp(source?.viewedAt);
      return viewedAt > 0 ? { ...stop, viewedAt } : stop;
    });
}

/** @param {any} lines @returns {string[]} */
function normalizeLines(lines) {
  return [
    ...new Set(
      (Array.isArray(lines) ? lines : [])
        .map((line) => String(line ?? "").trim())
        .filter((line) => line && line.length <= MAX_LINE_LENGTH)
    ),
  ];
}

/** @param {any} value @returns {LineFilter[]} */
function normalizeFilterEntries(value) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([stopId, entry]) => ({ stopId, ...entry }))
      : [];
  const byStop = new Map();

  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const stopId = String(entry.stopId || "").trim();
    if (!/^\d+$/.test(stopId)) continue;
    const lines = normalizeLines(entry.lines);
    if (lines.length === 0) continue;
    const normalized = {
      stopId,
      lines,
      savedAt: normalizedPastTimestamp(entry.savedAt),
    };
    const existing = byStop.get(stopId);
    if (!existing || normalized.savedAt > existing.savedAt) {
      byStop.set(stopId, normalized);
    }
  }

  return [...byStop.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_FILTER_STOPS);
}

/** @param {unknown} value @returns {InterfaceLanguage | null} */
function normalizeLanguage(value) {
  const language = String(value || "");
  return LANGUAGES.has(language)
    ? /** @type {InterfaceLanguage} */ (language)
    : null;
}

/** @param {unknown} value @returns {InterfaceTheme | null} */
function normalizeTheme(value) {
  const theme = String(value || "");
  return THEMES.has(theme) ? /** @type {InterfaceTheme} */ (theme) : null;
}

/** @param {StorageLike} storage @returns {LocalState} */
function currentState(storage) {
  const places = normalizePlaces(
    parseJson(storage?.getItem(LOCAL_STATE_KEYS.places), [])
  );
  const savedStopsRaw = parseJson(
    storage?.getItem(LOCAL_STATE_KEYS.savedStops),
    {}
  );
  const favorites = normalizeFavorites(savedStopsRaw?.favorites);
  const recents = normalizeRecentStops(savedStopsRaw?.recents);
  const lineFilters = normalizeFilterEntries(
    parseJson(storage?.getItem(LOCAL_STATE_KEYS.lineFilters), {})
  );
  const language = normalizeLanguage(
    storage?.getItem(LOCAL_STATE_KEYS.language)
  );
  const theme = normalizeTheme(storage?.getItem(LOCAL_STATE_KEYS.theme));

  return { places, favorites, recents, lineFilters, language, theme };
}

/** @param {BackupPlace} place */
function exportablePlace(place) {
  return {
    id: place.id,
    stops: place.stops,
    primaryStopId: place.primaryStopId,
    updatedAt: place.updatedAt,
  };
}

/** @param {LineFilter} entry */
function exportableFilter(entry) {
  return {
    stopId: entry.stopId,
    lines: entry.lines,
    savedAt: entry.savedAt,
  };
}

/** @param {{ storage?: StorageLike, now?: number }} [options] */
export function createLocalStateBackup({
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  const state = currentState(storage);
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: {
      places: state.places.map(exportablePlace),
      favorites: state.favorites,
      lineFilters: state.lineFilters.map(exportableFilter),
      preferences: {
        language: state.language,
        theme: state.theme,
      },
    },
  };
}

/** @param {{ storage?: StorageLike, now?: number }} [options] */
export function serializeLocalStateBackup(options) {
  return JSON.stringify(createLocalStateBackup(options), null, 2);
}

/** @param {any} payload @returns {IncomingState} */
function normalizeIncoming(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("backup-not-object");
  }
  if (payload.kind !== BACKUP_KIND) {
    throw new Error("backup-wrong-kind");
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new Error("backup-unsupported-version");
  }

  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {};

  return {
    places: normalizePlaces(data.places),
    favorites: normalizeFavorites(data.favorites),
    lineFilters: normalizeFilterEntries(data.lineFilters),
    language: normalizeLanguage(data.preferences?.language),
    theme: normalizeTheme(data.preferences?.theme),
  };
}

/** @param {BackupPlace[]} current @param {BackupPlace[]} incoming */
function mergePlaces(current, incoming) {
  const byId = new Map(current.map((place) => [place.id, place]));
  let added = 0;
  let updated = 0;
  let kept = 0;

  for (const place of incoming) {
    const existing = byId.get(place.id);
    if (!existing) {
      byId.set(place.id, place);
      added += 1;
    } else if (place.updatedAt > existing.updatedAt) {
      byId.set(place.id, place);
      updated += 1;
    } else {
      kept += 1;
    }
  }

  return { value: [...byId.values()], added, updated, kept };
}

/** @param {BackupStop[]} current @param {BackupStop[]} incoming */
function mergeFavorites(current, incoming) {
  const byId = new Map(current.map((stop) => [stop.id, stop]));
  let added = 0;

  for (const stop of incoming) {
    const existing = byId.get(stop.id);
    if (existing) {
      if (!existing.name && stop.name) byId.set(stop.id, stop);
      continue;
    }

    byId.set(stop.id, stop);
    added += 1;
  }

  return { value: [...byId.values()], added };
}

/** @param {LineFilter[]} current @param {LineFilter[]} incoming */
function mergeFilters(current, incoming) {
  const byStop = new Map(current.map((entry) => [entry.stopId, entry]));
  let added = 0;
  let updated = 0;
  let kept = 0;
  let skipped = 0;

  for (const entry of incoming) {
    const existing = byStop.get(entry.stopId);
    if (existing) {
      if (entry.savedAt > existing.savedAt) {
        byStop.set(entry.stopId, entry);
        updated += 1;
      } else {
        kept += 1;
      }
      continue;
    }

    // The normal UI caps stored filters at 20. During import, preserve all
    // valid current filters first; an imported extra is skipped rather than
    // evicting a current passenger preference.
    if (byStop.size >= MAX_FILTER_STOPS) {
      skipped += 1;
      continue;
    }

    byStop.set(entry.stopId, entry);
    added += 1;
  }

  const value = [...byStop.values()].sort((a, b) => b.savedAt - a.savedAt);

  return { value, added, updated, kept, skipped };
}

/**
 * @param {IncomingState} incoming
 * @param {LocalState} current
 * @returns {{ preview: ImportPreview, next: NextLocalState }}
 */
function mergeIncomingWithCurrent(incoming, current) {
  const places = mergePlaces(current.places, incoming.places);
  const favorites = mergeFavorites(current.favorites, incoming.favorites);
  const filters = mergeFilters(current.lineFilters, incoming.lineFilters);

  const languageWillImport =
    current.language === null && incoming.language !== null;
  const themeWillImport = current.theme === null && incoming.theme !== null;

  return {
    preview: {
      placeCount: incoming.places.length,
      favoriteCount: incoming.favorites.length,
      lineFilterCount: incoming.lineFilters.length,
      placesAdded: places.added,
      placesUpdated: places.updated,
      placesKept: places.kept,
      favoritesAdded: favorites.added,
      lineFiltersAdded: filters.added,
      lineFiltersUpdated: filters.updated,
      lineFiltersKept: filters.kept,
      lineFiltersSkipped: filters.skipped,
      language: incoming.language,
      theme: incoming.theme,
      languageWillImport,
      themeWillImport,
    },
    next: {
      places: places.value,
      savedStops: {
        favorites: favorites.value,
        recents: current.recents,
      },
      lineFilters: filters.value,
      language: languageWillImport ? incoming.language : current.language,
      theme: themeWillImport ? incoming.theme : current.theme,
    },
  };
}

/**
 * @param {string} text
 * @param {{ storage?: StorageLike }} [options]
 * @returns {PreparedImport}
 */
export function prepareLocalStateImport(
  text,
  { storage = globalThis.localStorage } = {}
) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("backup-empty");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("backup-too-large");
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("backup-invalid-json");
  }

  const incoming = normalizeIncoming(payload);
  return {
    incoming,
    ...mergeIncomingWithCurrent(incoming, currentState(storage)),
  };
}

/** @param {LineFilter[]} entries */
function filtersForStorage(entries) {
  return Object.fromEntries(
    entries.map((entry) => [
      entry.stopId,
      { lines: entry.lines, savedAt: entry.savedAt },
    ])
  );
}

/**
 * @param {PreparedImport} prepared
 * @param {{ storage?: StorageLike, target?: any }} [options]
 * @returns {ImportPreview}
 */
export function applyPreparedLocalStateImport(
  prepared,
  { storage = globalThis.localStorage, target = globalThis } = {}
) {
  if (!prepared?.incoming) throw new Error("backup-not-prepared");

  // A preview can stay open while another tab or this tab changes local
  // state. Rebase at confirmation time so the import can never write the
  // stale preview snapshot back over newer passenger data.
  let rebased;
  try {
    rebased = mergeIncomingWithCurrent(prepared.incoming, currentState(storage));
  } catch (cause) {
    throw new Error("backup-storage-unavailable", { cause });
  }

  const writes = [
    [
      LOCAL_STATE_KEYS.places,
      JSON.stringify(rebased.next.places),
    ],
    [
      LOCAL_STATE_KEYS.savedStops,
      JSON.stringify(rebased.next.savedStops),
    ],
    [
      LOCAL_STATE_KEYS.lineFilters,
      JSON.stringify(filtersForStorage(rebased.next.lineFilters)),
    ],
  ];

  if (rebased.next.language) {
    writes.push([LOCAL_STATE_KEYS.language, rebased.next.language]);
  }
  if (rebased.next.theme) {
    writes.push([LOCAL_STATE_KEYS.theme, rebased.next.theme]);
  }

  let originals;
  try {
    originals = new Map(
      writes.map(([key]) => [key, storage.getItem(key)])
    );
  } catch (cause) {
    throw new Error("backup-storage-unavailable", { cause });
  }

  try {
    for (const [key, value] of writes) storage.setItem(key, value);
  } catch (cause) {
    // localStorage has no transaction. Restore every touched key best-effort
    // before reporting failure, so a quota/security error cannot leave a
    // half-imported mix of origins behind.
    for (const [key] of [...writes].reverse()) {
      try {
        const original = originals.get(key);
        if (original == null) storage.removeItem(key);
        else storage.setItem(key, original);
      } catch {
        // The caller gets an honest failure; no success event is emitted.
      }
    }
    throw new Error("backup-apply-failed", { cause });
  }

  const EventCtor = target?.Event || globalThis.Event;
  if (target?.dispatchEvent && typeof EventCtor === "function") {
    target.dispatchEvent(new EventCtor(LOCAL_STATE_IMPORTED_EVENT));
  }

  return rebased.preview;
}
