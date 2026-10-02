/**
 * Locale metadata is the single source of truth for every interface language.
 * A dictionary is enabled only when its code appears here and in i18n/index.js.
 *
 * @typedef {"en" | "fi" | "uk"} Language
 * @typedef {{
 *   code: Language,
 *   nativeLabel: string,
 *   switchLabel: string,
 *   intlLocale: string,
 *   speechLocale: string,
 *   providerMode: "finnish" | "translated",
 * }} LocaleDefinition
 */

/** @type {readonly LocaleDefinition[]} */
export const LOCALES = Object.freeze([
  Object.freeze({
    code: "en",
    nativeLabel: "English",
    switchLabel: "In English",
    intlLocale: "en-GB",
    speechLocale: "en-GB",
    providerMode: "translated",
  }),
  Object.freeze({
    code: "fi",
    nativeLabel: "Suomi",
    switchLabel: "Suomeksi",
    intlLocale: "fi-FI",
    speechLocale: "fi-FI",
    providerMode: "finnish",
  }),
  Object.freeze({
    code: "uk",
    nativeLabel: "Українська",
    switchLabel: "Українською",
    intlLocale: "uk-UA",
    speechLocale: "uk-UA",
    providerMode: "translated",
  }),
]);

/** @type {readonly Language[]} */
export const LANGUAGE_CODES = Object.freeze(
  LOCALES.map((locale) => locale.code)
);

/** @param {unknown} value @returns {value is Language} */
export function isSupportedLanguage(value) {
  return LOCALES.some((locale) => locale.code === value);
}

/** @param {unknown} value @returns {LocaleDefinition} */
export function localeDefinition(value) {
  return (
    LOCALES.find((locale) => locale.code === value) ||
    LOCALES[0]
  );
}

/**
 * Compact-header control helper. It remains generic as more languages are
 * enabled: the next option always comes from the registry, never a hard-coded
 * language pair.
 *
 * @param {Language} current
 * @returns {LocaleDefinition}
 */
export function nextLocaleDefinition(current) {
  const index = LOCALES.findIndex((locale) => locale.code === current);
  return LOCALES[(index + 1 + LOCALES.length) % LOCALES.length] || LOCALES[0];
}
