// Home and My Places: saving, importing a shared place, getting Home, and the printed backup card.
import { expect, test } from "./support/test.js";
import { encodeSharedPlaceForTest, seedHome } from "./support/places.js";

test("saves Home as a privacy-first safe arrival zone", async ({
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

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "My Places" })).toBeVisible();

  await page.getByRole("button", { name: "Use my location to set up Home" }).click();

  await expect(
    page.getByRole("heading", { name: "Choose stops for Home" })
  ).toBeVisible();
  await expect(page.getByText(/Location accuracy/)).toBeVisible();

  const saveHome = page.getByRole("button", { name: "Save Home" });
  await expect(saveHome).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: /Yes, this is the right stop for Home/i,
    })
    .check();
  await expect(saveHome).toBeEnabled();
  await saveHome.click();

  // The place card names its actions as the Get me Home card above does.
  const goHome = page
    .locator('[aria-labelledby="my-places-title"]')
    .getByRole("link", { name: "Get me Home by public transit" });
  await expect(goHome).toBeVisible();

  const href = await goHome.getAttribute("href");
  const transitUrl = new globalThis.URL(href);
  expect(transitUrl.searchParams.get("travelmode")).toBe("transit");
  expect(transitUrl.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(transitUrl.searchParams.has("origin")).toBe(false);

  const placeStorage = await page.evaluate(() =>
    localStorage.getItem("foli-my-places-v1")
  );
  expect(placeStorage).toContain('"id":"164"');
  expect(placeStorage).not.toContain('"id":"32"');
  expect(placeStorage).not.toContain('"id":"4"');
  expect(placeStorage).not.toContain("60.45182");
  expect(placeStorage).not.toContain("22.26662");
  expect(placeStorage).not.toContain("distanceMeters");
});

test("imports a parent-shared place only after explicit confirmation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  const token = encodeSharedPlaceForTest({
    v: 1,
    p: "home",
    m: "164",
    s: [
      ["164", "Kauppatori"],
      ["32", "Puistokatu"],
    ],
  });

  await page.goto(`/?stop=164#place=${token}`);

  await expect(
    page.getByRole("heading", { name: "Add Home?" })
  ).toBeVisible();

  const beforeImport = await page.evaluate(() =>
    localStorage.getItem("foli-my-places-v1")
  );
  expect(beforeImport).toBeNull();

  await page.getByRole("button", { name: "Add Home" }).click();

  await expect(
    page
      .locator('[aria-labelledby="home-recovery-title"]')
      .getByRole("link", { name: "Get me Home by public transit" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\?stop=164$/);

  const imported = await page.evaluate(() =>
    localStorage.getItem("foli-my-places-v1")
  );
  expect(imported).toContain('"id":"164"');
  expect(imported).toContain('"id":"32"');
  expect(imported).not.toContain("lat");
  expect(imported).not.toContain("lon");
});

// The shared-place token rode along into every stop URL, so after "Not now"
// a single Back brought the "Add Home?" question straight back.
test("a dismissed shared place stays dismissed after moving between stops", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  const token = encodeSharedPlaceForTest({
    v: 1,
    p: "home",
    m: "164",
    s: [["164", "Kauppatori"]],
  });

  await page.goto(`/?stop=164#place=${token}`);
  await expect(page.getByRole("heading", { name: "Add Home?" })).toBeVisible();

  const input = page.getByRole("combobox", { name: "Find your stop" });
  await input.fill("4");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(page).toHaveURL(/\?stop=4$/);

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("heading", { name: "Add Home?" })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\?stop=164$/);
  await expect(page.getByRole("heading", { name: "Add Home?" })).toHaveCount(0);
});

test("recovers to Home with one clear action and resilient fallbacks", async ({
  page,
}) => {
  await page.goto("/?stop=164");
  await seedHome(page);

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  await expect(
    recovery.getByRole("heading", {
      name: "Need help getting home?",
    })
  ).toBeVisible();
  await expect(
    recovery.getByText(/In an emergency, call 112/)
  ).toBeVisible();

  const getHome = recovery.getByRole("link", {
    name: "Get me Home by public transit",
  });
  const href = await getHome.getAttribute("href");
  const homeUrl = new globalThis.URL(href);

  expect(homeUrl.searchParams.get("travelmode")).toBe("transit");
  expect(homeUrl.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(homeUrl.searchParams.has("origin")).toBe(false);

  const moreHomeOptions = recovery.getByRole("button", { name: "Home options" });
  if (await moreHomeOptions.isVisible()) {
    await moreHomeOptions.click();
  }
  await recovery.getByRole("button", { name: "Show to driver" }).click();
  const driver = recovery.getByRole("dialog");
  await expect(
    driver.getByRole("heading", { name: /Kauppatori/ })
  ).toBeVisible();
  await expect(driver.getByText("Kauppatori")).toBeVisible();

  await driver.getByRole("button", { name: "Close" }).click();
  await recovery.getByText("Backup Home stop").click();

  const backupRoute = recovery.getByRole("link", {
    name: "Route there: backup Home stop Puistokatu, stop 32, by public transit",
  });
  const backupHref = await backupRoute.getAttribute("href");
  const backupUrl = new globalThis.URL(backupHref);

  expect(backupUrl.searchParams.get("destination")).toBe("60.4488,22.255");
  expect(backupUrl.searchParams.has("origin")).toBe(false);
});

test("renders a public-stop-only Home backup card in print mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.goto("/?stop=164");
  await seedHome(page);
  await page.emulateMedia({ media: "print" });

  const printCard = page.locator('section[aria-hidden="true"]', {
    has: page.getByText("Home backup card", { exact: true }),
  });
  await expect(printCard).toBeVisible();
  await expect(printCard.getByText("Stop 164", { exact: true })).toBeVisible();
  await expect(printCard.getByText("Backup stops")).toBeVisible();
  await expect(printCard.getByText("Puistokatu · Pysäkki / Stop 32")).toBeVisible();
  // Hidden from assistive technology on screen, so found by tag, not role.
  await expect(printCard.locator("h2")).toHaveText("Kauppatori");

  const headerVisibility = await page
    .locator(".topbar")
    .evaluate(
      (element) => globalThis.getComputedStyle(element).visibility
    );
  expect(headerVisibility).toBe("hidden");

  // Hidden, the rest of the page still took up its space, so the card came
  // out with blank pages behind it.
  const pdf = (await page.pdf({ format: "A4" })).toString("latin1");
  expect(pdf.match(/\/Type\s*\/Page\b(?!s)/g)).toHaveLength(1);
});

test("the Home actions on a phone share one type size", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-mobile"));

  await page.goto("/?stop=164");
  await seedHome(page);

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const primary = recovery.getByRole("link", {
    name: "Get me Home by public transit",
  });
  const options = recovery.getByRole("button", { name: "Home options" });
  await expect(primary).toBeVisible();
  await expect(options).toBeVisible();

  const fontSize = (locator) =>
    locator.evaluate(
      (element) => globalThis.getComputedStyle(element).fontSize
    );
  expect(await fontSize(options)).toBe(await fontSize(primary));
});
