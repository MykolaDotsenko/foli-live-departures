import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// Each language pack waits until the test lets it land, as a first load on
// a slow network does.
const loads = vi.hoisted(() => []);

vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setLanguage: vi.fn(
      (code) =>
        new Promise((resolve) => {
          loads.push({ code, land: () => resolve(actual.setLanguage(code)) });
        })
    ),
  };
});

import { getLanguage, resetLanguageForTests } from "../i18n";
import LanguageSwitch from "./LanguageSwitch";

afterEach(() => {
  loads.length = 0;
  resetLanguageForTests("en");
  localStorage.clear();
});

// A second choice made while the first pack was loading was dropped, and
// the picker went back to the first one.
test("a choice made while a language loads is the one that sticks", async () => {
  render(<LanguageSwitch />);
  const picker = screen.getByRole("combobox", { name: "Language" });

  fireEvent.change(picker, { target: { value: "fi" } });
  fireEvent.change(picker, { target: { value: "uk" } });
  expect(picker).toHaveValue("uk");
  expect(loads.map((load) => load.code)).toEqual(["fi"]);

  await act(async () => {
    loads[0].land();
  });
  expect(loads.map((load) => load.code)).toEqual(["fi", "uk"]);

  await act(async () => {
    loads[1].land();
  });
  expect(getLanguage()).toBe("uk");
  expect(screen.getByRole("combobox", { name: "Мова" })).toHaveValue("uk");
});

test("changing back to the language on screen while another loads keeps it", async () => {
  render(<LanguageSwitch />);
  const picker = screen.getByRole("combobox", { name: "Language" });

  fireEvent.change(picker, { target: { value: "sv" } });
  fireEvent.change(picker, { target: { value: "en" } });
  expect(picker).toHaveValue("en");

  await act(async () => {
    loads[0].land();
  });
  await act(async () => {
    loads[1]?.land();
  });
  expect(getLanguage()).toBe("en");
  expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
});
