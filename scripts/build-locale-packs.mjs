import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import fi from "../src/i18n/fi/index.js";
import fiRuntime from "../src/i18n/fi/runtime.js";
import uk from "../src/i18n/uk/index.js";
import ukRuntime from "../src/i18n/uk/runtime.js";
import sv from "../src/i18n/sv/index.js";
import svRuntime from "../src/i18n/sv/runtime.js";

const OUTPUT_DIR = path.resolve("public/locales");
const PACK_VERSION = 2;
const dictionaries = { fi, uk, sv };
const runtimes = { fi: fiRuntime, uk: ukRuntime, sv: svRuntime };

function validateDictionary(language, dictionary, runtime) {
  const functionKeys = [];

  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value === "function") {
      functionKeys.push(key);
    } else if (typeof value !== "string") {
      throw new Error(
        `${language}: unsupported translation value for ${JSON.stringify(key)}`
      );
    }
  }

  const runtimeKeys = Object.keys(runtime).sort();
  const expectedRuntimeKeys = functionKeys.sort();
  if (JSON.stringify(runtimeKeys) !== JSON.stringify(expectedRuntimeKeys)) {
    throw new Error(
      `${language}: runtime translation keys do not match function-valued dictionary keys.`
    );
  }

  for (const key of runtimeKeys) {
    if (dictionary[key] !== runtime[key]) {
      throw new Error(
        `${language}: runtime translation ${JSON.stringify(key)} is not the canonical dictionary function.`
      );
    }
  }
}

for (const [language, dictionary] of Object.entries(dictionaries)) {
  validateDictionary(language, dictionary, runtimes[language]);
}

const canonicalKeys = Object.keys(fi).sort();
for (const [language, dictionary] of Object.entries(dictionaries)) {
  const keys = Object.keys(dictionary).sort();
  if (JSON.stringify(keys) !== JSON.stringify(canonicalKeys)) {
    const missing = canonicalKeys.filter((key) => !Object.hasOwn(dictionary, key));
    const extra = keys.filter((key) => !Object.hasOwn(fi, key));
    throw new Error(
      `${language}: locale keys differ from the canonical locale set; missing=${JSON.stringify(
        missing
      )}; extra=${JSON.stringify(extra)}`
    );
  }
}

// Keep phrase keys once. Each locale pack is an aligned value array; null is
// an explicit marker for a function-valued entry supplied by that locale's
// small lazy runtime module. This removes repeated long English source keys
// without hiding any locale bytes from the bundle gate.
await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const keysTarget = path.join(OUTPUT_DIR, `keys-v${PACK_VERSION}.json`);
await writeFile(keysTarget, JSON.stringify(canonicalKeys) + "\n", "utf8");
console.log(
  `Wrote shared locale key table with ${canonicalKeys.length} canonical phrases.`
);

for (const [language, dictionary] of Object.entries(dictionaries)) {
  const values = canonicalKeys.map((key) => {
    const value = dictionary[key];
    return typeof value === "function" ? null : value;
  });
  const target = path.join(
    OUTPUT_DIR,
    `${language}-v${PACK_VERSION}.json`
  );
  await writeFile(target, JSON.stringify(values) + "\n", "utf8");
  console.log(
    `Wrote ${language} locale pack with ${values.length} aligned translations.`
  );
}
