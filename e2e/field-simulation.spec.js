// Deterministic field rides: mobile GPS quality, app restart and missed-stop evidence.
// These scenarios behave like a phone moving through a real ride, but use
// fixed provider/GPS fixtures so CI can reproduce every transition.
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";
import { rideArrival, startRide } from "./support/ride.js";

function mobileOnly(testInfo) {
  test.skip(
    !["chromium-mobile", "webkit-mobile"].includes(testInfo.project.name),
    "Field rides exercise phone-sized browser projects."
  );
}

async function routeMutableTarget(page, state) {
  await page.route("https://data.foli.fi/siri/sm/32", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        stopname: "Puistokatu",
        servertime: now,
        result: [
          rideArrival(now, {
            vehicleatstop: state.atStop,
            recordedattime: now - 2,
            expectedarrivaltime: state.atStop ? 0 : now + 70,
            expecteddeparturetime: state.atStop ? now + 35 : now + 85,
            aimedarrivaltime: now + 90,
          }),
        ],
      }),
    });
  });
}

async function disableShape(page) {
  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/[^/]+\/shapes\/.*/,
    (route) => route.fulfill({ contentType: "application/json", body: "[]" })
  );
}

test("simulated phone ride survives weak GPS and an app restart before arrival", async ({
  page,
  context,
}, testInfo) => {
  mobileOnly(testInfo);
  const state = { atStop: false };
  await routeMutableTarget(page, state);
  await disableShape(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 180,
  });

  await page.goto("/?stop=164&fieldtest=1");
  await seedHome(page);
  await startRide(page, { gps: true });

  await expect(page.getByText("Weak location signal")).toBeVisible();

  // A real phone may kill/recreate the WebView or browser tab. The active
  // ride must restore while the privacy-safe trace remains session-local.
  await page.reload();
  await expect(
    page.locator('section[aria-labelledby="ride-mode-title"]')
  ).toBeVisible();

  await context.setGeolocation({
    latitude: 60.44945,
    longitude: 22.255,
    accuracy: 18,
  });
  await expect(page.getByText(/≈7[0-9] m from your stop/)).toBeVisible();

  state.atStop = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get off now" })).toBeVisible();
  await page.getByRole("button", { name: "I'm getting off" }).click();

  const report = await page.evaluate(() =>
    JSON.parse(window.sessionStorage.getItem("turku-field-diagnostics-v2") || "null")
  );
  expect(report.schema).toBe(2);
  expect(report.ride.tripRef).toBe("trip-164-1");
  expect(report.events.some((event) => event.stage === "now")).toBe(true);
  expect(
    report.events.some(
      (event) =>
        event.evidence?.gpsAccuracy === "weak" ||
        event.evidence?.gpsAccuracy === "excellent" ||
        event.evidence?.gpsAccuracy === "good"
    )
  ).toBe(true);
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain("60.44945");
  expect(serialized).not.toContain("22.255");
});

test("simulated phone ride records a missed stop without leaking its GPS trail", async ({
  page,
  context,
}, testInfo) => {
  mobileOnly(testInfo);
  const state = { atStop: false };
  await routeMutableTarget(page, state);
  await disableShape(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 20,
  });

  await page.goto("/?stop=164&fieldtest=1");
  await seedHome(page);
  await startRide(page, { gps: true });

  await context.setGeolocation({
    latitude: 60.44945,
    longitude: 22.255,
    accuracy: 20,
  });
  await expect(page.getByText(/≈7[0-9] m from your stop/)).toBeVisible();

  await context.setGeolocation({
    latitude: 60.4533,
    longitude: 22.255,
    accuracy: 20,
  });
  await expect(
    page.getByRole("heading", { name: "Your stop may be behind you" })
  ).toBeVisible();

  const report = await page.evaluate(() =>
    JSON.parse(window.sessionStorage.getItem("turku-field-diagnostics-v2") || "null")
  );
  expect(report.events.some((event) => event.stage === "missed")).toBe(true);
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain("60.4533");
  expect(serialized).not.toContain("22.255");
});
