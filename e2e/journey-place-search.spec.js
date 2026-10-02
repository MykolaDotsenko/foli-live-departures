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

test("direct provider search stays local while typing and resolves only after explicit submit when policy explicitly enables it", async ({ page }) => {
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

  await page.goto("/");
  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  const input = journey.getByRole("combobox", { name: "Stop, address or place" });

  await expect(
    journey.getByRole("link", { name: "Open Turku journey planner" })
  ).toBeVisible();

  await input.fill("Prisma Itäharju");
  await page.waitForTimeout(150);
  expect(providerCalls).toBe(0);

  await journey.getByRole("button", { name: "Search destination" }).click();

  await expect(journey.getByRole("alert")).toContainText(
    "Direct address and place search is unavailable here"
  );
  await expect(
    journey.getByRole("link", { name: "Open Turku journey planner" })
  ).toHaveAttribute("href", "https://turku.digitransit.fi/");
  await expect(
    journey.getByText(/keeps address and place text on this device/i)
  ).toBeVisible();
  expect(providerCalls).toBe(0);

  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
});
