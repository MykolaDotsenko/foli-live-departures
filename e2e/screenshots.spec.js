// The README's and the install sheet's product screenshots, written to artifacts/screenshots.
// They are copied into the repository by hand when the screens change:
//   turku-departures-{mobile,mobile-fi,ride-now,desktop}.png -> docs/assets/
//   manifest-{board-phone,board-wide,ride-phone}.jpg -> public/screenshots/{board-phone,board-wide,ride-phone}.jpg
import fs from "node:fs";
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";
import { atMorningCommute } from "./support/clock.js";

test("captures the README's product screenshots", async ({ page }, testInfo) => {
  if (
    !["chromium-desktop", "webkit-mobile", "chromium-mobile"].includes(
      testInfo.project.name
    )
  ) {
    test.skip();
  }

  await atMorningCommute(page);
  await page.goto("/?stop=164");
  // Home is Puistokatu: offering "Get me Home" at the Home stop itself was
  // the picture of nothing a passenger would do.
  await seedHome(page, { primaryStopId: "32" });
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(
    page
      .locator('[aria-labelledby="home-recovery-title"]')
      .getByRole("link", { name: "Get me Home by public transit" })
  ).toBeVisible();

  fs.mkdirSync("artifacts/screenshots", { recursive: true });
  const fileName =
    testInfo.project.name === "webkit-mobile"
      ? "turku-departures-mobile-ios.png"
      : testInfo.project.name === "chromium-mobile"
        ? "turku-departures-mobile.png"
        : "turku-departures-desktop.png";

  // A phone is shown as a passenger first sees it, one screen; a laptop
  // page is short enough to show whole.
  await page.screenshot({
    path: `artifacts/screenshots/${fileName}`,
    fullPage: testInfo.project.name === "chromium-desktop",
  });
  // The install sheet's pictures (public/screenshots): one screen each.
  if (testInfo.project.name !== "webkit-mobile") {
    await page.screenshot({
      path: `artifacts/screenshots/manifest-board-${
        testInfo.project.name === "chromium-desktop" ? "wide" : "phone"
      }.jpg`,
      type: "jpeg",
      quality: 80,
    });
  }
});
