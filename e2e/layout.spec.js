// Screen layouts: phones, narrow and laptop viewports, no horizontal overflow, a departure on screen one.
import fs from "node:fs";
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";

// A phone screen is tight, so the explanatory copy was hidden below 620px —
// including the line that says what the app is, to the one person who does
// not know. It is back, but only while it still earns the space.
test("a phone is told what the app is until it no longer needs telling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const intro = page.locator(".context");
  await expect(intro).toBeVisible();
  await expect(intro).toHaveText("Live bus times, disruptions and get-off alerts.");

  // These two sections are three bare rows and a lone button on a phone;
  // nothing else ever says what they are for.
  await expect(
    page.getByText("Save the stop nearest Home, School or Work", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Uses your location once. It isn’t saved.")
  ).toBeVisible();
  await expect(page.getByText("Search by stop name or number.")).toBeVisible();

  // The departure board still has to win the top of the screen.
  await expect(page.getByText("Bus is at the stop")).toBeInViewport();

  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  // Its job is done, and the recovery card now needs that space.
  await expect(page.locator(".context")).not.toBeVisible();
});

test("keeps the live departure board above place management in the normal flow", async ({
  page,
}) => {
  await page.goto("/?stop=164");
  await seedHome(page);

  const board = page.locator('section[aria-labelledby="departures-title"]');
  const places = page.locator('section[aria-labelledby="my-places-title"]');

  const boardBox = await board.boundingBox();
  const placesBox = await places.boundingBox();

  expect(boardBox).not.toBeNull();
  expect(placesBox).not.toBeNull();
  expect(boardBox.y).toBeLessThan(placesBox.y);
});

test("mobile layout does not create horizontal page overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const moreHomeOptions = recovery.getByRole("button", { name: "Home options" });
  if (await moreHomeOptions.isVisible()) {
    await moreHomeOptions.click();
  }
  await recovery.getByText("Backup Home stop").click();
  await expect(
    recovery.getByRole("link", {
      name: "Route there: backup Home stop Puistokatu, stop 32, by public transit",
    })
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile first screen shows a real departure without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();

  const metrics = await firstDeparture.evaluate((row) => {
    const rect = row.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });

  expect(metrics.scrollY).toBe(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeLessThan(metrics.viewportHeight);
});

// Stacked, Get me Home, search and service updates pushed the first
// departure to 851px on a 1280x800 laptop, below the fold, with most of the
// width empty. On a wide screen they now share the top in two columns.
test("a laptop with Home saved shows a departure without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);
    await expect(page.getByRole("heading", { name: "Service updates" })).toBeVisible();

    const firstDeparture = page.locator("tbody tr").first();
    const { top, bottom } = await firstDeparture.evaluate((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    // Its line, destination and time, not just a sliver of the row.
    expect(top + 60).toBeLessThanOrEqual(viewport.height);
    expect(bottom).toBeGreaterThan(top);

    // Get me Home and search share the first row.
    const recovery = await page
      .locator('section[aria-labelledby="home-recovery-title"]')
      .boundingBox();
    const search = await page.locator(".search-panel").boundingBox();
    expect(Math.abs(recovery.y - search.y)).toBeLessThan(2);
    expect(search.x).toBeGreaterThan(recovery.x + recovery.width - 1);
  }
});

test("narrow 320 and 360px layouts keep core controls on-screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);
    await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(
      page.getByRole("combobox", { name: "Find your stop" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show departures" })
    ).toBeVisible();
  }
});

test("ten departures remain scan-friendly without horizontal table scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.route("https://data.foli.fi/siri/sm/164", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        stopname: "Kauppatori",
        servertime: now,
        result: Array.from({ length: 10 }, (_, index) => ({
          lineref: String(index + 1),
          destinationdisplay:
            index === 0
              ? "Very long destination name through the city centre"
              : `Destination ${index + 1}`,
          monitored: index % 2 === 0,
          delay: index % 2 === 0 ? index * 10 : null,
          recordedattime: now - 15,
          expecteddeparturetime: index % 2 === 0 ? now + 180 + index * 120 : null,
          aimeddeparturetime: now + 180 + index * 120,
        })),
      }),
    });
  });

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);

  const tableMetrics = await page.locator("table").evaluate((table) => ({
    scrollWidth: table.scrollWidth,
    clientWidth: table.parentElement.clientWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(tableMetrics.scrollWidth - tableMetrics.clientWidth).toBeLessThanOrEqual(1);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  fs.mkdirSync("artifacts/screenshots", { recursive: true });
  await page
    .locator('[aria-labelledby="departures-title"]')
    .screenshot({
      path: `artifacts/screenshots/turku-departures-${testInfo.project.name}-ten-departures.png`,
      animations: "disabled",
    });
});

test("a frequent passenger still sees a departure on a 360px phone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "foli-saved-stops-v1",
      JSON.stringify({
        favorites: [
          { id: "164", name: "Kauppatori" },
          { id: "32", name: "Puistokatu" },
        ],
        recents: [],
      })
    );
  });
  await page.goto("/?stop=164");
  await seedHome(page);

  const shortcuts = page.getByRole("navigation", {
    name: "Saved and recent stops",
  });
  await expect(shortcuts.getByText("Puistokatu")).toBeVisible();
  await expect(shortcuts.getByText("Kauppatori")).toHaveCount(0);

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();
  const { top, viewportHeight } = await firstDeparture.evaluate((row) => ({
    top: row.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }));
  expect(top).toBeLessThan(viewportHeight);
});

test("the current favourite does not waste first-screen space", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "foli-saved-stops-v1",
      JSON.stringify({
        favorites: [{ id: "164", name: "Kauppatori" }],
        recents: [],
      })
    );
  });
  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Saved and recent stops" })
  ).toHaveCount(0);
});

test("mobile long stop identity wraps without horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const stopName = page.locator("#departures-title");
  await stopName.evaluate((element) => {
    element.textContent =
      "Very long Turku city-centre interchange stop name";
  });

  const styles = await stopName.evaluate((element) => {
    const computed = globalThis.getComputedStyle(element);
    return {
      whiteSpace: computed.whiteSpace,
      overflowWrap: computed.overflowWrap,
    };
  });
  expect(styles.whiteSpace).toBe("normal");
  expect(["anywhere", "break-word"]).toContain(styles.overflowWrap);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the mobile viewport opts into safe-area layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/
  );
});

test("first-visit search row keeps location and Show inside the card", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const input = page.getByRole("combobox", { name: "Find your stop" });
    const locate = page.getByRole("button", { name: "Use current location" });
    const show = page.getByRole("button", { name: "Show departures" });

    await expect(input).toBeVisible();
    await expect(locate).toBeVisible();
    await expect(show).toBeVisible();

    const inputBox = await input.boundingBox();
    const locateBox = await locate.boundingBox();
    const showBox = await show.boundingBox();

    expect(inputBox).not.toBeNull();
    expect(locateBox).not.toBeNull();
    expect(showBox).not.toBeNull();

    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(locateBox.x);
    expect(locateBox.x + locateBox.width).toBeLessThanOrEqual(showBox.x);
    expect(showBox.x + showBox.width).toBeLessThanOrEqual(viewport.width + 1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("mobile viewport matrix keeps core journey controls inside the screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);

    const controls = [
      page.getByRole("combobox", { name: "Find your stop" }),
      page.getByRole("button", { name: "Show departures" }),
      page.getByRole("button", { name: "Refresh", exact: true }),
      page.getByRole("button", { name: "Save Kauppatori to favourites" }),
      page.getByRole("button", { name: "Filter lines" }),
      page.getByRole("button", { name: "Get-off alert" }).first(),
    ];

    for (const locator of controls) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("stop suggestions stay reachable when a mobile keyboard shrinks the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?stop=164");

  const search = page.getByRole("combobox", { name: "Find your stop" });
  await search.fill("Tur");
  const option = page.getByRole("option", { name: /Turun linna/i });
  await expect(option).toBeVisible();

  // Approximate the dynamic viewport contraction produced by a software
  // keyboard without depending on a particular mobile OS keyboard.
  await page.setViewportSize({ width: 390, height: 500 });

  const listbox = page.getByRole("listbox");
  const box = await listbox.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(500);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
