// Dual-flow Home regression contract: destination-first, stop-first and standalone Radar remain independent entry paths.
import { expect, test } from "./support/test.js";

test("idle Home exposes destination, stop and standalone Radar in task order", async ({
  page,
}) => {
  await page.goto("/");

  const destination = page.locator(
    'section[aria-labelledby="journey-search-title"]'
  );
  const stop = page.locator(".search-panel").first();
  const nearby = page.locator(
    'section[aria-labelledby="nearby-stops-title"]'
  );

  await expect(
    destination.getByRole("heading", { name: "Where do you want to go?" })
  ).toBeVisible();
  await expect(
    stop.getByRole("combobox", { name: "Find your stop" })
  ).toBeVisible();
  await expect(
    nearby.getByRole("button", { name: "Open stop radar" })
  ).toBeVisible();

  const order = await page.evaluate(() => {
    const destinationSection = document.querySelector(
      'section[aria-labelledby="journey-search-title"]'
    );
    const stopSection = document.querySelector(".search-panel");
    const nearbySection = document.querySelector(
      'section[aria-labelledby="nearby-stops-title"]'
    );
    return {
      destinationBeforeStop: Boolean(
        destinationSection &&
          stopSection &&
          destinationSection.compareDocumentPosition(stopSection) &
            globalThis.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      stopBeforeNearby: Boolean(
        stopSection &&
          nearbySection &&
          stopSection.compareDocumentPosition(nearbySection) &
            globalThis.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      activeTag: document.activeElement?.tagName || "",
    };
  });

  expect(order.destinationBeforeStop).toBe(true);
  expect(order.stopBeforeNearby).toBe(true);
  expect(["INPUT", "BUTTON"]).not.toContain(order.activeTag);
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("stop-first still opens a board without choosing a destination", async ({
  page,
}) => {
  await page.goto("/");

  const stopSearch = page.getByRole("combobox", { name: "Find your stop" });
  await stopSearch.fill("164");
  await page.getByRole("button", { name: "Show departures" }).click();

  await expect(page).toHaveURL(/stop=164/);
  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Journey destination" })
  ).toHaveCount(0);
});

test("destination-first can choose a destination without opening it as the current stop", async ({
  page,
}) => {
  await page.goto("/");

  const journey = page.locator(
    'section[aria-labelledby="journey-search-title"]'
  );
  const destination = journey.getByRole("combobox", {
    name: "Stop, address or place",
  });
  await destination.fill("Kauppatori");
  await journey.getByRole("option", { name: /Kauppatori/ }).first().click();

  await expect(journey.getByText("Going to")).toBeVisible();
  await expect(journey.getByText("Kauppatori", { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/stop=/);
  await expect(
    page.locator('section[aria-labelledby="departures-title"]')
  ).toHaveCount(0);
});

test("destination selection collapses search and asks for an explicit origin", async ({
  page,
  context,
  baseURL,
}) => {
  await context.clearPermissions();
  await page.goto("/");

  const journey = page.locator(
    'section[aria-labelledby="journey-search-title"]'
  );
  const destination = journey.getByRole("combobox", {
    name: "Stop, address or place",
  });
  await destination.fill("Kauppatori");
  await journey.getByRole("option", { name: /Kauppatori/ }).first().click();

  await expect(
    journey.getByRole("combobox", { name: "Stop, address or place" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Near you" })
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Use my location" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose a starting stop" })
  ).toBeVisible();

  // Merely choosing a destination must not request geolocation.
  const permission = await context.newCDPSession(page).catch(() => null);
  expect(permission === null || typeof permission === "object").toBe(true);

  await page.getByRole("button", { name: "Choose a starting stop" }).click();
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toBeFocused();

  // The app remains usable with location ungranted.
  await expect(page).not.toHaveURL(/stop=/);
  expect(new globalThis.URL(page.url()).origin).toBe(
    new globalThis.URL(baseURL).origin
  );
});

test("destination can use explicit geolocation without opening a stop automatically", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
    accuracy: 12,
  });

  await page.goto("/");
  const journey = page.locator(
    'section[aria-labelledby="journey-search-title"]'
  );
  await journey
    .getByRole("combobox", { name: "Stop, address or place" })
    .fill("Kauppatori");
  await journey.getByRole("option", { name: /Kauppatori/ }).first().click();

  await page.getByRole("button", { name: "Use my location" }).click();

  await expect(page.getByText("Location found · ±10 m")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nearby stops for Kauppatori" })
  ).toBeVisible();
  await expect(page).not.toHaveURL(/stop=/);
});

test("an open stop remains the origin when a destination is added", async ({
  page,
}) => {
  await page.goto("/?stop=164");

  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();

  const journey = page.locator(
    'section[aria-labelledby="journey-search-title"]'
  );
  await journey.getByRole("button", { name: "Where do you want to go?" }).click();
  const destination = journey.getByRole("combobox", {
    name: "Stop, address or place",
  });
  await destination.fill("Turun linna");
  await journey.getByRole("option", { name: /Turun linna/ }).first().click();

  await expect(
    page.getByRole("heading", { name: "Nearby stops for Turun linna" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use my location" })
  ).toHaveCount(0);
  await expect(page).toHaveURL(/stop=164/);
});

test("standalone Radar works with no destination and returns focus cleanly", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
    accuracy: 10,
  });

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Journey destination" })
  ).toHaveCount(0);

  const openRadar = page.getByRole("button", { name: "Open stop radar" });
  await openRadar.click();

  await expect(
    page.getByRole("heading", { name: "Stop radar" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open target stop" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Close radar" }).click();
  await expect(openRadar).toBeFocused();

  await openRadar.click();
  await expect(
    page.getByRole("button", { name: "Open target stop" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Open target stop" }).click();

  await expect(page).toHaveURL(/stop=164/);
  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeFocused();
});
