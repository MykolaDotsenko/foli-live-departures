/**
 * Locale metadata is the single source of truth for every interface language.
 * A dictionary is enabled only when its code appears here and in i18n/index.js.
 *
 * @typedef {"en" | "fi" | "uk" | "sv"} Language
 * @typedef {{
 *   code: Language,
 *   nativeLabel: string,
 *   intlLocale: string,
 *   speechLocale: string,
 *   providerMode: "finnish" | "swedish" | "translated",
 * }} LocaleDefinition
 */

/** @type {readonly LocaleDefinition[]} */
export const LOCALES = Object.freeze([
  Object.freeze({
    code: "en",
    nativeLabel: "English",
    intlLocale: "en-GB",
    // Preserve the established Ride Mode voice contract. Display formatting
    // can stay British English while speech continues using the widely
    // available en-US voice used and tested by earlier releases.
    speechLocale: "en-US",
    providerMode: "translated",
  }),
  Object.freeze({
    code: "fi",
    nativeLabel: "Suomi",
    intlLocale: "fi-FI",
    speechLocale: "fi-FI",
    providerMode: "finnish",
  }),
  Object.freeze({
    code: "uk",
    nativeLabel: "Українська",
    intlLocale: "uk-UA",
    speechLocale: "uk-UA",
    providerMode: "translated",
  }),
  Object.freeze({
    code: "sv",
    nativeLabel: "Svenska",
    intlLocale: "sv-FI",
    speechLocale: "sv-FI",
    providerMode: "swedish",
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
