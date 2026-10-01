import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import IosInstallHint, { isIosLike } from "./IosInstallHint";
import { resetLanguageForTests } from "../i18n";

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, "userAgent");
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
const originalTouches = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints");
const originalStandalone = Object.getOwnPropertyDescriptor(navigator, "standalone");
const originalMatchMedia = globalThis.matchMedia;

function setNavigatorValue(name, value) {
  Object.defineProperty(navigator, name, {
    configurable: true,
    value,
  });
}

afterEach(() => {
  localStorage.clear();
  resetLanguageForTests("en");
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ["userAgent", originalUserAgent],
    ["platform", originalPlatform],
    ["maxTouchPoints", originalTouches],
    ["standalone", originalStandalone],
  ]) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor);
    else delete navigator[name];
  }
  globalThis.matchMedia = originalMatchMedia;
  delete globalThis.Capacitor;
});

test("detects iPhone and touch iPad browser identities", () => {
  expect(isIosLike({ userAgent: "Mozilla/5.0 (iPhone)" })).toBe(true);
  expect(
    isIosLike({ platform: "MacIntel", maxTouchPoints: 5, userAgent: "Safari" })
  ).toBe(true);
  expect(isIosLike({ platform: "Linux x86_64", maxTouchPoints: 0 })).toBe(false);
});

test("offers a dismissible install hint only in an uninstalled iPhone browser", () => {
  setNavigatorValue("userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
  setNavigatorValue("platform", "iPhone");
  setNavigatorValue("maxTouchPoints", 5);
  setNavigatorValue("standalone", false);
  globalThis.matchMedia = vi.fn(() => ({ matches: false }));

  render(<IosInstallHint />);

  expect(
    screen.getByRole("strong", { name: "Install on iPhone" })
  ).toBeInTheDocument();
  expect(screen.getByText(/Share → Add to Home Screen/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("Install on iPhone")).not.toBeInTheDocument();
  expect(localStorage.getItem("turku-departures-ios-install-hint-v1")).toBe("1");
});

test("does not show inside an installed iOS PWA", () => {
  setNavigatorValue("userAgent", "Mozilla/5.0 (iPhone)");
  setNavigatorValue("platform", "iPhone");
  setNavigatorValue("maxTouchPoints", 5);
  setNavigatorValue("standalone", true);
  globalThis.matchMedia = vi.fn(() => ({ matches: true }));

  render(<IosInstallHint />);

  expect(screen.queryByText("Install on iPhone")).not.toBeInTheDocument();
});
