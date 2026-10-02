import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fi from "../src/i18n/fi/index.js";
import fiRuntime from "../src/i18n/fi/runtime.js";
import uk from "../src/i18n/uk/index.js";
import ukRuntime from "../src/i18n/uk/runtime.js";

const OUTPUT_DIR = path.resolve("public/locales");
const dictionaries = { fi, uk };
const runtimes = { fi: fiRuntime, uk: ukRuntime };

function buildPack(language, dictionary, runtime) {
  const strings = {};
  const functionKeys = [];

  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value === "string") {
      strings[key] = value;
    } else if (typeof value === "function") {
      functionKeys.push(key);
    } else {
      throw new Error(`${language}: unsupported translation value for ${JSON.stringify(key)}`);
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

  return strings;
}

await mkdir(OUTPUT_DIR, { recursive: true });

for (const [language, dictionary] of Object.entries(dictionaries)) {
  const pack = buildPack(language, dictionary, runtimes[language]);
  const target = path.join(OUTPUT_DIR, `${language}.json`);
  await writeFile(target, JSON.stringify(pack) + "\n", "utf8");
  console.log(
    `Wrote ${language} locale pack with ${Object.keys(pack).length} string translations.`
  );
}
