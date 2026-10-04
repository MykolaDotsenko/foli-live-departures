// Journey Assistant address/POI search: explicit network boundary, selection and accessibility.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test.js";

const providerResult = [
  {
    osm_type: "node",
    osm_id: 123,
    place_id: 456,
    lat: "60.4519",
    lon: "22.2670",
    display_name: "Prisma Itäharju, Turku, Finland",
    namedetails: { name: "Prisma Itäharju" },
    address: { shop: "Prisma Itäharju" },
    category: "shop",
    type: "supermarket",
    addresstype: "shop",
    licence: "Data © OpenStreetMap contributors",
  },
];

// Two places near the mocked stops, in the shipped pack's format.
const placePack = {
  version: 1,
  generatedAt: "2026-10-04T00:00:00Z",
  source: "OpenStreetMap, via the Overpass API",
  license: "ODbL-1.0",
  attribution: "© OpenStreetMap contributors",
  licenseUrl: "https://www.openstreetmap.org/copyright",
  fields: ["id", "name", "lat", "lon", "street", "city", "nameSv"],
  places: [
    ["n1", "Lidl Kauppatori", 60.453, 22.268, "Aurakatu 1", "Turku"],
    ["n2", "Lidl Linnankatu", 60.4372, 22.2361, "Linnankatu 80", "Turku"],
  ],
};

test.describe("reviewed direct-provider activation harness", () => {
  // Production deliberately omits Nominatim from connect-src. A future direct
  // provider activation therefore requires a reviewed CSP change as well as
  // runtime policy. bypassCSP models that second deliberate change here so the
  // dormant implementation remains regression-tested without weakening the
  // production CSP used by every other browser scenario.
  test.use({ bypassCSP: true });

  test("direct provider search stays local while typing and resolves only after explicit policy + CSP activation", async ({ page }) => {
  await page.route("**/place-search-config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        endpoint: "https://nominatim.openstreetmap.org/search",
        countrycodes: "fi",
        viewbox: [21.4, 60.8, 23.2, 60.15],
        limit: 5,
      }),
    });
  });

  let providerCalls = 0;
  await page.route("https://nominatim.openstreetmap.org/search**", async (route) => {
    providerCalls += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(providerResult),
    });
  });

  await page.goto("/");
  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  const input = journey.getByRole("combobox", { name: "Stop, address or place" });
  await expect(input).toBeVisible();

  await input.fill("Prisma Itäharju");
  await page.waitForTimeout(150);
  expect(providerCalls).toBe(0);

  await journey.getByRole("button", { name: "Search destination" }).click();
  await expect(journey.getByText("Places & addresses")).toBeVisible();
  await expect(
    journey.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  ).toBeVisible();
  expect(providerCalls).toBe(1);

  await journey
    .getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
    .click();
  await expect(journey.getByText("Going to")).toBeVisible();
  await expect(journey.getByText("Prisma Itäharju", { exact: true })).toBeVisible();
  await expect(
    journey.getByRole("link", { name: "© OpenStreetMap contributors" })
  ).toBeVisible();

  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  });
});


test("production policy keeps address text local and hands off without contacting Nominatim", async ({
  page,
}) => {
  let providerCalls = 0;
  await page.route("https://nominatim.openstreetmap.org/search**", async (route) => {
    providerCalls += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(providerResult),
    });
  });
  await page.route("**/places/foli-places.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(placePack) })
  );

  await page.goto("/");
  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  // No address search here, so the field does not promise one.
  const input = journey.getByRole("combobox", { name: "Stop or place" });

  await expect(
    journey.getByRole("link", { name: "Open Turku journey planner" })
  ).toBeVisible();

  await input.fill("Tampereentie 12");
  await page.waitForTimeout(150);
  expect(providerCalls).toBe(0);
  await expect(journey.getByText(/Street addresses aren’t searched here/)).toBeVisible();

  await journey.getByRole("button", { name: "Search destination" }).click();

  await expect(journey.getByRole("alert")).toContainText(
    "No stop or place matches “Tampereentie 12”."
  );
  await expect(
    journey.getByRole("link", { name: "Open Turku journey planner" })
  ).toHaveAttribute("href", "https://turku.digitransit.fi/");
  expect(providerCalls).toBe(0);

  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
});

// "Lidl" found nothing: places were only searched through a provider that
// is off in production. The places shipped with the app are listed while
// typing, nearest first once the passenger lets the app use their location,
// and nothing typed leaves the phone.
test("places shipped with the app are listed nearest first and become the destination", async ({
  page,
  context,
}) => {
  const outbound = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && !url.hostname.endsWith("foli.fi")) {
      outbound.push(request.url());
    }
  });
  await page.route("**/places/foli-places.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(placePack) })
  );
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 60.4362, longitude: 22.2345, accuracy: 15 });

  await page.goto("/");
  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  const input = journey.getByRole("combobox", { name: "Stop or place" });
  await input.fill("Lidl");

  const list = journey.getByRole("listbox", { name: "Destination suggestions" });
  await expect(list.getByRole("option")).toHaveText([
    /Lidl Kauppatori/,
    /Lidl Linnankatu/,
  ]);
  await expect(journey.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();

  await journey.getByRole("button", { name: "Nearest to me first" }).click();
  await expect(list.getByRole("option").first()).toContainText("Lidl Linnankatu");
  await expect(list.getByRole("option").first()).toContainText(/\d+ m/);
  await expect(input).toBeFocused();

  const a11y = await new AxeBuilder({ page })
    .include('section[aria-labelledby="journey-search-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);

  await list.getByRole("option").first().click();
  await expect(journey.getByRole("status")).toContainText("Lidl Linnankatu");
  await expect(
    page.getByRole("heading", { name: /Nearby stops for Lidl Linnankatu/ })
  ).toBeVisible();
  expect(outbound).toEqual([]);
});
