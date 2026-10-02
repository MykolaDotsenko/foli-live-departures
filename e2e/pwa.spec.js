// Production PWA (chromium-pwa project): offline reopening, a stalled network, installable icons.
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";
import { mockFoli } from "./support/foli.js";

test("production PWA reopens offline with My Places and driver help", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-pwa");

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);
  await expect
    .poll(() => page.evaluate(() => navigator.onLine))
    .toBe(false);

  // Playwright's Chromium offline emulation does not consistently dispatch
  // the browser's offline event to a service-worker-controlled page. Deliver
  // that standard event explicitly, then verify both the live degraded UI and
  // the persisted reload hint before testing the cached PWA reload itself.
  await page.evaluate(() => {
    window.dispatchEvent(new globalThis.Event("offline"));
  });
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        globalThis.localStorage.getItem("foli-offline-hint")
      )
    )
    .toBe("1");

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  // Announced once, by the header's status line, and shown once, by the
  // banner, which is not a live region of its own.
  await expect(page.getByText("Offline mode", { exact: true })).toHaveCount(1);
  expect(
    await page
      .getByText(/saved places and show to driver still work/i)
      .evaluate((node) =>
        Boolean(node.closest('[aria-live], [role="status"], [role="alert"]'))
      )
  ).toBe(false);
  await expect(
    page.getByText(/saved places and show to driver still work/i)
  ).toBeVisible();

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  await expect(
    recovery.getByRole("heading", {
      name: "Need help getting home?",
    })
  ).toBeVisible();
  // No route to hand to a map with no connection; the driver card, which
  // still works, leads instead.
  await expect(
    recovery.getByRole("link", { name: "Get me Home by public transit" })
  ).toHaveCount(0);

  await recovery.getByRole("button", { name: "Show to driver" }).click();
  const driver = recovery.getByRole("dialog");
  await expect(
    driver.getByRole("heading", { name: /Kauppatori/ })
  ).toBeVisible();
  await expect(driver.getByText("Kauppatori")).toBeVisible();

  await driver.getByRole("button", { name: "Close" }).click();
  await mockFoli(page);
  await context.setOffline(false);
  await page.evaluate(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await expect(page.getByText("Offline", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Offline mode", { exact: true })).toHaveCount(0);
  await expect(
    recovery.getByRole("link", { name: "Get me Home by public transit" })
  ).toBeVisible();
});

test("production PWA opens from its cache when the network stalls", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-pwa");

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  // One bar of signal, or a captive portal: requests go out and nothing
  // comes back. Only an outright failure used to reach the cached shell, so
  // the page stayed blank until the browser gave up on its own.
  await context.route(`${new globalThis.URL(baseURL).origin}/**`, () => {});

  const started = Date.now();
  await page.reload({ waitUntil: "commit", timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Need help getting home?" })
  ).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);
});

test("production PWA gives every home screen a real icon", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-pwa");

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  // The browser's own reading of the manifest, not a JSON.parse of it.
  const cdp = await page.context().newCDPSession(page);
  const { errors, data } = await cdp.send("Page.getAppManifest");
  expect(errors).toEqual([]);
  const manifest = JSON.parse(data);

  // Safari ignores manifest icons; without this link an iPhone's home screen
  // gets a screenshot of the page.
  const touchIconLink = page.locator('link[rel="apple-touch-icon"]');
  await expect(touchIconLink).toHaveAttribute("href", /apple-touch-icon\.png$/);
  const touchIcon = await touchIconLink.getAttribute("href");
  const expected = [
    ...manifest.icons
      .filter((icon) => icon.type === "image/png")
      .map((icon) => ({
        src: icon.src,
        size: Number(icon.sizes.split("x")[0]),
        purpose: icon.purpose,
      })),
    { src: touchIcon, size: 180, purpose: "apple-touch-icon" },
  ];
  expect(expected.map((icon) => `${icon.size} ${icon.purpose}`)).toEqual([
    "192 any",
    "512 any",
    "512 maskable",
    "180 apple-touch-icon",
  ]);

  // Every file decodes as a PNG at the size it claims, so no launcher has to
  // upscale a smaller one or fall back to a screenshot of the page.
  for (const icon of expected) {
    const decoded = await page.evaluate(async (src) => {
      const response = await globalThis.fetch(
        new globalThis.URL(src, document.baseURI)
      );
      const bitmap = await globalThis.createImageBitmap(await response.blob());
      return {
        type: response.headers.get("content-type"),
        width: bitmap.width,
        height: bitmap.height,
      };
    }, icon.src);
    expect(decoded, icon.src).toEqual({
      type: "image/png",
      width: icon.size,
      height: icon.size,
    });
  }

  // What Chrome checks before it offers "Install app". A test browser
  // profile is always off the record, which is not the app's to fix.
  const { installabilityErrors } = await cdp.send(
    "Page.getInstallabilityErrors"
  );
  expect(
    installabilityErrors
      .map((error) => error.errorId)
      .filter((errorId) => errorId !== "in-incognito")
  ).toEqual([]);
});

test("production PWA reopens offline in persisted Ukrainian", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-pwa");

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await page.getByRole("button", { name: "Suomeksi" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  await page.getByRole("button", { name: "Українською" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("columnheader", { name: "Відправлення" })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => globalThis.localStorage.getItem("foli-language-v1"))
    )
    .toBe("uk");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);
  await page.evaluate(() => {
    window.dispatchEvent(new globalThis.Event("offline"));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("columnheader", { name: "Відправлення" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "På svenska" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => globalThis.localStorage.getItem("foli-language-v1"))
    )
    .toBe("uk");

  await context.setOffline(false);
});

