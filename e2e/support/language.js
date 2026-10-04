// The header's language picker: one list of every language, each in its own name.
import { expect } from "@playwright/test";

// Its name is "Language" in whichever language is on screen.
const PICKER_NAME = /^(?:Language|Kieli|Мова|Språk)$/;

/** @param {import("@playwright/test").Page} page */
export function languagePicker(page) {
  return page.getByRole("combobox", { name: PICKER_NAME });
}

/**
 * Choose a language straight from the list, as a passenger does.
 * @param {import("@playwright/test").Page} page
 * @param {"en" | "fi" | "uk" | "sv"} code
 */
export async function chooseLanguage(page, code) {
  await languagePicker(page).selectOption(code);
  await expect(page.locator("html")).toHaveAttribute("lang", code);
}
