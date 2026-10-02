import fs from "node:fs";
import { expect, test } from "./support/test.js";
import { atMorningCommute } from "./support/clock.js";
import { seedHome } from "./support/places.js";
import { routeTargetStop, startRide } from "./support/ride.js";

test("Google Play phone screenshots use real reproducible app states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  await page.setViewportSize({ width: 432, height: 768 });
  await atMorningCommute(page);
  fs.mkdirSync("artifacts/play-store", { recursive: true });

  await page.goto("/?stop=164");
  await seedHome(page, { primaryStopId: "32" });
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await page.screenshot({
    path: "artifacts/play-store/phone-01-board.jpg",
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });

  await page.getByRole("button", { name: "Get-off alert" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Where do you want to get off?" })
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/play-store/phone-02-ride-setup.jpg",
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });

  await page.goto("/?stop=164");
  await routeTargetStop(page, { vehicleatstop: true, expectedarrivaltime: 0 });
  await seedHome(page, { primaryStopId: "32" });
  await startRide(page, { gps: false });
  await expect(page.getByRole("heading", { name: "Get off now" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/play-store/phone-03-ride-now.jpg",
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });

  await page.goto("/?stop=164");
  await seedHome(page, { primaryStopId: "32" });
  const about = page.locator("details.about");
  await about.getByText("About & privacy", { exact: true }).click();
  await about.scrollIntoViewIfNeeded();
  await expect(about).toBeVisible();
  await page.screenshot({
    path: "artifacts/play-store/phone-04-privacy.jpg",
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });
});
