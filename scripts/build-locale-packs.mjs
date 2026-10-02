import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fi from "../src/i18n/fi/index.js";
import fiRuntime from "../src/i18n/fi/runtime.js";
import uk from "../src/i18n/uk/index.js";
import ukRuntime from "../src/i18n/uk/runtime.js";
import sv from "../src/i18n/sv/index.js";
import svRuntime from "../src/i18n/sv/runtime.js";

const OUTPUT_DIR = path.resolve("public/locales");
const dictionaries = { fi, uk, sv };
const runtimes = { fi: fiRuntime, uk: ukRuntime, sv: svRuntime };

// English source phrases are identical across complete locale dictionaries.
// Store them once instead of repeating hundreds of long keys in every lazy
// JSON pack. Each locale then ships only its aligned values; function-valued
// grammar stays in the small runtime module as before.
const translationKeys = [
  ...new Set(
    Object.values(dictionaries).flatMap((dictionary) =>
      Object.keys(dictionary)
    )
  ),
].sort();

function buildPack(language, dictionary, runtime) {
  const values = [];
  const functionKeys = [];

  for (const key of translationKeys) {
    if (!Object.hasOwn(dictionary, key)) {
      throw new Error(
        `${language}: canonical dictionary is missing ${JSON.stringify(key)}.`
      );
    }

    const value = dictionary[key];
    if (typeof value === "string") {
      values.push(value);
    } else if (typeof value === "function") {
      functionKeys.push(key);
      // Keep every locale aligned to the shared source-key table. Runtime
      // grammar overlays this slot after loading.
      values.push(null);
    } else {
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

  return values;
}

await mkdir(OUTPUT_DIR, { recursive: true });

await writeFile(
  path.join(OUTPUT_DIR, "keys.json"),
  JSON.stringify(translationKeys) + "\n",
  "utf8"
);
console.log(
  `Wrote shared locale key pack with ${translationKeys.length} source phrases.`
);

for (const [language, dictionary] of Object.entries(dictionaries)) {
  const pack = buildPack(language, dictionary, runtimes[language]);
  const target = path.join(OUTPUT_DIR, `${language}.json`);
  await writeFile(target, JSON.stringify(pack) + "\n", "utf8");
  console.log(
    `Wrote ${language} locale pack with ${pack.length} aligned translation slots.`
  );
}
