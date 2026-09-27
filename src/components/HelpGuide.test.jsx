import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { resetLanguageForTests, setLanguage } from "../i18n";
import HelpGuide from "./HelpGuide";

afterEach(() => {
  resetLanguageForTests("en");
  document.body.style.overflow = "";
});

test("opens a concise usage guide and returns focus when closed", () => {
  render(<HelpGuide />);

  const trigger = screen.getByRole("button", { name: "How to use" });
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = screen.getByRole("dialog", {
    name: "How to use Föli departures",
  });
  expect(dialog).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("hidden");
  expect(
    screen.getByRole("heading", { name: "Use Get-off Alert" })
  ).toBeInTheDocument();
  expect(screen.getByText(/Live departures are separated/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Got it" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
});

test("Escape closes the guide and Tab cannot leave the modal", () => {
  render(<HelpGuide />);
  fireEvent.click(screen.getByRole("button", { name: "How to use" }));

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();

  fireEvent.keyDown(document, { key: "Tab" });
  expect(screen.getByRole("button", { name: "Close guide" })).toHaveFocus();

  screen.getByRole("button", { name: "Got it" }).focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(screen.getByRole("button", { name: "Close guide" })).toHaveFocus();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the guide follows the selected interface language", () => {
  render(<HelpGuide />);
  act(() => setLanguage("fi"));

  fireEvent.click(screen.getByRole("button", { name: "Käyttöohje" }));

  expect(
    screen.getByRole("heading", {
      name: "Näin käytät Föli departures -sovellusta",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Käytä Pysäkkihälytystä" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sulje ohje" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Selvä" })).toBeInTheDocument();
});
