// Departure board: search and Back, deep links, loading and errors, filters, alerts, cancellations, tab title.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test.js";
import { monitorPayload } from "./support/foli.js";
import { openServiceUpdates } from "./support/layout.js";

test("Back keeps keyboard focus on the departure board", async ({ page }) => {
  // Back and Forward change the stop under the same board. Remounting the
  // board for that dropped keyboard focus to the page, and replaced the live
  // region that announces the stop.
  await page.goto("/?stop=164");
  await page.getByLabel("Find your stop").fill("4");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(page).toHaveURL(/stop=4/);

  await page
    .getByRole("button", { name: "Save Turun linna to favourites" })
    .focus();
  await page.evaluate(() => globalThis.history.back());

  await expect(page).toHaveURL(/stop=164/);
  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Kauppatori to favourites" })
  ).toBeFocused();
});

test("daily flow: search, save, navigate and restore with Back", async ({ page }) => {
  await page.goto("/?stop=164");

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await openServiceUpdates(page);
  const alerts = page.locator('[aria-labelledby="service-alerts-title"]');
  const detourSummary = alerts.getByText("Line 1 city-centre detour", { exact: true });
  await expect(detourSummary).toBeVisible();
  await expect(alerts.getByText("Detour", { exact: true })).toBeVisible();
  await expect(alerts.getByText("Line 99 service change", { exact: true })).toBeVisible();
  // The notice is on the affected line's own buses too.
  await expect(
    page.locator("tbody tr").first().getByText("Detour", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(page.getByText(/Bus is at the stop/i)).toBeVisible();
  await expect(page.getByTitle("Wheelchair accessible").first()).toBeVisible();

  const boardPrecedesPlaceManagement = await page.evaluate(() => {
    const board = document.querySelector('[aria-labelledby="departures-title"]');
    const places = document.querySelector('[aria-labelledby="my-places-title"]');
    return Boolean(
      board &&
        places &&
        (board.compareDocumentPosition(places) &
          globalThis.Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(boardPrecedesPlaceManagement).toBe(true);

  await detourSummary.click();
  await expect(page.getByText(/Line 1 · Valid until/i)).toBeVisible();
  await expect(page.getByText("Line 1 uses a temporary route.")).toBeVisible();
  await expect(
    page.getByText("Stop 14 is not in use during the works.")
  ).toBeVisible();
  await expect(page.getByAltText("Temporary detour map")).toBeVisible();

  await page.getByRole("button", { name: "Next stops" }).first().click();
  await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  await expect(page.getByText(/^around \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByText("Puistokatu")).toBeVisible();

  const lineOneBadge = page.getByTitle("Satama-Kauppatori-Lentoasema");
  await expect(lineOneBadge).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await expect(lineOneBadge).toHaveCSS("color", "rgb(0, 0, 0)");

  await page.getByRole("button", { name: "Save Kauppatori to favourites" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Kauppatori from favourites" })
  ).toHaveAttribute("aria-pressed", "true");

  const search = page.getByRole("combobox", { name: "Find your stop" });
  await search.fill("Turun");
  await page.getByRole("option", { name: /Turun linna/i }).click();

  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Kauppatori/ })).toBeVisible();
  await page.evaluate(() => globalThis.history.back());
  await expect(page).toHaveURL(/stop=164/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await page.evaluate(() => globalThis.history.forward());
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
});

// At a busy stop a commuter waits for one line. Following it is kept for
// the stop, so tomorrow's glance shows the 7 without setting it again.
test("a commuter can follow one line at a stop, and it is still followed after a reload", async ({
  page,
}, testInfo) => {
  test.skip(!["chromium-mobile", "webkit-mobile"].includes(testInfo.project.name));

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  const board = page.locator('section[aria-labelledby="departures-title"]');
  await expect(board.getByText("Satama")).toBeVisible();

  await board.getByRole("button", { name: "Filter lines" }).click();
  await board
    .getByRole("group", { name: "Show only these lines" })
    .getByRole("button", { name: "Line 7" })
    .click();

  await expect(board.getByText("Runosmäki")).toBeVisible();
  await expect(board.getByText("Satama")).toHaveCount(0);
  await expect(board.getByRole("button", { name: "Only line 7" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.reload();
  await expect(board.getByRole("button", { name: "Only line 7" })).toBeVisible();
  await expect(board.getByText("Runosmäki")).toBeVisible();
  await expect(board.getByText("Satama")).toHaveCount(0);
});

test("a browser that blocks site data still gets departures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  // What Chrome does with "Don't allow sites to save data": the read of
  // window.localStorage itself throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new globalThis.DOMException(
          "Access is denied for this document.",
          "SecurityError"
        );
      },
    });
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?stop=164");

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("each stop gets its own tab title, and the app says who makes it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.goto("/");
  const defaultTitle = await page.title();
  expect(defaultTitle).toContain("Turku Departures");

  await page.goto("/?stop=164");
  await expect(page).toHaveTitle("Kauppatori (164) · Turku Departures");

  const about = page.locator("details.about");
  await about.getByText("About & privacy").click();
  await expect(
    about.getByText(/independent project by Mykola Dotsenko/)
  ).toBeVisible();
  await expect(about.getByText("No account, no ads, no analytics.")).toBeVisible();

  await expect(page.locator(".brand")).toHaveText("Turku Departures");
  await expect(page.getByRole("link", { name: "Contact the maker by email" })).toHaveAttribute(
    "href",
    /^mailto:/
  );
  await expect(page.getByRole("link", { name: "Report a problem" })).toHaveAttribute(
    "href",
    /issues\/new\?template=bug_report\.yml/
  );
  await expect(page.getByRole("link", { name: "Source code" })).toHaveAttribute(
    "href",
    /github\.com\/MykolaDotsenko\/foli-live-departures/
  );

  // With no stop on screen the page goes back to its own title. (A bare
  // address would now reopen Kauppatori, the stop last looked at.)
  await page.goto("/?stop=not-a-stop");
  await expect(page).toHaveTitle(defaultTitle);
});

// The home-screen icon opens the bare address, which started a daily
// passenger on an empty search every time.
test("a returning passenger opens on the stop they last looked at", async ({ page }) => {
  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Find your stop" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
});

test("deep links survive reload and invalid stop links recover canonically", async ({ page }) => {
  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.goto("/?stop=not-a-stop");
  await expect(page).not.toHaveURL(/stop=/);
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toHaveValue("");
  await expect(
    page.locator('section[aria-labelledby="departures-title"]')
  ).toHaveCount(0);
});

// The stop catalogue names the stop long before its departures arrive. The
// board used to count that name as an answer, so every slow load — and every
// failed one — told the passenger there were no departures.
test("a stop still loading says so instead of claiming there are no departures", async ({
  page,
}) => {
  await page.route("https://data.foli.fi/siri/sm/164", () => new Promise(() => {}));

  await page.goto("/?stop=164");

  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Loading departures…")).toBeVisible();
  await expect(page.getByText("No upcoming departures.")).toHaveCount(0);
});

test("a stop whose departures fail to load says so and recovers on retry", async ({
  page,
}) => {
  let failing = true;
  await page.route("https://data.foli.fi/siri/sm/164", async (route) => {
    if (failing) {
      await route.fulfill({ status: 503, body: "{}" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(monitorPayload("164")),
    });
  });

  await page.goto("/?stop=164");

  await expect(page.getByText("Couldn’t load departures.")).toBeVisible();
  await expect(page.getByText("No upcoming departures.")).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(page.getByText("Couldn’t load departures.")).toHaveCount(0);
});

test("a departure Föli has cancelled at this stop says so on the board", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: [],
        cancellations: [
          {
            id: 900,
            line: "1",
            cause: "TECHNICAL_PROBLEM",
            departure: now + 100,
            stops: [{ stop: "164", arrival: now + 205, isactive: true }],
          },
        ],
      }),
    });
  });

  await page.goto("/?stop=164");

  const lineOneRow = page.locator("tbody tr", { hasText: "Satama" });
  await expect(
    lineOneRow.getByRole("cell", { name: "Cancelled", exact: true })
  ).toBeVisible();
  await expect(lineOneRow.getByText(/Cancelled at this stop/)).toBeVisible();
  await expect(
    lineOneRow.getByRole("button", { name: "Get-off alert" })
  ).toHaveCount(0);
});

test("an opened disruption notice shows its whole message on a phone", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  const message =
    "Line 1 runs via Aurakatu because of roadworks. The Kauppatori stop " +
    "on Eerikinkatu is not served; board at the temporary stop on " +
    "Linnankatu instead, about 150 metres away.";

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: [
          {
            message_id: 700,
            isactive: true,
            priority: 1000,
            effect: "DETOUR",
            cause: "CONSTRUCTION",
            affected_stops: ["164"],
            affected_routes: [],
            header: "Line 1 temporary stop",
            message,
            repeat: [[now - 60, now + 3600]],
            images: [],
          },
        ],
        cancellations: [],
      }),
    });
  });

  await page.goto("/?stop=164");
  await openServiceUpdates(page);
  await page.getByText("Line 1 temporary stop", { exact: true }).click();

  // The notice is the only place a passenger learns where the moved stop
  // is. Cut to one line, it ended mid-sentence with no way to read on.
  const body = page.getByText(message);
  await expect(body).toBeVisible();
  const clipped = await body.evaluate(
    (element) => element.scrollHeight - element.clientHeight
  );
  expect(clipped).toBeLessThanOrEqual(1);
});

test("six simultaneous alerts stay compact and keep departures reachable", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: Array.from({ length: 6 }, (_, index) => ({
          message_id: 100 + index,
          isactive: true,
          priority: 1000 - index,
          effect: index === 0 ? "NO_SERVICE" : "DETOUR",
          cause: "CONSTRUCTION",
          affected_stops: ["164"],
          affected_routes: [],
          header: `Service update ${index + 1}`,
          message: `Important passenger information ${index + 1}.`,
          repeat: [[now - 60, now + 3600]],
          images: [],
        })),
        cancellations: [],
      }),
    });
  });

  await page.goto("/?stop=164");
  await expect(page.getByLabel("6 service updates")).toBeAttached();
  await openServiceUpdates(page);
  await expect(
    page.getByRole("button", { name: "Show 2 more updates" })
  ).toBeVisible();

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();
  const position = await firstDeparture.evaluate((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, viewportHeight: window.innerHeight };
  });
  expect(position.top).toBeLessThan(position.viewportHeight);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("stop search advertises the mobile search keyboard action", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Find your stop" });
  await expect(search).toHaveAttribute("inputmode", "search");
  await expect(search).toHaveAttribute("enterkeyhint", "search");
});
