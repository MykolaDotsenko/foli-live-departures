import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import fi from "./i18n/fi";
import uk from "./i18n/uk";
import { registerDictionary, resetLanguageForTests } from "./i18n";

registerDictionary("fi", fi);
registerDictionary("uk", uk);

afterEach(() => {
  cleanup();
  // i18n is a module-level external store shared by every test file in a
  // Vitest worker. Always restore the neutral locale here so one locale test
  // cannot change accessible names in an unrelated component test.
  resetLanguageForTests("en");
  try {
    globalThis.localStorage?.removeItem("foli-language-v1");
  } catch {
    // Storage-blocking tests deliberately exercise this path.
  }
});
