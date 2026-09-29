// Location: one-time geolocation for the search field, the nearest stop and the stops near you.
import { expect, test } from "./support/test.js";

test("bare URL keeps one-tap location beside search and only fills the field", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
  });

  await page.goto("/");

  const input = page.getByRole("combobox", { name: "Find your stop" });
  const locate = page.getByRole("button", { name: "Use current location" });
  await expect(input).toHaveValue("");
  await expect(locate).toBeVisible();
  await expect(page.getByRole("button", { name: "Find nearest stop" })).toBeVisible();
  await expect(page).not.toHaveURL(/stop=/);
  await expect(
    page.locator('section[aria-labelledby="departures-title"]')
  ).toHaveCount(0);

  // The compact control is the fast path: it fills a confident nearby stop
  // without unexpectedly navigating. The larger Near you card remains the
  // comparison view when the passenger wants alternatives.
  await locate.click();

  await expect(input).toHaveValue("Kauppatori");
  await expect(page).not.toHaveURL(/stop=/);

  await page.getByRole("button", { name: "Show departures" }).click();

  await expect(page).toHaveURL(/stop=164/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
});

test("finds the nearest stop from one-time browser geolocation", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
  });

  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.getByRole("button", { name: "Find nearest stop" }).click();

  await expect(page).toHaveURL(/stop=164/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.getByText("Nearest")).toBeVisible();
  await expect(page.getByText(/Selected stop ≈/)).toBeVisible();

  const walkLink = page.getByRole("link", {
    name: "Walk there: Kauppatori, stop 164, in Google Maps",
  });
  await expect(walkLink).toBeVisible();
  await expect(walkLink).toHaveAttribute("target", "_blank");

  const href = await walkLink.getAttribute("href");
  const mapsUrl = new globalThis.URL(href);
  expect(mapsUrl.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(mapsUrl.searchParams.get("travelmode")).toBe("walking");
  expect(mapsUrl.searchParams.has("origin")).toBe(false);
});

// A first visit had no stop chosen, and "Near you" only appeared once one
// was: the only way to use location was an unlabelled 11px symbol.
test("a first visit offers the stops near you", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  await context.setGeolocation({ latitude: 60.45182, longitude: 22.26662 });

  await page.goto("/");
  await page.getByRole("button", { name: "Find nearest stop" }).click();

  await expect(page).toHaveURL(/stop=164/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
});

// The first visit's list was a second copy of the component, so choosing a
// stop from it unmounted it under the passenger's finger: keyboard focus fell
// to the page and the list they had just asked for was gone.
test("choosing a stop from the first visit's near-you list keeps your place", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  // Approximate, so the list is offered instead of a stop being chosen.
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
    accuracy: 800,
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Find nearest stop" }).click();

  const choice = page.getByRole("button", { name: /^Puistokatu, stop 32/ });
  await choice.click();

  await expect(page).toHaveURL(/stop=32/);
  await expect(choice).toBeVisible();
  await expect(choice).toBeFocused();
});
