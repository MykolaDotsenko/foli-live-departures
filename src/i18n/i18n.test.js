import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import fi, { AREAS as FI_AREAS } from "./fi";
import uk, { AREAS as UK_AREAS } from "./uk";
import sv, { AREAS as SV_AREAS } from "./sv";
import {
  ensureLanguageDictionary,
  getLanguage,
  preferredLanguage,
  registerDictionary,
  resetLanguageForTests,
  providerLanguages,
  setLanguage,
  speechLocale,
  intlLocale,
  t,
  tc,
} from ".";
import {
  LANGUAGE_CODES,
  isSupportedLanguage,
  localeDefinition,
  nextLocaleDefinition,
} from "./locales";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "i18n" ? [] : sourceFiles(full);
    }
    return /\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [full]
      : [];
  });
}

// Every phrase the code asks for: t("…") where it is shown, msg("…") where a
// table defines it.
const CALL =
  /\b(?:t|msg)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g;

function unescape(raw) {
  return raw.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
}

// tc("context", "…"), kept in the dictionary as "context|…".
const CONTEXT_CALL = /\btc\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;

function phrasesInCode() {
  const found = new Map();
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    const phrases = [
      ...[...source.matchAll(CALL)].map((match) =>
        unescape(match[1] ?? match[2] ?? match[3])
      ),
      ...[...source.matchAll(CONTEXT_CALL)].map(
        (match) => `${match[1]}|${unescape(match[2])}`
      ),
    ];
    for (const phrase of phrases) {
      if (!found.has(phrase)) found.set(phrase, path.relative(SRC, file));
    }
  }
  return found;
}

const placeholders = (text) =>
  [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

afterEach(() => {
  resetLanguageForTests("en");
  localStorage.clear();
});

const LOCALIZED_DICTIONARIES = { fi, uk, sv };
const LOCALIZED_AREAS = { fi: FI_AREAS, uk: UK_AREAS, sv: SV_AREAS };

for (const [language, dictionary] of Object.entries(LOCALIZED_DICTIONARIES)) {
  test(`every phrase the code shows has a ${language} translation`, () => {
    const missing = [...phrasesInCode()]
      .filter(([phrase]) => !Object.hasOwn(dictionary, phrase))
      .map(([phrase, file]) => `${file}: ${phrase}`);
    expect(missing).toEqual([]);
  });

  test(`every ${language} translation is still asked for by the code`, () => {
    const used = phrasesInCode();
    const stale = Object.keys(dictionary).filter((phrase) => !used.has(phrase));
    expect(stale).toEqual([]);
  });

  test(`${language} translations keep phrase placeholders`, () => {
    const mismatched = Object.entries(dictionary)
      .filter(([, value]) => typeof value === "string")
      .filter(([phrase, value]) =>
        placeholders(phrase).join() !== placeholders(value).join()
      )
      .map(([phrase]) => phrase);
    expect(mismatched).toEqual([]);
  });

  test(`no ${language} areas translate the same phrase differently`, () => {
    const seen = new Map();
    const conflicts = [];
    for (const [area, entries] of Object.entries(LOCALIZED_AREAS[language])) {
      for (const [phrase, value] of Object.entries(entries)) {
        if (seen.has(phrase) && seen.get(phrase).value !== value) {
          conflicts.push(`${phrase} (${seen.get(phrase).area}, ${area})`);
        }
        seen.set(phrase, { area, value });
      }
    }
    expect(conflicts).toEqual([]);
  });
}

// Text a component shows outside t() stays English whatever the language.
// ESLint catches literal text between tags; this catches it in the
// attributes a screen reader or a placeholder reads out.
const SPOKEN_ATTRIBUTE =
  /\b(aria-label|aria-description|aria-valuetext|aria-roledescription|placeholder|alt|title)=/g;
const WORDS = /[A-Za-z]{2,}/;

// The text from an opening bracket to the one that closes it.
function balanced(text, start) {
  const open = text[start];
  const close = { "{": "}", "(": ")" }[open];
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return text.slice(start);
}

// What is left of an expression once every t(…) and tc(…) is taken out.
function withoutTranslations(expression) {
  let rest = expression;
  for (let at = rest.search(/\bt[c]?\(/); at !== -1; at = rest.search(/\bt[c]?\(/)) {
    const paren = rest.indexOf("(", at);
    rest = rest.slice(0, at) + rest.slice(paren + balanced(rest, paren).length);
  }
  return rest;
}

function untranslatedAttributes(source) {
  return [...source.matchAll(SPOKEN_ATTRIBUTE)].flatMap((match) => {
    const valueAt = match.index + match[0].length;
    const value =
      source[valueAt] === "{"
        ? withoutTranslations(balanced(source, valueAt))
        : (source.slice(valueAt).match(/^"[^"]*"/)?.[0] ?? "");
    const literals = value.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
    return literals
      .filter((literal) => WORDS.test(literal.replace(/\$\{[^}]*\}/g, "")))
      .map((literal) => `${match[1]}=${literal}`);
  });
}

test("the attribute check finds English however it is written", () => {
  expect(
    untranslatedAttributes(`
      <a aria-label="Open map" />
      <b title={"Close panel"} />
      <c alt={\`Map of \${name}\`} />
      <d placeholder={busy ? "Searching" : t("Search")} />
      <e aria-label={t("Line {line}", { line })} title={name || undefined} />
      <f aria-label={\`\${name} · \${id}\`} />
    `)
  ).toEqual([
    'aria-label="Open map"',
    'title="Close panel"',
    "alt=`Map of ${name}`",
    'placeholder="Searching"',
  ]);
});

test("no component names a control in literal English", () => {
  const found = sourceFiles()
    .filter((file) => file.endsWith(".jsx"))
    .flatMap((file) =>
      untranslatedAttributes(readFileSync(file, "utf8")).map(
        (attribute) => `${path.relative(SRC, file)}: ${attribute}`
      )
    );

  expect(found).toEqual([]);
});

test("the page's own title is the phrase the app translates", () => {
  const html = readFileSync(path.resolve(SRC, "../index.html"), "utf8");
  const title = html
    .match(/<title>([^<]+)<\/title>/)?.[1]
    ?.replaceAll("&amp;", "&");

  expect(title).toBe("Turku Departures · Live bus times & get-off alerts");
});

test("follows the first language the phone lists that the app speaks", () => {
  expect(preferredLanguage(["fi-FI", "en-US"])).toBe("fi");
  expect(preferredLanguage(["uk-UA", "fi", "en"])).toBe("uk");
  expect(preferredLanguage(["sv-FI", "uk", "fi"])).toBe("sv");
  expect(preferredLanguage(["en-US", "uk"])).toBe("en");
  expect(preferredLanguage(["de-DE"])).toBe("en");
  expect(preferredLanguage([])).toBe("en");
  expect(preferredLanguage([undefined, null, ""])).toBe("en");
});

test("locale registry is the source of truth for formatting, speech and switching", () => {
  expect(LANGUAGE_CODES).toEqual(["en", "fi", "uk", "sv"]);
  expect(localeDefinition("fi")).toMatchObject({
    nativeLabel: "Suomi",
    intlLocale: "fi-FI",
    speechLocale: "fi-FI",
  });
  expect(intlLocale("fi")).toBe("fi-FI");
  expect(intlLocale("uk")).toBe("uk-UA");
  expect(intlLocale("sv")).toBe("sv-FI");
  expect(intlLocale("en")).toBe("en-GB");
  expect(speechLocale("fi")).toBe("fi-FI");
  expect(speechLocale("uk")).toBe("uk-UA");
  expect(speechLocale("sv")).toBe("sv-FI");
  expect(nextLocaleDefinition("en").code).toBe("fi");
  expect(nextLocaleDefinition("fi").code).toBe("uk");
  expect(nextLocaleDefinition("uk").code).toBe("sv");
  expect(nextLocaleDefinition("sv").code).toBe("en");
  expect(isSupportedLanguage("en")).toBe(true);
  expect(isSupportedLanguage("uk")).toBe(true);
  expect(isSupportedLanguage("sv")).toBe(true);
  expect(isSupportedLanguage("xx")).toBe(false);
  expect(localeDefinition("xx").code).toBe("en");
  expect(nextLocaleDefinition(/** @type {any} */ ("xx")).code).toBe("en");
});

test("switching language updates the page, remembers the choice and tells listeners", () => {
  setLanguage("fi");

  expect(getLanguage()).toBe("fi");
  expect(document.documentElement.lang).toBe("fi");
  expect(localStorage.getItem("foli-language-v1")).toBe("fi");
  expect(t("Online")).toBe("Yhteys toimii");

  setLanguage("uk");
  expect(document.documentElement.lang).toBe("uk");
  expect(localStorage.getItem("foli-language-v1")).toBe("uk");
  expect(t("Online")).toBe("Онлайн");

  setLanguage("sv");
  expect(document.documentElement.lang).toBe("sv");
  expect(localStorage.getItem("foli-language-v1")).toBe("sv");
  expect(t("Online")).toBe("Online");

  setLanguage("en");
  expect(document.documentElement.lang).toBe("en");
  expect(t("Online")).toBe("Online");
});

test("an unknown language is ignored", () => {
  setLanguage("xx");

  expect(getLanguage()).toBe("en");
});

const FI_RUNTIME_KEYS = [
  "{count} service updates",
  "Show {count} more updates",
  "live",
  "{count} scheduled",
];

function compactFiFixture({
  keys = ["Online", ...FI_RUNTIME_KEYS],
  values = ["Yhteys toimii", null, null, null, null],
  fiStatus = 200,
} = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const isKeys = /locales\/keys\.json$/.test(url);
    const isFi = /locales\/fi\.json$/.test(url);

    if (!isKeys && !isFi) {
      throw new Error(`Unexpected locale request: ${url}`);
    }

    const status = isFi ? fiStatus : 200;
    return /** @type {Response} */ ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => (isKeys ? keys : values),
    });
  });
}

test("loads compact locale values against the shared key pack and overlays runtime grammar", async () => {
  vi.resetModules();
  const fetchMock = compactFiFixture();

  try {
    const fresh = await import("./index.js");
    const dictionary = await fresh.ensureLanguageDictionary("fi");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/locales\/keys\.json$/),
      { cache: "force-cache" }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/locales\/fi\.json$/),
      { cache: "force-cache" }
    );
    expect(dictionary.Online).toBe("Yhteys toimii");
    expect(typeof dictionary["{count} service updates"]).toBe("function");
  } finally {
    fetchMock.mockRestore();
  }
});

test("a slower older cross-tab language load cannot overwrite a newer preference", async () => {
  // Keep the already-imported module from issuing its own fetch when the
  // storage event is dispatched; the fresh module below is the one under test.
  registerDictionary("fi", fi);
  localStorage.setItem("foli-language-v1", "en");

  let releaseFiValues;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (/locales\/keys\.json$/.test(url)) {
      return Promise.resolve(
        /** @type {Response} */ ({
          ok: true,
          status: 200,
          json: async () => ["Online", ...FI_RUNTIME_KEYS],
        })
      );
    }
    if (/locales\/fi\.json$/.test(url)) {
      return new Promise((resolve) => {
        releaseFiValues = () =>
          resolve(
            /** @type {Response} */ ({
              ok: true,
              status: 200,
              json: async () => ["Yhteys toimii", null, null, null, null],
            })
          );
      });
    }
    throw new Error(`Unexpected locale request: ${url}`);
  });

  vi.resetModules();
  try {
    const fresh = await import("./index.js");
    expect(fresh.getLanguage()).toBe("en");

    localStorage.setItem("foli-language-v1", "fi");
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-language-v1",
        oldValue: "en",
        newValue: "fi",
      })
    );
    await Promise.resolve();

    localStorage.setItem("foli-language-v1", "en");
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-language-v1",
        oldValue: "fi",
        newValue: "en",
      })
    );
    expect(fresh.getLanguage()).toBe("en");

    releaseFiValues();
    await Promise.resolve();
    await Promise.resolve();
    expect(fresh.getLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  } finally {
    fetchMock.mockRestore();
    localStorage.clear();
  }
});

test("locale pack HTTP failure rejects instead of activating partial translations", async () => {
  vi.resetModules();
  const fetchMock = compactFiFixture({ fiStatus: 503 });

  try {
    const fresh = await import("./index.js");
    await expect(fresh.ensureLanguageDictionary("fi")).rejects.toThrow(
      "Could not load fi locale pack (503)."
    );
  } finally {
    fetchMock.mockRestore();
  }
});

test.each([
  ["key pack is not an array", {}, ["Yhteys toimii", null, null, null, null]],
  ["value pack is not an array", ["Online", ...FI_RUNTIME_KEYS], {}],
  ["key/value lengths differ", ["Online", ...FI_RUNTIME_KEYS], ["Yhteys toimii"]],
  [
    "key table contains a duplicate",
    ["Online", "Online", ...FI_RUNTIME_KEYS],
    ["Yhteys toimii", "Yhteys toimii", null, null, null, null],
  ],
  [
    "value slot is neither text nor runtime null",
    ["Online", ...FI_RUNTIME_KEYS],
    [42, null, null, null, null],
  ],
])("rejects a malformed compact locale pack: %s", async (_label, keys, values) => {
  vi.resetModules();
  const fetchMock = compactFiFixture({ keys, values });

  try {
    const fresh = await import("./index.js");
    await expect(fresh.ensureLanguageDictionary("fi")).rejects.toThrow(
      /Invalid (?:fi locale pack|locale key pack)/
    );
  } finally {
    fetchMock.mockRestore();
  }
});

test("compact locale runtime slots must exactly match the locale grammar module", async () => {
  vi.resetModules();
  const fetchMock = compactFiFixture({
    keys: ["Online", ...FI_RUNTIME_KEYS, "Unexpected runtime slot"],
    values: ["Yhteys toimii", null, null, null, null, null],
  });

  try {
    const fresh = await import("./index.js");
    await expect(fresh.ensureLanguageDictionary("fi")).rejects.toThrow(
      /missing runtime translation for "Unexpected runtime slot"/
    );
  } finally {
    fetchMock.mockRestore();
  }
});

test("locale registry guards duplicate, unsupported and missing-loader paths", async () => {
  resetLanguageForTests("en");

  await expect(setLanguage("en")).resolves.toBe(false);
  await expect(setLanguage("xx")).resolves.toBe(false);
  await expect(
    ensureLanguageDictionary(/** @type {any} */ ("xx"))
  ).resolves.toEqual({});

  // English is the source phrase table and unsupported/missing dictionaries
  // must never be registered over it.
  registerDictionary("en", { Online: "Wrong" });
  registerDictionary(/** @type {any} */ ("xx"), { Online: "Wrong" });
  registerDictionary("fi", /** @type {any} */ (null));
  expect(t("Online")).toBe("Online");
});

test("blocked storage still switches the language for the visit", () => {
  const setItem = vi
    .spyOn(globalThis.Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new globalThis.DOMException("blocked", "SecurityError");
    });
  try {
    expect(() => setLanguage("fi")).not.toThrow();
    expect(getLanguage()).toBe("fi");
  } finally {
    setItem.mockRestore();
  }
});

test("Ukrainian plural forms use one, few and many correctly", () => {
  resetLanguageForTests("uk");
  expect(t("{count} stops", { count: 1 })).toBe("1 зупинка");
  expect(t("{count} stops", { count: 2 })).toBe("2 зупинки");
  expect(t("{count} stops", { count: 5 })).toBe("5 зупинок");
  expect(t("{count} stops", { count: 21 })).toBe("21 зупинка");
  expect(t("{count} stops", { count: 22 })).toBe("22 зупинки");
  expect(t("{count} stops", { count: 25 })).toBe("25 зупинок");
});

test("Swedish count grammar covers singular and plural runtime branches", () => {
  resetLanguageForTests("sv");

  expect(t("{count} service updates", { count: 1 })).toBe("1 trafikmeddelande");
  expect(t("{count} service updates", { count: 3 })).toBe("3 trafikmeddelanden");
  expect(t("Show {count} more updates", { count: 1 })).toBe(
    "Visa 1 meddelande till"
  );
  expect(t("Show {count} more updates", { count: 4 })).toBe(
    "Visa 4 fler meddelanden"
  );
  expect(t("{count} upcoming", { count: 2 })).toBe("2 kommande");
  expect(t("live", { count: 1 })).toBe("realtid");
  expect(t("live", { count: 2 })).toBe("realtid");
  expect(t("{count} scheduled", { count: 2 })).toBe("2 enligt tidtabell");
  expect(t("{count} backup stops", { count: 1 })).toBe("1 reservhållplats");
  expect(t("{count} backup stops", { count: 2 })).toBe("2 reservhållplatser");
  expect(t("{count} stops", { count: 1 })).toBe("1 hållplats");
  expect(t("{count} stops", { count: 2 })).toBe("2 hållplatser");
  expect(t("{count} stops away", { count: 1 })).toBe("1 hållplats kvar");
  expect(t("{count} stops away", { count: 3 })).toBe("3 hållplatser kvar");
  expect(t("{count} options", { count: 1 })).toBe("1 alternativ");
  expect(t("{count} options", { count: 2 })).toBe("2 alternativ");
  expect(t("{count} transfers", { count: 1 })).toBe("1 byte");
  expect(t("{count} transfers", { count: 2 })).toBe("2 byten");
});

test("a context keeps two meanings of one English phrase apart", () => {
  setLanguage("fi");

  expect(t("Due")).toBe("Nyt");
  expect(tc("column", "Due")).toBe("Lähtee");
  // Untranslated, a context shows the English phrase, never the other
  // meaning's translation.
  expect(tc("nowhere", "Due")).toBe("Due");
});

test("a phrase with no translation falls back to English, placeholders filled", () => {
  setLanguage("fi");

  expect(t("A phrase nobody translated for stop {id}", { id: "164" })).toBe(
    "A phrase nobody translated for stop 164"
  );
  expect(t("Stop {id}", { id: "164" })).toBe("Pysäkki 164");
  expect(t("Stop {id}", {})).toBe("Pysäkki {id}");
});

test("reads provider text in the selected local language without inventing translations", () => {
  const languages = vi.spyOn(navigator, "languages", "get");
  try {
    languages.mockReturnValue(["fi-FI", "en-US"]);
    expect(providerLanguages("fi")).toEqual(["fi"]);
    expect(providerLanguages("sv")).toEqual(["sv", "en"]);
    expect(providerLanguages("en")).toEqual(["en-US", "en"]);

    languages.mockReturnValue(["sv-SE", "en"]);
    expect(providerLanguages("en")[0]).toBe("sv-SE");
    expect(providerLanguages("sv")).toEqual(["sv", "en"]);
  } finally {
    languages.mockRestore();
  }
});

// Before the service worker has cached the packs, a stalled network held a
// first visit's page blank until the browser gave up on the request.
test("a stalled language pack renders the first screen in English, then switches when it arrives", async () => {
  vi.resetModules();
  localStorage.clear();
  const languages = vi
    .spyOn(globalThis.navigator, "languages", "get")
    .mockReturnValue(["fi-FI"]);
  /** @type {Array<() => void>} */
  const release = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    const body = /keys\.json$/.test(url)
      ? ["Online", ...FI_RUNTIME_KEYS]
      : ["Yhteys toimii", null, null, null, null];
    return new Promise((resolve) => {
      release.push(() => resolve(/** @type {Response} */ ({ ok: true, status: 200, json: async () => body })));
    });
  });
  vi.useFakeTimers();

  try {
    const fresh = await import("./index.js");
    expect(fresh.getLanguage()).toBe("fi");

    const started = fresh.initializeLanguage();
    await vi.advanceTimersByTimeAsync(fresh.FIRST_RENDER_LANGUAGE_WAIT_MS);
    await expect(started).resolves.toBe("en");
    expect(document.documentElement.lang).toBe("en");

    release.forEach((answer) => answer());
    await vi.waitFor(() => expect(fresh.getLanguage()).toBe("fi"));
    expect(fresh.t("Online")).toBe("Yhteys toimii");
  } finally {
    vi.useRealTimers();
    fetchMock.mockRestore();
    languages.mockRestore();
    localStorage.clear();
  }
});

test("a language chosen while a stalled pack was loading is not overridden", async () => {
  vi.resetModules();
  localStorage.clear();
  const languages = vi
    .spyOn(globalThis.navigator, "languages", "get")
    .mockReturnValue(["fi-FI"]);
  /** @type {Array<() => void>} */
  const release = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    const body = /keys\.json$/.test(url)
      ? ["Online", ...FI_RUNTIME_KEYS]
      : ["Yhteys toimii", null, null, null, null];
    return new Promise((resolve) => {
      release.push(() => resolve(/** @type {Response} */ ({ ok: true, status: 200, json: async () => body })));
    });
  });
  vi.useFakeTimers();

  try {
    const fresh = await import("./index.js");
    const started = fresh.initializeLanguage();
    await vi.advanceTimersByTimeAsync(fresh.FIRST_RENDER_LANGUAGE_WAIT_MS);
    await expect(started).resolves.toBe("en");

    // English is chosen (here, in another tab) before Finnish arrives.
    localStorage.setItem("foli-language-v1", "en");
    release.forEach((answer) => answer());
    await vi.advanceTimersByTimeAsync(10);
    expect(fresh.getLanguage()).toBe("en");
  } finally {
    vi.useRealTimers();
    fetchMock.mockRestore();
    languages.mockRestore();
    localStorage.clear();
  }
});
