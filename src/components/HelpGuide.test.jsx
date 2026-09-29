import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { resetLanguageForTests, setLanguage } from "../i18n";
import HelpGuide from "./HelpGuide";

afterEach(() => {
  resetLanguageForTests("en");
  document.body.style.overflow = "";
});

test("starts with three essential actions before revealing the full guide", () => {
  render(<HelpGuide />);

  const trigger = screen.getByRole("button", { name: "How to use" });
  trigger.focus();
  fireEvent.click(trigger);

  expect(
    screen.getByRole("dialog", { name: "Three things to know" })
  ).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("hidden");

  expect(
    screen.getByRole("heading", { name: "Find a stop" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Check the next bus" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Use the get-off alert" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Watch for disruptions" })
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "See full guide" }));

  expect(
    screen.getByRole("dialog", { name: "How to use Turku Departures" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Watch for disruptions" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Save familiar places" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Quick start" }));
  expect(
    screen.getByRole("dialog", { name: "Three things to know" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
});

test("Escape closes the guide and Tab cannot leave the modal", () => {
  render(<HelpGuide />);
  fireEvent.click(screen.getByRole("button", { name: "How to use" }));

  const close = screen.getByRole("button", { name: "Close guide" });
  const fullGuide = screen.getByRole("button", { name: "See full guide" });

  fullGuide.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();

  close.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(fullGuide).toHaveFocus();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the quick start and full guide follow the selected interface language", () => {
  render(<HelpGuide />);
  act(() => setLanguage("fi"));

  fireEvent.click(screen.getByRole("button", { name: "Käyttöohje" }));

  expect(
    screen.getByRole("heading", { name: "Kolme asiaa alkuun" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Tarkista seuraava bussi" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Näytä koko ohje" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Näytä koko ohje" }));

  expect(
    screen.getByRole("heading", {
      name: "Näin käytät Turku Departures -sovellusta",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Käytä pysäkkihälytystä" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sulje ohje" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pika-aloitus" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Selvä" })).toBeInTheDocument();
});
