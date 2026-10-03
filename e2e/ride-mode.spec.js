// Get-off alerts (Ride Mode): setting one up, each stage of the ride, and reach on small screens.
import fs from "node:fs";
import { expect, test } from "./support/test.js";
import { seedHome } from "./support/places.js";
import { atMorningCommute, gtfsClockAt } from "./support/clock.js";
import { mockFoli, monitorPayload } from "./support/foli.js";
import {
  rideArrival,
  routeTargetStop,
  turnOffNotifications,
  startRide,
} from "./support/ride.js";

test("Ride Mode warns before the selected get-off stop", async ({ page }) => {
  await page.route(
    "https://data.foli.fi/siri/sm/32",
    async (route) => {
      const now = Math.floor(Date.now() / 1000);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          stopname: "Puistokatu",
          servertime: now,
          result: [
            {
              lineref: "1",
              destinationdisplay: "Satama",
              monitored: true,
              vehicleatstop: false,
              vehicleref: "bus-ride-1",
              datedvehiclejourneyref: "journey-ride-1",
              __tripref: "trip-164-1",
              originaimeddeparturetime: now - 180,
              recordedattime: now - 5,
              latitude: 60.447,
              longitude: 22.257,
              expectedarrivaltime: now + 70,
              expecteddeparturetime: now + 85,
              aimedarrivaltime: now + 90,
            },
          ],
        }),
      });
    }
  );

  await page.goto("/?stop=164");
  await seedHome(page);

  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Where do you want to get off?" })
  ).toBeVisible();

  await expect(page.locator('input[type="radio"][value="2"]')).toBeChecked();

  // The panel is mounted in the departure table's last cell, which is
  // right-aligned for the "4 min" column. A form that inherits that reads as
  // broken, and nothing else would catch it.
  await expect(
    page
      .locator('section[aria-label="Set up get-off alerts"]')
      .evaluate((node) => globalThis.getComputedStyle(node).textAlign)
  ).resolves.toBe("left");

  await page
    .getByRole("checkbox", { name: /Follow my location/i })
    .uncheck();
  await turnOffNotifications(page);

  await page.getByRole("button", { name: "Start get-off alert" }).click();

  // The bus is a minute from Puistokatu but has not been seen leaving
  // Kauppatori, the stop before it. STOP pressed now would stop it there.
  await expect(
    page.getByRole("heading", { name: "Get ready to press STOP" })
  ).toBeVisible();
  await expect(
    page.getByText("Press STOP when the bus leaves Kauppatori.")
  ).toBeVisible();
  await expect(page.getByText("Puistokatu").first()).toBeVisible();
  await expect(page.locator('[data-health="live"]')).toBeVisible();

  // One stray touch in a pocket must not end the ride.
  await page.getByRole("button", { name: "Turn off alert" }).click();
  await expect(
    page.getByRole("heading", { name: "Get ready to press STOP" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Tap again to turn it off" }).click();
  await expect(
    page.getByRole("heading", { name: "Get ready to press STOP" })
  ).toHaveCount(0);
});

// Measured before this: the open form made the page 3.9 screens on a 375px
// phone and left "Start get-off alert" 684px below the fold — a full screen of
// scrolling, one-handed, on a moving bus, before the one committing tap.
test("the ride can be started without scrolling for the button", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  await page.setViewportSize({ width: 360, height: 640 });
  await routeTargetStop(page);

  await page.goto("/?stop=164");
  await seedHome(page);
  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Where do you want to get off?" })
  ).toBeVisible();

  const start = page.getByRole("button", { name: "Start get-off alert" });
  await expect(start).toBeInViewport();

  // Pinned low, where a thumb reaches, not floating mid-screen.
  const box = await start.boundingBox();
  expect(box.y + box.height).toBeGreaterThan(640 * 0.75);
  expect(box.y + box.height).toBeLessThanOrEqual(640);
});

test("landscape phone keeps ride setup and ride controls reachable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  await page.setViewportSize({ width: 844, height: 390 });
  await routeTargetStop(page, {
    expectedarrivaltime: Math.floor(Date.now() / 1000) + 900,
  });

  await page.goto("/?stop=164");
  await seedHome(page);

  for (const locator of [
    page.getByRole("button", { name: "Save Kauppatori to favourites" }),
    page.getByRole("button", { name: "Filter lines" }),
    page.getByRole("button", { name: "Refresh", exact: true }),
    page.getByRole("button", { name: "Get-off alert" }).first(),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();

  const start = page.getByRole("button", { name: "Start get-off alert" });
  await expect(start).toBeInViewport();
  const startBox = await start.boundingBox();
  expect(startBox.y + startBox.height).toBeLessThanOrEqual(390);

  await page
    .getByRole("checkbox", { name: /Follow my location/i })
    .uncheck();
  await turnOffNotifications(page);
  await start.click();

  const ridePanel = page.locator('section[aria-labelledby="ride-mode-title"]');
  await expect(ridePanel).toBeVisible();
  await expect(
    ridePanel.evaluate((node) => globalThis.getComputedStyle(node).position)
  ).resolves.toBe("relative");

  const endRide = page.getByRole("button", { name: "Turn off alert" });
  await endRide.scrollIntoViewIfNeeded();
  await expect(endRide).toBeInViewport();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

// Measured at 735px against a 640px screen, which put the confirm button
// below the fold at the exact moment the alarm was going off.
test("the get-off panel fits a small phone with its button in reach", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  await page.setViewportSize({ width: 360, height: 640 });
  await routeTargetStop(page, { vehicleatstop: true, expectedarrivaltime: 0 });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });
  await expect(page.getByRole("heading", { name: "Get off now" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  const panel = await page
    .locator('section[aria-labelledby="ride-mode-title"]')
    .boundingBox();
  expect(panel.height).toBeLessThanOrEqual(640);

  await expect(page.getByRole("button", { name: "I'm getting off" })).toBeInViewport();
  // The stop name and the instruction have to be on screen with it.
  await expect(page.getByText("Puistokatu").first()).toBeInViewport();
  await expect(
    page.getByText("Move to the doors and step off here.")
  ).toBeInViewport();
});

// The panel used to pin itself to the top of the screen for the whole ride.
// At 836px against a 640px screen that kept "End ride" and "Test alert"
// below the fold: scrolling moved the page under the panel, never the
// panel's own bottom into view, and the board underneath was unusable.
test("a ride's own controls stay reachable on a small phone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  await page.setViewportSize({ width: 360, height: 640 });
  // Fifteen minutes out: the tallest the panel gets, sound check included.
  await routeTargetStop(page, {
    expectedarrivaltime: Math.floor(Date.now() / 1000) + 900,
  });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });
  const panel = page.locator('section[aria-labelledby="ride-mode-title"]');
  await expect(
    panel.getByRole("group", { name: "Alert sound check" })
  ).toBeVisible();

  // A thumb scrolling down one screen from the top must pass each control.
  for (const name of ["Test alert", "Turn off alert"]) {
    const control = panel.getByRole("button", { name });
    let seen = false;
    for (let y = 0; y <= 640 && !seen; y += 160) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      seen = await control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
      });
    }
    expect(seen, name).toBe(true);
  }

  // And the board is still there to use during the ride.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("heading", { name: "Kauppatori" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeInViewport();
});

test("Ride Mode says get off now once the bus is standing at the stop", async ({
  page,
}, testInfo) => {
  // The vehicle being listed at the target stop is the strongest evidence
  // there is, and it is the only one that can raise the alarm without GPS.
  const capturing = testInfo.project.name === "chromium-mobile";
  if (capturing) await atMorningCommute(page);
  // Standing there, it leaves within the minute: "Due", not "2 min".
  await routeTargetStop(page, {
    vehicleatstop: true,
    expectedarrivaltime: 0,
    expecteddeparturetime: Math.floor(Date.now() / 1000) + 45,
  });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });

  await expect(page.getByRole("heading", { name: "Get off now" })).toBeVisible();
  await expect(page.locator('[data-stage="now"]')).toBeVisible();

  // The README's picture of the feature, taken from the real panel.
  if (capturing) {
    fs.mkdirSync("artifacts/screenshots", { recursive: true });
    await page
      .locator('section[aria-labelledby="ride-mode-title"]')
      .screenshot({ path: "artifacts/screenshots/turku-departures-ride-now.png" });
    // And the whole screen, for the install sheet (public/screenshots),
    // over the board of the stop being got off at: under it, Kauppatori's
    // board showed the same bus four minutes from Kauppatori.
    await page.goto("/?stop=32");
    await expect(page.getByRole("heading", { name: "Get off now" })).toBeVisible();
    await expect(
      page.locator('section[aria-labelledby="departures-title"]').getByRole("heading", { name: "Puistokatu" })
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/screenshots/manifest-ride-phone.jpg",
      type: "jpeg",
      quality: 80,
    });
  }

  // The confirmation only exists at this stage, and it has to end the ride
  // so the repeating alert stops for someone already on the pavement.
  await page.getByRole("button", { name: "I'm getting off" }).click();
  await expect(page.getByRole("heading", { name: "Get off now" })).toHaveCount(
    0
  );
  // The button went with the panel. Focus lands on the board's heading,
  // not at the top of the page.
  await expect(page.locator("#departures-title")).toBeFocused();
});

// Start, Cancel and Turn off alert each take away the button pressed, and
// focus fell to the top of the page every time. It follows the passenger
// instead: back to the row, on to the alert, and back to the board.
test("keyboard focus follows a get-off alert from setup to the end of the ride", async ({
  page,
}) => {
  await routeTargetStop(page);
  await page.goto("/?stop=164");
  await seedHome(page);

  const setup = page.locator('section[aria-label="Set up get-off alerts"]');
  await page.getByRole("button", { name: "Get-off alert" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await expect(setup).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Get-off alert" }).first()
  ).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator('input[type="radio"][value="2"]')).toBeChecked();
  await page.getByRole("checkbox", { name: /Follow my location/i }).uncheck();
  await turnOffNotifications(page);
  await page.getByRole("button", { name: "Start get-off alert" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ride-mode-title")).toBeFocused();

  await page.getByRole("button", { name: "Turn off alert" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Tap again to turn it off" })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ride-mode-title")).toHaveCount(0);
  await expect(page.locator("#departures-title")).toBeFocused();
});

test("Ride Mode offers recovery after the passenger rides past the stop", async ({
  page,
  context,
}) => {
  await routeTargetStop(page);
  // No usable shape, so the ride falls back to straight-line GPS.
  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/[^/]+\/shapes\/.*/,
    async (route) => {
      await route.fulfill({ contentType: "application/json", body: "[]" });
    }
  );

  await context.grantPermissions(["geolocation"]);
  // Still a few stops away when the ride starts.
  await context.setGeolocation({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 25,
  });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: true });

  await expect(
    page.getByRole("heading", { name: "Get ready to press STOP" })
  ).toBeVisible();

  // Close enough to count as an approach, but not close enough to claim the
  // passenger is at the door: that band is what arms the missed-stop check.
  await context.setGeolocation({
    latitude: 60.44945,
    longitude: 22.255,
    accuracy: 25,
  });
  await expect(page.getByText(/≈7[0-9] m from your stop/)).toBeVisible();

  // The bus carried on without them.
  await context.setGeolocation({
    latitude: 60.4533,
    longitude: 22.255,
    accuracy: 25,
  });

  await expect(
    page.getByRole("heading", { name: "Your stop may be behind you" })
  ).toBeVisible();
  await expect(
    page.getByText("Next planned stop: Turun linna")
  ).toBeVisible();

  await page.getByRole("button", { name: "Open next stop" }).click();
  await expect(page).toHaveURL(/stop=4/);
});

test("Ride Mode reopens a false miss only after newer live evidence for the same run", async ({
  page,
  context,
}) => {
  const firstSnapshotSec = Math.floor(Date.now() / 1000);
  const firstObservedAt = firstSnapshotSec - 5;
  let recoverySnapshot = false;
  let resolveRecoverySnapshot;
  const recoverySnapshotServed = new Promise((resolve) => {
    resolveRecoverySnapshot = resolve;
  });

  await page.route("https://data.foli.fi/siri/sm/32", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    // Keep the pre-miss snapshot byte-for-byte stable even if the browser
    // happens to cross a wall-clock second between polls. The recovery
    // snapshot changes recordedattime deterministically, so the production
    // signature logic sees genuinely newer provider evidence.
    const observedAt = recoverySnapshot ? now : firstObservedAt;
    const expectedAt = recoverySnapshot ? now + 70 : firstSnapshotSec + 70;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        stopname: "Puistokatu",
        servertime: now,
        result: [
          rideArrival(now, {
            recordedattime: observedAt,
            expectedarrivaltime: expectedAt,
            expecteddeparturetime: expectedAt + 15,
            aimedarrivaltime: expectedAt + 20,
          }),
        ],
      }),
    });
    if (recoverySnapshot) resolveRecoverySnapshot?.();
  });

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/[^/]+\/shapes\/.*/,
    async (route) => {
      await route.fulfill({ contentType: "application/json", body: "[]" });
    }
  );
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 25,
  });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: true });
  await expect(page.locator('[data-stage="next"]')).toBeVisible();

  await context.setGeolocation({
    latitude: 60.44945,
    longitude: 22.255,
    accuracy: 25,
  });
  await expect(page.getByText(/≈7[0-9] m from your stop/)).toBeVisible();

  await context.setGeolocation({
    latitude: 60.4533,
    longitude: 22.255,
    accuracy: 25,
  });
  await expect(page.locator('[data-stage="missed"]')).toBeVisible();

  // The correction contract requires the provider observation to be newer
  // than the saved MISSED transition, not merely delivered later. Wait for
  // the browser clock to move beyond that exact millisecond, then release a
  // deterministically distinct SIRI snapshot and prove the poll consumed it.
  await page.waitForFunction(() => {
    const ride = JSON.parse(
      globalThis.localStorage.getItem("foli-active-ride-v1") || "null"
    );
    return (
      Number.isFinite(Number(ride?.stageChangedAt)) &&
      Date.now() > Number(ride.stageChangedAt)
    );
  });

  // Repeated pre-miss transit data is not enough. Release one distinct SIRI
  // observation only after MISSED; it still matches the committed dated
  // journey and puts the target about a minute ahead.
  recoverySnapshot = true;
  await page.evaluate(() =>
    document.dispatchEvent(new globalThis.Event("visibilitychange"))
  );
  await recoverySnapshotServed;

  await expect(page.locator('[data-stage="next"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Get ready to press STOP" })
  ).toBeVisible();
});

test("Ride Mode does not mistake an untracked timetable row for the bus", async ({
  page,
}) => {
  // The feed still lists the journey at the exit stop, but is not tracking
  // it: the time on that row is the raw timetable, one minute out. Read as
  // live it said "Following your bus" and "Press STOP now" two stops early.
  await page.route("https://data.foli.fi/siri/sm/4", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        servertime: now,
        result: [
          {
            lineref: "1",
            destinationdisplay: "Satama",
            monitored: false,
            __tripref: "trip-164-1",
            aimedarrivaltime: now + 60,
            aimeddeparturetime: now + 60,
          },
        ],
      }),
    });
  });

  await page.goto("/?stop=164");
  await seedHome(page);

  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();
  const turunLinna = page.locator('input[type="radio"][value="3"]');
  await turunLinna.check();
  await page
    .getByRole("checkbox", { name: /Follow my location/i })
    .uncheck();
  await turnOffNotifications(page);

  const exitStopAnswered = page.waitForResponse(
    "https://data.foli.fi/siri/sm/4"
  );
  await page.getByRole("button", { name: "Start get-off alert" }).click();
  await exitStopAnswered;

  // Two planned stops out, but the bus is not due to leave Kauppatori for
  // a few minutes yet: the timetable raises nothing before it has left.
  await expect(
    page.getByRole("heading", { name: "No need to watch for your stop" })
  ).toBeVisible();
  await expect(page.locator('[data-health="schedule"]')).toBeVisible();
  await expect(page.getByText("Looking for your bus")).toBeVisible();
  await expect(
    page.getByText(/We cannot see your bus in the live data right now/)
  ).toBeVisible();
  await expect(page.locator('[data-health="live"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your stop is next" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Turn off alert" }).click();
  await page.getByRole("button", { name: "Tap again to turn it off" }).click();
});

test("an open get-off setup survives a board refresh", async ({ page }) => {
  // The live estimate moves on nearly every refresh. The setup used to be
  // keyed on it, so it closed mid-choice and forgot the chosen stop. The
  // timetable times stay put, as they do in the real feed.
  const plannedAt = Math.floor(Date.now() / 1000) + 205;
  let answers = 0;
  await page.route("https://data.foli.fi/siri/sm/164", async (route) => {
    answers += 1;
    const payload = monitorPayload("164");
    payload.result[0].aimeddeparturetime = plannedAt;
    payload.result[0].expecteddeparturetime = plannedAt + 35 + answers * 20;
    payload.result[1].aimeddeparturetime = plannedAt + 335;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto("/?stop=164");
  await seedHome(page);

  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();
  const setupHeading = page.getByRole("heading", {
    name: "Where do you want to get off?",
  });
  await expect(setupHeading).toBeVisible();
  const turunLinna = page.locator('input[type="radio"][value="3"]');
  await turunLinna.check();

  const refreshed = page.waitForResponse("https://data.foli.fi/siri/sm/164");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await refreshed;
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true })
  ).toBeEnabled();

  await expect(setupHeading).toBeVisible();
  await expect(turunLinna).toBeChecked();
});

test("an open get-off setup does not follow the passenger to another stop", async ({
  page,
}) => {
  // A neighbouring stop can list the same trip under the same planned minute,
  // so its row looked like the one whose setup was open. Another stop's board
  // starts fresh, and so does coming back to this one.
  const plannedAt = Math.floor(Date.now() / 1000) + 205;
  for (const [stopId, stopname] of [
    ["164", "Kauppatori"],
    ["4", "Turun linna"],
  ]) {
    await page.route(`https://data.foli.fi/siri/sm/${stopId}`, async (route) => {
      const payload = monitorPayload("164");
      payload.stopname = stopname;
      payload.result[0].aimeddeparturetime = plannedAt;
      payload.result[0].expecteddeparturetime = plannedAt + 35;
      payload.result[1].aimeddeparturetime = plannedAt + 335;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });
  }

  await page.goto("/?stop=164");
  await seedHome(page);

  const setupHeading = page.getByRole("heading", {
    name: "Where do you want to get off?",
  });
  const alertButton = page
    .getByRole("button", { name: "Get-off alert" })
    .first();
  await alertButton.click();
  await expect(setupHeading).toBeVisible();

  await page.getByLabel("Find your stop").fill("4");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(page).toHaveURL(/stop=4/);
  await expect(
    page.getByRole("heading", { name: "Turun linna", exact: true })
  ).toBeVisible();
  await expect(alertButton).toBeVisible();
  await expect(setupHeading).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/stop=164/);
  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(alertButton).toBeVisible();
  await expect(setupHeading).toHaveCount(0);
});

test("switching to another get-off alert asks before replacing the active ride", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stop_times/trip/trip-164-7",
    async (route) => {
      const at = gtfsClockAt(Math.floor(Date.now() / 1000) + 540);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            stop_id: "164",
            arrival_time: at(-60),
            departure_time: at(0),
            stop_sequence: 1,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
            shape_dist_traveled: 0,
          },
          {
            stop_id: "32",
            arrival_time: at(300),
            departure_time: at(300),
            stop_sequence: 2,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 0,
            shape_dist_traveled: 900,
          },
          {
            stop_id: "4",
            arrival_time: at(840),
            departure_time: at(840),
            stop_sequence: 3,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
            shape_dist_traveled: 3000,
          },
        ]),
      });
    }
  );

  await page.goto("/?stop=164");

  await page.getByRole("button", { name: "Get-off alert" }).first().click();
  await page.locator('input[type="radio"][value="2"]').check();
  await page
    .getByRole("checkbox", { name: /Follow my location/i })
    .uncheck();
  await turnOffNotifications(page);
  await page.getByRole("button", { name: "Start get-off alert" }).click();

  const ridePanel = page.locator('section[aria-labelledby="ride-mode-title"]');
  await expect(ridePanel).toContainText("1");
  await ridePanel.getByRole("button", { name: "Yes" }).click();
  await expect(
    ridePanel.getByRole("group", { name: "Alert sound check" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Get-off alert" }).first().click();
  await page.locator('input[type="radio"][value="2"]').check();
  await page
    .getByRole("checkbox", { name: /Follow my location/i })
    .uncheck();
  await turnOffNotifications(page);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Switch get-off alert to line 7?");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Start get-off alert" }).click();
  await expect(ridePanel).toContainText("1");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Switch get-off alert to line 7?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Start get-off alert" }).click();

  await expect(ridePanel).toContainText("7");
  await expect(
    ridePanel.getByRole("group", { name: "Alert sound check" })
  ).toBeVisible();
});

test("a reload keeps the final-walk continuation attached to Ride Mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await routeTargetStop(page, { vehicleatstop: true });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });

  await page.evaluate(() => {
    const ride = JSON.parse(
      globalThis.localStorage.getItem("foli-active-ride-v1") || "null"
    );
    if (!ride?.id || !ride?.targetStop?.id) {
      throw new Error("Expected an active stored ride.");
    }

    const now = Date.now();
    globalThis.localStorage.setItem(
      "foli-active-ride-v1",
      JSON.stringify({
        ...ride,
        stage: "now",
        stageReason: "target-at-stop",
        stageConfidence: "live",
        stageChangedAt: now,
      })
    );
    globalThis.sessionStorage.setItem(
      "foli-active-ride-continuation-v1",
      JSON.stringify({
        rideId: ride.id,
        continuation: {
          transferJourney: null,
          finalWalk: {
            destinationId: "external:test-destination",
            destinationLabel: "Private destination",
            lat: 60.451,
            lon: 22.266,
            fromStopId: String(ride.targetStop.id),
            fromStopName: String(ride.targetStop.name || ride.targetStop.id),
            distanceMeters: 320,
          },
        },
      })
    );
  });

  await page.reload();

  const gettingOff = page.getByRole("button", { name: "I'm getting off" });
  await expect(gettingOff).toBeVisible();
  await gettingOff.click();

  await expect(
    page.getByRole("heading", { name: "Walk to Private destination" })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      globalThis.sessionStorage.getItem("foli-active-ride-continuation-v1")
    )
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      globalThis.localStorage.getItem("foli-active-ride-v1")
    )
  ).toBeNull();
});

test("a reload keeps the committed transfer continuation attached to Ride Mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await routeTargetStop(page, { vehicleatstop: true });

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });

  await page.evaluate(() => {
    const ride = JSON.parse(
      globalThis.localStorage.getItem("foli-active-ride-v1") || "null"
    );
    if (!ride?.id || !ride?.targetStop?.id || !ride?.tripRef) {
      throw new Error("Expected an active stored ride.");
    }

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    globalThis.localStorage.setItem(
      "foli-active-ride-v1",
      JSON.stringify({
        ...ride,
        stage: "now",
        stageReason: "target-at-stop",
        stageConfidence: "live",
        stageChangedAt: nowMs,
      })
    );

    const firstLeg = {
      tripRef: String(ride.tripRef),
      lineRef: String(ride.lineRef || "1"),
      boardStopId: String(ride.boardingStop?.id || "164"),
      boardStopSequence: null,
      exitStopId: String(ride.targetStop.id),
      exitStopSequence: null,
      departureAt: nowSec - 600,
      arrivalAt: nowSec,
      aimedDepartureAt: nowSec - 600,
      originAimedDepartureAt: nowSec - 660,
      liveState: "live",
    };
    const secondLeg = {
      tripRef: "trip-transfer-2",
      lineRef: "7",
      boardStopId: "4",
      boardStopSequence: null,
      exitStopId: "32",
      exitStopSequence: null,
      departureAt: nowSec + 900,
      arrivalAt: nowSec + 1500,
      aimedDepartureAt: nowSec + 900,
      originAimedDepartureAt: nowSec + 840,
      liveState: "schedule",
    };
    const transfer = {
      alightStopId: String(ride.targetStop.id),
      alightStopSequence: 2,
      boardStopId: "4",
      boardStopName: "Turun linna",
      walkingDistanceM: 75,
      feasibility: {
        state: "comfortable",
        recommendable: true,
        incomingArrivalAt: nowSec,
        outgoingDepartureAt: nowSec + 900,
        walkingDistanceM: 75,
        requiredSec: 120,
        availableSec: 900,
        slackSec: 780,
      },
    };
    const itinerary = {
      id: "reload-transfer-itinerary",
      originStopId: firstLeg.boardStopId,
      originStopName: String(ride.boardingStop?.name || firstLeg.boardStopId),
      originDistanceMeters: 0,
      legs: [firstLeg, secondLeg],
      transfers: [transfer],
      destinationStopId: secondLeg.exitStopId,
      destinationArrivalAt: secondLeg.arrivalAt,
      finalWalkDistanceM: null,
      finalWalkSecEstimate: null,
      journeyArrivalAt: secondLeg.arrivalAt,
      totalWalkingDistanceM: 75,
      reliability: "medium",
    };
    const transferJourney = {
      id: itinerary.id,
      destinationId: "stop:32",
      destinationKind: "public-stop",
      destinationLabel: "Puistokatu",
      optionLabel: "transfer",
      stopId: firstLeg.boardStopId,
      stopName: String(ride.boardingStop?.name || firstLeg.boardStopId),
      distanceMeters: 0,
      tripRef: firstLeg.tripRef,
      lineRef: firstLeg.lineRef,
      destinationStopId: firstLeg.exitStopId,
      destinationStopSequence: null,
      departureAt: firstLeg.departureAt,
      aimedDepartureAt: firstLeg.aimedDepartureAt,
      originAimedDepartureAt: firstLeg.originAimedDepartureAt,
      destinationArrivalAt: itinerary.destinationArrivalAt,
      journeyArrivalAt: itinerary.journeyArrivalAt,
      finalWalkDistanceM: null,
      finalWalkSecEstimate: null,
      liveState: "live",
      phase: "walking-to-stop",
      recoveryReason: null,
      selectedAt: nowMs - 10_000,
      atStopConfirmedAt: null,
      lastSeenAt: nowMs - 10_000,
      itinerary,
      activeLegIndex: 0,
      futureLegRevalidations: {},
      transferPlan: null,
      transferLeg: null,
      transferRevalidation: null,
    };

    globalThis.sessionStorage.setItem(
      "foli-active-ride-continuation-v1",
      JSON.stringify({
        rideId: ride.id,
        continuation: {
          transferJourney,
          finalWalk: null,
        },
      })
    );
  });

  await page.reload();

  const gettingOff = page.getByRole("button", { name: "I'm getting off" });
  await expect(gettingOff).toBeVisible();
  await gettingOff.click();

  await expect(
    page.getByRole("heading", { name: "Walk to Turun linna" })
  ).toBeVisible();
  await expect(page.getByText("Leg 2 of 2 · continue on line 7")).toBeVisible();
  expect(
    await page.evaluate(() =>
      globalThis.sessionStorage.getItem("foli-active-ride-continuation-v1")
    )
  ).toBeNull();
});

// The same ride open in two tabs: turned off in one, the other kept alerting
// and later wrote its copy back, so the ride returned on the next reload.
test("a get-off alert turned off in one tab ends in the other and stays off", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await routeTargetStop(page);

  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });
  const ready = (tab) =>
    tab.getByRole("heading", { name: "Get ready to press STOP" });
  await expect(ready(page)).toBeVisible();

  const otherTab = await context.newPage();
  await mockFoli(otherTab);
  await routeTargetStop(otherTab);
  await otherTab.goto("/?stop=164");
  await expect(ready(otherTab)).toBeVisible();

  await page.getByRole("button", { name: "Turn off alert" }).click();
  await page.getByRole("button", { name: "Tap again to turn it off" }).click();
  await expect(ready(page)).toHaveCount(0);

  // The other tab follows without a reload and writes nothing back, however
  // long it keeps running.
  await expect(ready(otherTab)).toHaveCount(0);
  await otherTab.waitForTimeout(11_000);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(ready(page)).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("foli-active-ride-v1"))
  ).toBeNull();
  await otherTab.close();
});

// On a wide screen the running alert stays pinned to the top of the page.
// Tabbing on through the page put focused controls underneath it, out of
// sight (WCAG 2.4.11): the page now keeps focus below the panel.
test("keyboard focus is never hidden under the pinned ride panel", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeTargetStop(page, {
    expectedarrivaltime: Math.floor(Date.now() / 1000) + 900,
  });
  await page.goto("/?stop=164");
  await seedHome(page);
  await startRide(page, { gps: false });

  const panel = page.locator("[data-stage]");
  await expect(panel).toBeVisible();

  for (const target of [
    page.getByRole("combobox", { name: "Find your stop" }),
    page.getByRole("button", { name: "Next stops" }).first(),
    page.getByRole("link", { name: "Get me Home by public transit" }),
  ]) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await target.focus();
    const panelBox = await panel.boundingBox();
    const box = await target.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height - 1);
  }
});
