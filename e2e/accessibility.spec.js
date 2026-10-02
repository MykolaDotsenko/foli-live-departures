// Accessibility: axe WCAG checks, dark mode and theme, 200% text, the guide, and a Finnish phone.
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";
import { atMorningCommute } from "./support/clock.js";
import { scaleTextTo200Percent, openServiceUpdates } from "./support/layout.js";
import { routeTargetStop } from "./support/ride.js";

async function switchToUkrainian(page) {
  const language = await page.locator("html").getAttribute("lang");
  if (language === "en") {
    await page.getByRole("button", { name: "Suomeksi" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  }
  if ((await page.locator("html").getAttribute("lang")) === "fi") {
    await page.getByRole("button", { name: "Українською" }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("columnheader", { name: "Відправлення" })
  ).toBeVisible();
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className:
            typeof element.className === "string" ? element.className : "",
          text: (element.textContent || "")
            .trim()
            .replace(/\\s+/g, " ")
            .slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > window.innerWidth + 1)
      )
      .slice(0, 20);
    return { overflow, offenders };
  });
}

test("has no serious WCAG accessibility violations", async ({ page }) => {
  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await openServiceUpdates(page);
  const alertDetails = page.getByText("Line 1 city-centre detour", { exact: true });
  if (await alertDetails.isVisible()) {
    await alertDetails.click();
    await expect(page.getByAltText("Temporary detour map")).toBeVisible();
  }

  const nextStops = page.getByRole("button", { name: "Next stops" }).first();
  if (await nextStops.isVisible()) {
    await nextStops.click();
    await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  }

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const recoveryMore = recovery.getByRole("button", { name: "Home options" });
  if (await recoveryMore.isVisible()) {
    await recoveryMore.click();
  }
  await recovery.getByRole("button", { name: "Show to driver" }).click();
  await expect(recovery.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

// At night the page was a white sheet on a dark bus, and only Ride Mode was
// dark. The theme now follows the phone's own setting; this holds it to the
// same contrast bar as the light one, with every panel open.
test("a phone in dark mode gets a dark page that is just as readable", async ({
  page,
}) => {
  const axe = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
  const rootBackground = () =>
    page.evaluate(
      () => globalThis.getComputedStyle(document.documentElement).backgroundColor
    );

  await page.emulateMedia({ colorScheme: "dark" });
  await routeTargetStop(page);
  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  // Without this a missing theme would pass as readable light pages.
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");

  await openServiceUpdates(page);
  const alertDetails = page.getByText("Line 1 city-centre detour", { exact: true });
  if (await alertDetails.isVisible()) {
    await alertDetails.click();
  }
  const nextStops = page.getByRole("button", { name: "Next stops" }).first();
  if (await nextStops.isVisible()) {
    await nextStops.click();
    await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  }
  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const recoveryMore = recovery.getByRole("button", { name: "Home options" });
  if (await recoveryMore.isVisible()) {
    await recoveryMore.click();
  }
  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Where do you want to get off?" })
  ).toBeVisible();

  expect((await axe()).violations).toEqual([]);

  // A first visit: search, the stops near you, and nothing chosen yet.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Find nearest stop" })).toBeVisible();
  expect((await axe()).violations).toEqual([]);

  // Paper stays white: a dark page printed without its backgrounds would
  // come out as pale text on a white sheet.
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
});

// An explicit passenger preference wins over the phone setting and survives
// a reload. This is the contract the visible Light/Dark control promises.
test("the theme switch overrides the phone theme and persists", async ({ page }) => {
  const rootBackground = () =>
    page.evaluate(
      () => globalThis.getComputedStyle(document.documentElement).backgroundColor
    );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#007985"
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
  await expect(
    page.getByRole("button", { name: "Use dark theme" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0c1416"
  );
});

// A screen reader moves by landmark and heading. The header and footer sat
// inside <main>, so the page had no banner or contentinfo, and a first
// visit had no h1 at all: the name was a paragraph.
test("the page has its landmarks and exactly one h1, before and after a stop is open", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Turku Departures"
  );

  await page.getByLabel("Find your stop").fill("164");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Kauppatori" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  // The name keeps its look as a paragraph.
  await expect(page.locator(".brand")).toHaveText("Turku Departures");
});

test("landscape phone keeps onboarding actions in reach", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page
    .locator("footer")
    .getByRole("button", { name: "How to use" })
    .click();

  const fullGuide = page.getByRole("button", { name: "See full guide" });
  await expect(fullGuide).toBeInViewport();
  const box = await fullGuide.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await fullGuide.click();
  await expect(page.getByRole("button", { name: "Got it" })).toBeInViewport();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the footer guide starts simple and reveals the full guide on demand", async ({
  page,
}) => {
  await page.goto("/");

  const header = page.locator("header");
  await expect(
    header.getByRole("button", { name: "How to use" })
  ).toHaveCount(0);

  const guide = page
    .locator("footer")
    .getByRole("button", { name: "How to use" });
  await expect(guide).toBeVisible();
  await guide.click();

  const dialog = page.locator(
    '[role="dialog"][aria-labelledby="app-guide-title"]'
  );
  await expect(
    page.getByRole("dialog", { name: "Three things to know" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Find a stop" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Check the next bus" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Use the get-off alert" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Check service updates" })
  ).toHaveCount(0);

  const quickHeader = dialog.locator("header");
  const quickBackground = await quickHeader.evaluate(
    (element) => globalThis.getComputedStyle(element).backgroundImage
  );
  expect(quickBackground).toContain("turku-onboarding");
  expect(quickBackground).toContain("linear-gradient");

  const quickResults = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-labelledby="app-guide-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(quickResults.violations).toEqual([]);

  await dialog.getByRole("button", { name: "See full guide" }).click();

  await expect(
    page.getByRole("dialog", { name: "How to use Turku Departures" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Check service updates" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Save familiar places" })
  ).toBeVisible();

  const fullBackground = await dialog.locator("header").evaluate(
    (element) => globalThis.getComputedStyle(element).backgroundImage
  );
  expect(fullBackground).toBe("none");

  const results = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-labelledby="app-guide-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(guide).toBeFocused();
});

// A Finnish phone got an English page, whatever else it had going for it:
// localization scored lowest of everything in the pre-release review.
test.describe("on a Finnish phone", () => {
  test.use({ locale: "fi-FI" });

  // Words that would only be on screen if something was left in English.
  // Names (stops, destinations, the brand, "In English" on the switch) are
  // taken out first; STOP in capitals is the button's own label in Finnish.
  const ENGLISH_WORDS =
    /\b(?:[Tt]he|[Aa]nd|[Yy]ou|[Yy]our|[Ss]tops?|[Dd]epartures?|[Ll]oading|[Rr]efresh|[Nn]ext|[Hh]ome|[Ll]ive|[Uu]pdates?|[Aa]lert|[Rr]ide|[Nn]ear|[Ss]how|[Ff]ind|[Ss]earch|[Ss]aved|[Pp]laces|[Ww]ork|[Ss]chool|[Ll]ate|[Ee]arly|[Ss]cheduled|[Tt]imetable|[Dd]river|[Bb]ackup)\b/g;
  const ALLOWED = ["Turku Departures", "Mykola Dotsenko", "In English", "Google Maps", "CC BY 4.0", "GitHub", "data.foli.fi"];

  async function englishLeftOnScreen(page) {
    let text = await page.locator("body").innerText();
    for (const allowed of ALLOWED) text = text.replaceAll(allowed, "");
    return [...new Set(text.match(ENGLISH_WORDS) || [])];
  }

  test("the app is in Finnish, readable, and the locale cycle persists English", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name === "chromium-mobile") await atMorningCommute(page);
    await routeTargetStop(page);
    await page.goto("/?stop=164");
    await seedHome(page, { primaryStopId: "32" });

    await expect(page.locator("html")).toHaveAttribute("lang", "fi");
    await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Lähtee" })).toBeVisible();
    await expect(page.getByLabel("Etsi pysäkki")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Liikennetiedotteet" })).toBeVisible();

    // The README's Finnish picture, a phone's first screen.
    if (testInfo.project.name === "chromium-mobile") {
      fs.mkdirSync("artifacts/screenshots", { recursive: true });
      await page.screenshot({ path: "artifacts/screenshots/turku-departures-mobile-fi.png" });
    }

    const nextStops = page.getByRole("button", { name: "Seuraavat pysäkit" }).first();
    await nextStops.click();
    await expect(page.getByText("Seuraavat pysäkit · aikataulun ajat")).toBeVisible();

    expect(await englishLeftOnScreen(page)).toEqual([]);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // Locale switching follows the registry order: Finnish → Ukrainian → Swedish → English.
    await page.getByRole("button", { name: "Українською" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(
      page.getByRole("columnheader", { name: "Відправлення" })
    ).toBeVisible();

    await page.getByRole("button", { name: "På svenska" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
    await expect(
      page.getByRole("columnheader", { name: "Avgår" })
    ).toBeVisible();

    await page.getByRole("button", { name: "In English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("columnheader", { name: "Due" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Suomeksi" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Due" })).toBeVisible();
  });

  test("a first visit is in Finnish too", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Lähelläsi" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Etsi lähin pysäkki" })).toBeVisible();
    expect(await englishLeftOnScreen(page)).toEqual([]);
  });
});

test("200 percent text scaling keeps core mobile controls usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?stop=164");
  await scaleTextTo200Percent(page);

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show departures" })
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  for (const locator of [
    page.getByRole("combobox", { name: "Find your stop" }),
    page.getByRole("button", { name: "Show departures" }),
    page.getByRole("button", { name: "Refresh" }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
});

test("the mobile guide keeps both actions distinct on a 320px screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await scaleTextTo200Percent(page);
  await page
    .locator("footer")
    .getByRole("button", { name: "How to use" })
    .click();

  const gotIt = page.getByRole("button", { name: "Got it" });
  const fullGuide = page.getByRole("button", { name: "See full guide" });
  const a = await gotIt.boundingBox();
  const b = await fullGuide.boundingBox();

  expect(a).not.toBeNull();
  expect(b).not.toBeNull();

  const horizontalGap =
    Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const verticalGap =
    Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(7);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("320px dark mode with 200 percent text still reflows without horizontal scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?stop=164");
  await scaleTextTo200Percent(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const overflowState = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className:
            typeof element.className === "string" ? element.className : "",
          text: (element.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > window.innerWidth + 1)
      )
      .slice(0, 20);
    return { overflow, offenders };
  });
  expect(
    overflowState.overflow,
    JSON.stringify(overflowState.offenders, null, 2)
  ).toBeLessThanOrEqual(1);

  for (const locator of [
    page.getByRole("combobox", { name: "Find your stop" }),
    page.getByRole("button", { name: "Show departures" }),
    page.getByRole("button", { name: "Refresh", exact: true }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
  }
});

test("closing the guide restores focus to the footer trigger", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.goto("/");
  const trigger = page
    .locator("footer")
    .getByRole("button", { name: "How to use" });
  await trigger.focus();
  await trigger.click();

  await expect(page.getByRole("dialog", { name: "Three things to know" })).toBeVisible();
  await page.getByRole("button", { name: "Close guide" }).click();

  await expect(
    page.getByRole("dialog", { name: "Three things to know" })
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Ukrainian UI passes axe after a real language switch", async ({ page }) => {
  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await switchToUkrainian(page);

  await openServiceUpdates(page);
  const nextStops = page.getByRole("button", { name: "Наступні зупинки" }).first();
  if (await nextStops.isVisible()) {
    await nextStops.click();
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("Ukrainian reflows at 320, 360 and 412 px with 200 percent text in dark mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?stop=164");
  await seedHome(page);
  await switchToUkrainian(page);
  await scaleTextTo200Percent(page);

  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 820 });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Відправлення" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "På svenska" })
    ).toBeVisible();

    const state = await horizontalOverflow(page);
    expect(
      state.overflow,
      `width=${width} offenders=${JSON.stringify(state.offenders, null, 2)}`
    ).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

