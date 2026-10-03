import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ThemeSwitch from "./ThemeSwitch";
import { resetLanguageForTests, setLanguage } from "../i18n";
import { resetThemeForTests } from "../theme";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

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

test("follows the interface language", async () => {
  render(<ThemeSwitch />);
  await act(async () => {
    await setLanguage("fi");
  });

  expect(
    screen.getByRole("button", { name: "Käytä tummaa teemaa" })
  ).toHaveTextContent("Tumma");
});


test("follows a theme change made in another tab", () => {
  resetThemeForTests("light");
  render(<ThemeSwitch />);

  localStorage.setItem("foli-theme-v1", "dark");
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-theme-v1",
        oldValue: "light",
        newValue: "dark",
      })
    );
  });

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(
    screen.getByRole("button", { name: "Use light theme" })
  ).toBeInTheDocument();
});

test("applies an imported theme immediately when this origin had no explicit choice", () => {
  resetThemeForTests("light");
  render(<ThemeSwitch />);

  localStorage.setItem("foli-theme-v1", "dark");
  act(() => {
    window.dispatchEvent(new Event(LOCAL_STATE_IMPORTED_EVENT));
  });

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(
    screen.getByRole("button", { name: "Use light theme" })
  ).toBeInTheDocument();
});
