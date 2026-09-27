import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import fi, { AREAS } from "./fi";
import {
  getLanguage,
  preferredLanguage,
  resetLanguageForTests,
  providerLanguages,
  setLanguage,
  t,
  tc,
} from ".";

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

test("every phrase the code shows has a Finnish translation", () => {
  const missing = [...phrasesInCode()]
    .filter(([phrase]) => !Object.hasOwn(fi, phrase))
    .map(([phrase, file]) => `${file}: ${phrase}`);

  expect(missing).toEqual([]);
});

test("every Finnish translation is still asked for by the code", () => {
  const used = phrasesInCode();
  const stale = Object.keys(fi).filter((phrase) => !used.has(phrase));

  expect(stale).toEqual([]);
});

test("a translation keeps its phrase's placeholders", () => {
  const mismatched = Object.entries(fi)
    .filter(([, value]) => typeof value === "string")
    .filter(([phrase, value]) =>
      placeholders(phrase).join() !== placeholders(value).join()
    )
    .map(([phrase]) => phrase);

  expect(mismatched).toEqual([]);
});

test("no two areas translate the same phrase differently", () => {
  const seen = new Map();
  const conflicts = [];
  for (const [area, entries] of Object.entries(AREAS)) {
    for (const [phrase, value] of Object.entries(entries)) {
      if (seen.has(phrase) && seen.get(phrase).value !== value) {
        conflicts.push(`${phrase} (${seen.get(phrase).area}, ${area})`);
      }
      seen.set(phrase, { area, value });
    }
  }

  expect(conflicts).toEqual([]);
});

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
  expect(preferredLanguage(["sv-FI", "fi", "en"])).toBe("fi");
  expect(preferredLanguage(["en-US", "fi"])).toBe("en");
  expect(preferredLanguage(["de-DE"])).toBe("en");
  expect(preferredLanguage([])).toBe("en");
  expect(preferredLanguage([undefined, null, ""])).toBe("en");
});

test("switching language updates the page, remembers the choice and tells listeners", () => {
  setLanguage("fi");

  expect(getLanguage()).toBe("fi");
  expect(document.documentElement.lang).toBe("fi");
  expect(localStorage.getItem("foli-language-v1")).toBe("fi");
  expect(t("Online")).toBe("Yhteys toimii");

  setLanguage("en");
  expect(document.documentElement.lang).toBe("en");
  expect(t("Online")).toBe("Online");
});

test("an unknown language is ignored", () => {
  setLanguage("xx");

  expect(getLanguage()).toBe("en");
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

test("reads Föli's own texts in the Finnish original, or the phone's languages in English", () => {
  const languages = vi.spyOn(navigator, "languages", "get");
  try {
    languages.mockReturnValue(["fi-FI", "en-US"]);
    expect(providerLanguages("fi")).toEqual(["fi"]);
    expect(providerLanguages("en")).toEqual(["en-US", "en"]);

    languages.mockReturnValue(["sv-SE", "en"]);
    expect(providerLanguages("en")[0]).toBe("sv-SE");
  } finally {
    languages.mockRestore();
  }
});
