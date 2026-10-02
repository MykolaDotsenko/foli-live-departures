// The interface speaks the passenger's language: Finnish when the phone asks
// for it, English otherwise, and whichever the passenger picks from then on.
// Stop and destination names are never translated. They are what the stop
// pole and the bus sign say, in every language.
//
// The English text is the key, so the code reads as the screen does and a
// phrase missing from a dictionary falls back to English instead of breaking.
// A dictionary entry is either a template ("Stop {id}") or, where word forms
// follow a number, a function of the same parameters.
import { useSyncExternalStore } from "react";
import {
  LANGUAGE_CODES,
  isSupportedLanguage,
  localeDefinition,
} from "./locales";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

/** @typedef {import("./locales").Language} Language */

/**
 * The values a phrase's placeholders are filled from, by placeholder name.
 * @typedef {Record<string, string | number>} TranslationParams
 */

/**
 * One dictionary entry: a template with `{name}` placeholders, or a function
 * of the same parameters where word forms follow a number.
 * @typedef {string | ((params: TranslationParams) => string)} Translation
 */

/**
 * Translations keyed by the English phrase (or "context|phrase", see tc()).
 * @typedef {Record<string, Translation>} Dictionary
 */

/** @type {readonly Language[]} */
export const LANGUAGES = LANGUAGE_CODES;

/** @type {Partial<Record<Language, Dictionary>>} */
const DICTIONARIES = { en: {} };
const STORAGE_KEY = "foli-language-v1";

/** @type {Partial<Record<Language, () => Promise<{default: Dictionary}>>>} */
const DICTIONARY_LOADERS = {
  fi: () => import("./fi"),
  uk: () => import("./uk"),
};
/** @type {Map<Language, Promise<Dictionary>>} */
const dictionaryLoads = new Map();

/**
 * Test setup and a successfully loaded locale both use the same registration
 * path. Production never imports non-English dictionaries eagerly.
 * @param {Language} language
 * @param {Dictionary} dictionary
 */
export function registerDictionary(language, dictionary) {
  if (!isLanguage(language) || language === "en" || !dictionary) return;
  DICTIONARIES[language] = dictionary;
}

/** @param {Language} language @returns {Promise<Dictionary>} */
export function ensureLanguageDictionary(language) {
  const existing = DICTIONARIES[language];
  if (existing) return Promise.resolve(existing);

  const loader = DICTIONARY_LOADERS[language];
  if (!loader) return Promise.resolve({});

  const pending =
    dictionaryLoads.get(language) ||
    loader()
      .then((module) => {
        registerDictionary(language, module.default);
        return DICTIONARIES[language] || {};
      })
      .finally(() => dictionaryLoads.delete(language));
  dictionaryLoads.set(language, pending);
  return pending;
}

/**
 * @param {unknown} value
 * @returns {value is Language}
 */
function isLanguage(value) {
  return isSupportedLanguage(value);
}

/** @returns {readonly string[]} */
function browserLanguages() {
  const nav = globalThis.navigator;
  if (!nav) return [];
  return Array.isArray(nav.languages) && nav.languages.length > 0
    ? nav.languages
    : [nav.language];
}

// The first language the phone lists that the app speaks.
/**
 * @param {readonly (string | null | undefined)[]} [languages]
 * @returns {Language}
 */
export function preferredLanguage(languages = browserLanguages()) {
  for (const tag of languages) {
    const primary = String(tag || "").toLowerCase().split("-")[0];
    if (isLanguage(primary)) return primary;
  }
  return "en";
}

/** @returns {Language | null} */
function storedLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // Blocked storage: the phone's own language still applies.
    return null;
  }
}

/** @param {Language} language */
function applyToDocument(language) {
  // Screen readers pick their voice from this, and the browser its
  // hyphenation and quotes.
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = language;
  }
}

/** @type {Language} */
let current = storedLanguage() || preferredLanguage();
/** @type {Set<() => void>} */
const listeners = new Set();
applyToDocument(current);

globalThis.addEventListener?.(LOCAL_STATE_IMPORTED_EVENT, () => {
  const next = storedLanguage() || preferredLanguage();
  if (next !== current) {
    void setLanguage(next);
  } else {
    applyToDocument(next);
  }
});

/** @returns {Language} */
export function getLanguage() {
  return current;
}

/** @param {Language} language */
function switchTo(language) {
  current = language;
  applyToDocument(language);
  listeners.forEach((listener) => listener());
}

/**
 * Accepts any code: one the app does not speak is ignored.
 * @param {string} language
 */
export function setLanguage(language) {
  if (!isLanguage(language) || language === current) {
    return Promise.resolve(false);
  }

  const activate = () => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, language);
    } catch {
      // Still switches for this visit.
    }
    switchTo(language);
    return true;
  };

  if (DICTIONARIES[language]) {
    return Promise.resolve(activate());
  }

  return ensureLanguageDictionary(language)
    .then(activate)
    .catch(() => false);
}

/**
 * Load the selected non-English dictionary before the first React render.
 * If it cannot load, fail closed to English rather than showing a half-
 * translated interface.
 * @returns {Promise<Language>}
 */
export async function initializeLanguage() {
  try {
    await ensureLanguageDictionary(current);
  } catch {
    current = "en";
  }
  applyToDocument(current);
  return current;
}

// Tests start every case from the same place, without touching storage.
/** @param {string} [language] */
export function resetLanguageForTests(language = "en") {
  switchTo(isLanguage(language) ? language : "en");
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Re-renders the calling component when the language changes.
/** @returns {Language} */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

// Marks a phrase for translation where it is defined, in a table built
// before any language is known; t() translates it where it is shown.
/**
 * @template {string} Key
 * @param {Key} key
 * @returns {Key}
 */
export function msg(key) {
  return key;
}

/**
 * @param {Translation} template
 * @param {TranslationParams} [params]
 * @returns {string}
 */
function render(template, params) {
  if (typeof template === "function") return template(params ?? {});
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, /** @type {string} */ name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match
  );
}

/**
 * @param {string} key The English phrase.
 * @param {TranslationParams} [params]
 * @returns {string}
 */
export function t(key, params) {
  return render(DICTIONARIES[current]?.[key] ?? key, params);
}

// Where one English phrase carries two meanings ("Due" heads the time column
// and is also what a bus due now says), a context keeps the translations
// apart. The dictionary holds it as "context|phrase"; English shows the
// phrase alone.
/**
 * @param {string} context
 * @param {string} key The English phrase.
 * @param {TranslationParams} [params]
 * @returns {string}
 */
export function tc(context, key, params) {
  return render(DICTIONARIES[current]?.[`${context}|${key}`] ?? key, params);
}

// Dates and numbers follow the language; the transit clock does not (see
// TRANSIT_CLOCK_LOCALE in utils/time.js).
/**
 * @param {Language} [language]
 * @returns {string}
 */
export function intlLocale(language = current) {
  return localeDefinition(language).intlLocale;
}

/**
 * Speech APIs need a full BCP-47 locale even though document.lang stays the
 * short interface code.
 *
 * @param {Language} [language]
 * @returns {string}
 */
export function speechLocale(language = current) {
  return localeDefinition(language).speechLocale;
}

// Which of Föli's own texts to show: its notices and destination names come
// in Finnish, with Swedish and English translations. In the Finnish
// interface that is the Finnish original, never a translation the phone
// happens to list next. In English the phone's own languages come first (a
// Swedish phone keeps Föli's Swedish), then English, but never Finnish,
// which the passenger has just chosen not to read.
/**
 * @param {Language} [language]
 * @returns {string[]}
 */
export function providerLanguages(language = current) {
  if (localeDefinition(language).providerMode === "finnish") return ["fi"];
  return [
    ...browserLanguages().filter(
      (tag) => tag && !/^fi\b/i.test(String(tag))
    ),
    "en",
  ];
}
