import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ThemeSwitch from "./ThemeSwitch";
import { resetLanguageForTests, setLanguage } from "../i18n";
import { resetThemeForTests } from "../theme";

afterEach(() => {
  resetLanguageForTests("en");
  resetThemeForTests("light");
  localStorage.clear();
});

test("switches between explicit dark and light themes and remembers the choice", () => {
  resetThemeForTests("light");
  render(<ThemeSwitch />);

  const dark = screen.getByRole("button", { name: "Use dark theme" });
  expect(document.documentElement).toHaveAttribute("data-theme", "light");

  fireEvent.click(dark);

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("foli-theme-v1")).toBe("dark");
  expect(
    screen.getByRole("button", { name: "Use light theme" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("foli-theme-v1")).toBe("light");
});

test("still switches for the visit when storage is blocked", () => {
  const setItem = vi
    .spyOn(globalThis.Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new globalThis.DOMException("blocked", "SecurityError");
    });

  try {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  } finally {
    setItem.mockRestore();
  }
});

test("follows the interface language", () => {
  render(<ThemeSwitch />);
  act(() => setLanguage("fi"));

  expect(
    screen.getByRole("button", { name: "Käytä tummaa teemaa" })
  ).toHaveTextContent("Tumma");
});
