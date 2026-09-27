import fs from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";


function encodeSharedPlaceForTest(payload) {
  const bytes = new globalThis.TextEncoder().encode(JSON.stringify(payload));
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}


async function seedHome(page, { primaryStopId = "164" } = {}) {
  await page.evaluate((primary) => {
    localStorage.setItem(
      "foli-stop-catalog-v2",
      JSON.stringify({
        savedAt: Date.now(),
        stops: [
          {
            id: "164",
            name: "Kauppatori",
            lat: 60.4518,
            lon: 22.2666,
          },
          {
            id: "32",
            name: "Puistokatu",
            lat: 60.4488,
            lon: 22.255,
          },
          {
            id: "4",
            name: "Turun linna",
            lat: 60.4355,
            lon: 22.2345,
          },
        ],
      })
    );
    localStorage.setItem(
      "foli-my-places-v1",
      JSON.stringify([
        {
          id: "home",
          label: "Home",
          icon: "⌂",
          primaryStopId: primary,
          stops: [
            { id: "164", name: "Kauppatori" },
            { id: "32", name: "Puistokatu" },
          ],
          updatedAt: 1,
        },
      ])
    );
  }, primaryStopId);
  await page.reload();
}

// The README's and the install sheet's pictures showed whatever hour the
// suite ran at, 01:00 more often than not. For them, the page and the mocks
// here both move to 08:10 in Turku, so every time on screen agrees.
let restoreClock = null;

async function atMorningCommute(page) {
  const realNow = Date.now.bind(Date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(realNow()))
      .map((part) => [part.type, part.value])
  );
  const offsetHours = Number(parts.timeZoneName.match(/GMT([+-]\d+)/)?.[1] || 0);
  const morning = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    8 - offsetHours,
    10
  );
  const shift = morning - realNow();
  Date.now = () => realNow() + shift;
  restoreClock = () => {
    Date.now = realNow;
  };
  // Only Date is fixed. Real timers must keep running: Ride Mode polls the
  // target stop on timers, and freezing them made the screenshot scenario
  // intermittently miss its strongest "vehicle at stop" evidence.
  await page.clock.setFixedTime(Date.now());
}

test.afterEach(() => {
  restoreClock?.();
  restoreClock = null;
});

// GTFS writes a trip's times in its service day, which runs past midnight
// ("24:05:00") until early morning.
function gtfsClockAt(unixSeconds) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(unixSeconds * 1000));
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  let seconds = part("hour") * 3600 + part("minute") * 60 + part("second");
  if (seconds < 4 * 3600) seconds += 86_400;
  return (offset) => {
    const at = seconds + offset;
    return [Math.floor(at / 3600), Math.floor((at % 3600) / 60), at % 60]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };
}

function monitorPayload(stopId) {
  const now = Math.floor(Date.now() / 1000);
  const isMarket = stopId === "164";

  return {
    status: "OK",
    stopname: isMarket ? "Kauppatori" : "Turun linna",
    servertime: now,
    result: [
      {
        lineref: isMarket ? "1" : "8",
        destinationdisplay: isMarket ? "Satama" : "Kauppatori",
        destinationdisplay_en: isMarket ? "Harbour" : "Market Square",
        destinationdisplay_sv: isMarket ? "Hamnen" : "Salutorget",
        monitored: true,
        vehicleatstop: isMarket,
        __tripref: isMarket ? "trip-164-1" : "trip-4-8",
        delay: 35,
        recordedattime: now - 20,
        latitude: isMarket ? 60.4538 : 60.437,
        longitude: isMarket ? 22.2666 : 22.2345,
        expecteddeparturetime: now + 240,
        aimeddeparturetime: now + 205,
      },
      {
        lineref: isMarket ? "7" : "2",
        destinationdisplay: isMarket ? "Runosmäki" : "Satama",
        destinationdisplay_en: isMarket ? "" : "Harbour",
        destinationdisplay_sv: isMarket ? "Runosbacken" : "Hamnen",
        monitored: false,
        __tripref: isMarket ? "trip-164-7" : "trip-4-2",
        delay: null,
        aimeddeparturetime: now + 540,
      },
    ],
  };
}

async function mockFoli(page) {
  await page.route("https://data.foli.fi/siri/sm", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "164": { stop_name: "Kauppatori" },
        "4": { stop_name: "Turun linna" },
        "32": { stop_name: "Puistokatu" },
      }),
    });
  });

  await page.route("https://data.foli.fi/gtfs/", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        host: "data.foli.fi",
        gtfspath: "/gtfs/v0",
        latest: "20260920-120000",
      }),
    });
  });

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stops",
    async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "164": {
          stop_name: "Kauppatori",
          stop_lat: 60.4518,
          stop_lon: 22.2666,
        },
        "4": {
          stop_name: "Turun linna",
          stop_lat: 60.4355,
          stop_lon: 22.2345,
        },
        "32": {
          stop_name: "Puistokatu",
          stop_lat: 60.4488,
          stop_lon: 22.255,
        },
      }),
    });
    }
  );

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/routes",
    async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          route_id: "1",
          route_short_name: "1",
          route_long_name: "Satama-Kauppatori-Lentoasema",
          route_type: 3,
          route_color: "ffff00",
          route_text_color: "ffffff",
        },
        {
          route_id: "7",
          route_short_name: "7",
          route_long_name: "Keskusta-Runosmaki",
          route_type: 3,
          route_color: "007985",
          route_text_color: "ffffff",
        },
        {
          route_id: "8",
          route_short_name: "8",
          route_long_name: "Turun linna-Kauppatori",
          route_type: 3,
          route_color: "d20824",
          route_text_color: "ffffff",
        },
        {
          route_id: "99",
          route_short_name: "99",
          route_long_name: "Static-only test route",
          route_type: 3,
          route_color: "355c7d",
          route_text_color: "ffffff",
        },
        {
          route_id: "2",
          route_short_name: "2",
          route_long_name: "Test route",
          route_type: 3,
          route_color: "007985",
          route_text_color: "ffffff",
        },
      ]),
    });
    }
  );

  await page.route(
    "https://data.foli.fi/geojson/bounds/compact",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [21.9, 60.3],
                      [22.6, 60.3],
                      [22.6, 60.7],
                      [21.9, 60.7],
                      [21.9, 60.3],
                    ],
                  ],
                ],
              },
            },
          ],
        }),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/stop_times\/stop\/(164|4|32)/,
    async (route) => {
      const stopId = route.request().url().split("/").pop();
      const data =
        stopId === "164"
          ? [
              { trip_id: "trip-164-1", pickup_type: 0 },
              { trip_id: "trip-164-99", pickup_type: 0 },
            ]
          : stopId === "4"
            ? [{ trip_id: "trip-4-8", pickup_type: 0 }]
            : [];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/trips\/route\/(1|99)/,
    async (route) => {
      const routeId = route.request().url().split("/").pop();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          routeId === "1"
            ? [{ trip_id: "trip-164-1" }]
            : [{ trip_id: "trip-164-99" }]
        ),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/trips\/trip\/(trip-164-1|trip-164-7|trip-4-8|trip-4-2)/,
    async (route) => {
      const tripId = route.request().url().split("/").pop();
      const wheelchair = tripId === "trip-164-7" ? 2 : 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            route_id: tripId.includes("-7") ? "7" : tripId.includes("-8") ? "8" : tripId.includes("-2") ? "2" : "1",
            service_id: "weekday",
            trip_headsign: tripId.includes("-7") ? "Runosmäki" : "Harbour",
            direction_id: 0,
            block_id: "block-1",
            shape_id: "shape-1",
            wheelchair_accessible: wheelchair,
            bikes_allowed: 0,
          },
        ]),
      });
    }
  );

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stop_times/trip/trip-164-1",
    async (route) => {
      // Timed from the market-stop departure the board shows, so next stops
      // and screenshots read "around 20:17" beside a 20:12 bus, not 17:46.
      const at = gtfsClockAt(Math.floor(Date.now() / 1000) + 205);
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
          },
        ]),
      });
    }
  );

  await page.route("https://data.foli.fi/media/detour.png", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>',
    });
  });

  await page.route(/https:\/\/data\.foli\.fi\/siri\/sm\/(164|4|32)/, async (route) => {
    const stopId = route.request().url().split("/").pop();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(monitorPayload(stopId)),
    });
  });

  await page.route("https://data.foli.fi/alerts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: Math.floor(Date.now() / 1000),
        global_message: {},
        emergency_message: {},
        messages: [
          {
            message_id: 21,
            isactive: true,
            priority: 900,
            effect: "DETOUR",
            cause: "CONSTRUCTION",
            affected_stops: [],
            affected_routes: ["1"],
            // Föli writes its notices in Finnish and translates them.
            header: "Linjan 1 poikkeusreitti keskustassa",
            message: "Linja 1 kulkee tilapäistä reittiä.",
            information: "Pysäkki 14 ei ole käytössä töiden aikana.",
            translations: {
              en: {
                header: "Line 1 city-centre detour",
                message: "Line 1 uses a temporary route.",
                information: "Stop 14 is not in use during the works.",
              },
            },
            repeat: [[
              Math.floor(Date.now() / 1000) - 60,
              Math.floor(Date.now() / 1000) + 3600,
            ]],
            images: [
              {
                url: "//data.foli.fi/media/detour.png",
                title: "Temporary detour map",
                type: "image/png",
              },
            ],
          },
          {
            message_id: 22,
            isactive: true,
            priority: 950,
            effect: "NO_SERVICE",
            affected_stops: [],
            affected_routes: ["99"],
            header: "Linjan 99 muutos",
            message: "Tällä reitillä ei ole nyt lähtöä.",
            translations: {
              en: {
                header: "Line 99 service change",
                message: "This route has no current departure row.",
              },
            },
          },
        ],
        cancellations: [],
      }),
    });
  });
}

// On a phone the service updates fold into one line; this opens them.
async function openServiceUpdates(page) {
  await page.locator("#service-alerts-list").waitFor({ state: "attached" });
  const fold = page.locator('[aria-controls="service-alerts-list"]');
  if (await fold.isVisible()) await fold.click();
}

test.beforeEach(async ({ page }) => {
  await mockFoli(page);
});

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

function rideArrival(now, overrides = {}) {
  return {
    lineref: "1",
    destinationdisplay: "Satama",
    monitored: true,
    vehicleatstop: false,
    vehicleref: "bus-ride-1",
    datedvehiclejourneyref: "journey-ride-1",
    __tripref: "trip-164-1",
    originaimeddeparturetime: now - 180,
    recordedattime: now - 5,
    expectedarrivaltime: now + 70,
    expecteddeparturetime: now + 85,
    aimedarrivaltime: now + 90,
    ...overrides,
  };
}

async function routeTargetStop(page, overrides = {}) {
  await page.route("https://data.foli.fi/siri/sm/32", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        stopname: "Puistokatu",
        servertime: now,
        result: [rideArrival(now, overrides)],
      }),
    });
  });
}

// iPhone Safari notifies only from an app added to the Home Screen, so on
// an iPhone the setup explains that instead of offering the checkbox.
async function turnOffNotifications(page) {
  const notifications = page.getByRole("checkbox", {
    name: /Also show notifications/i,
  });
  const iphoneNote = page.getByText(/On iPhone, notifications need this app/);
  await expect(notifications.or(iphoneNote)).toBeVisible();
  if (await iphoneNote.isVisible()) {
    await expect(notifications).toHaveCount(0);
    return;
  }
  await notifications.uncheck();
}

async function startRide(page, { gps }) {
  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();

  await expect(page.locator('input[type="radio"][value="2"]')).toBeChecked();

  const gpsToggle = page.getByRole("checkbox", {
    name: /Follow my location/i,
  });
  if (gps) {
    await gpsToggle.check();
  } else {
    await gpsToggle.uncheck();
  }
  await turnOffNotifications(page);

  await page.getByRole("button", { name: "Start get-off alert" }).click();
}

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
      .screenshot({ path: "artifacts/screenshots/foli-ride-now.png" });
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
  await expect(page.getByText(/roughly 7[0-9] m away/)).toBeVisible();

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

test("Back keeps keyboard focus on the departure board", async ({ page }) => {
  // Back and Forward change the stop under the same board. Remounting the
  // board for that dropped keyboard focus to the page, and replaced the live
  // region that announces the stop.
  await page.goto("/?stop=164");
  await page.getByLabel("Find your stop").fill("4");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(page).toHaveURL(/stop=4/);

  await page
    .getByRole("button", { name: "Save Turun linna to favourites" })
    .focus();
  await page.evaluate(() => globalThis.history.back());

  await expect(page).toHaveURL(/stop=164/);
  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Kauppatori to favourites" })
  ).toBeFocused();
});

// A phone screen is tight, so the explanatory copy was hidden below 620px —
// including the line that says what the app is, to the one person who does
// not know. It is back, but only while it still earns the space.
test("a phone is told what the app is until it no longer needs telling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const intro = page.locator(".context");
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("we’ll tell you when to press STOP");

  // These two sections are three bare rows and a lone button on a phone;
  // nothing else ever says what they are for.
  await expect(
    page.getByText("Save Home, School or Work as public stops", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Find the closest stop with a one-time location check")
  ).toBeVisible();
  await expect(page.getByText("Search by stop name or number.")).toBeVisible();

  // The departure board still has to win the top of the screen.
  await expect(page.getByText("Bus is at the stop")).toBeInViewport();

  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  // Its job is done, and the recovery card now needs that space.
  await expect(page.locator(".context")).not.toBeVisible();
});

test("daily flow: search, save, navigate and restore with Back", async ({ page }) => {
  await page.goto("/?stop=164");

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await openServiceUpdates(page);
  const alerts = page.locator('[aria-labelledby="service-alerts-title"]');
  const detourSummary = alerts.getByText("Line 1 city-centre detour", { exact: true });
  await expect(detourSummary).toBeVisible();
  await expect(alerts.getByText("Detour", { exact: true })).toBeVisible();
  await expect(alerts.getByText("Line 99 service change", { exact: true })).toBeVisible();
  // The notice is on the affected line's own buses too.
  await expect(
    page.locator("tbody tr").first().getByText("Detour", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(page.getByText(/Bus is at the stop/i)).toBeVisible();
  await expect(page.getByTitle("Wheelchair accessible").first()).toBeVisible();

  const boardPrecedesPlaceManagement = await page.evaluate(() => {
    const board = document.querySelector('[aria-labelledby="departures-title"]');
    const places = document.querySelector('[aria-labelledby="my-places-title"]');
    return Boolean(
      board &&
        places &&
        (board.compareDocumentPosition(places) &
          globalThis.Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(boardPrecedesPlaceManagement).toBe(true);

  await detourSummary.click();
  await expect(page.getByText(/Line 1 · Valid until/i)).toBeVisible();
  await expect(page.getByText("Line 1 uses a temporary route.")).toBeVisible();
  await expect(
    page.getByText("Stop 14 is not in use during the works.")
  ).toBeVisible();
  await expect(page.getByAltText("Temporary detour map")).toBeVisible();

  await page.getByRole("button", { name: "Next stops" }).first().click();
  await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  await expect(page.getByText(/^around \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByText("Puistokatu")).toBeVisible();

  const lineOneBadge = page.getByTitle("Satama-Kauppatori-Lentoasema");
  await expect(lineOneBadge).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await expect(lineOneBadge).toHaveCSS("color", "rgb(0, 0, 0)");

  await page.getByRole("button", { name: "Save Kauppatori to favourites" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Kauppatori from favourites" })
  ).toHaveAttribute("aria-pressed", "true");

  const search = page.getByRole("combobox", { name: "Find your stop" });
  await search.fill("Turun");
  await page.getByRole("option", { name: /Turun linna/i }).click();

  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Kauppatori/ })).toBeVisible();
  await page.evaluate(() => globalThis.history.back());
  await expect(page).toHaveURL(/stop=164/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await page.evaluate(() => globalThis.history.forward());
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
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



test("keeps the live departure board above place management in the normal flow", async ({
  page,
}) => {
  await page.goto("/?stop=164");
  await seedHome(page);

  const board = page.locator('section[aria-labelledby="departures-title"]');
  const places = page.locator('section[aria-labelledby="my-places-title"]');

  const boardBox = await board.boundingBox();
  const placesBox = await places.boundingBox();

  expect(boardBox).not.toBeNull();
  expect(placesBox).not.toBeNull();
  expect(boardBox.y).toBeLessThan(placesBox.y);
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
  // Announced, once, and shown once, by the banner.
  await expect(page.getByText("Offline mode", { exact: true })).toHaveCount(1);
  await expect(
    page.getByText(/saved places and the driver card still work/i)
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
  await context.route(/127\.0\.0\.1:4173/, () => {});

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

test("has no serious WCAG accessibility violations", async ({ page }) => {
  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  await openServiceUpdates(page);
  const alertDetails = page.getByText("Line 1 city-centre detour", { exact: true });
  if (await alertDetails.isVisible()) {
    await alertDetails.click();
    await expect(page.getByAltText("Temporary detour map")).toBeVisible();
  }

  const nextStops = page.getByRole("button", { name: "Next stops" }).first();
  if (await nextStops.isVisible()) {
    await nextStops.click();
    await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  }

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const recoveryMore = recovery.getByRole("button", { name: "Home options" });
  if (await recoveryMore.isVisible()) {
    await recoveryMore.click();
  }
  await recovery.getByRole("button", { name: "Show to driver" }).click();
  await expect(recovery.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

// At night the page was a white sheet on a dark bus, and only Ride Mode was
// dark. The theme now follows the phone's own setting; this holds it to the
// same contrast bar as the light one, with every panel open.
test("a phone in dark mode gets a dark page that is just as readable", async ({
  page,
}) => {
  const axe = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
  const rootBackground = () =>
    page.evaluate(
      () => globalThis.getComputedStyle(document.documentElement).backgroundColor
    );

  await page.emulateMedia({ colorScheme: "dark" });
  await routeTargetStop(page);
  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  // Without this a missing theme would pass as readable light pages.
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");

  await openServiceUpdates(page);
  const alertDetails = page.getByText("Line 1 city-centre detour", { exact: true });
  if (await alertDetails.isVisible()) {
    await alertDetails.click();
  }
  const nextStops = page.getByRole("button", { name: "Next stops" }).first();
  if (await nextStops.isVisible()) {
    await nextStops.click();
    await expect(page.getByText("Next stops · timetable times")).toBeVisible();
  }
  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const recoveryMore = recovery.getByRole("button", { name: "Home options" });
  if (await recoveryMore.isVisible()) {
    await recoveryMore.click();
  }
  await page
    .getByRole("button", { name: "Get-off alert" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Where do you want to get off?" })
  ).toBeVisible();

  expect((await axe()).violations).toEqual([]);

  // A first visit: search, the stops near you, and nothing chosen yet.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Find nearest stop" })).toBeVisible();
  expect((await axe()).violations).toEqual([]);

  // Paper stays white: a dark page printed without its backgrounds would
  // come out as pale text on a white sheet.
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
});

// An explicit passenger preference wins over the phone setting and survives
// a reload. This is the contract the visible Light/Dark control promises.
test("the theme switch overrides the phone theme and persists", async ({ page }) => {
  const rootBackground = () =>
    page.evaluate(
      () => globalThis.getComputedStyle(document.documentElement).backgroundColor
    );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#007985"
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await rootBackground()).toBe("rgb(237, 244, 245)");
  await expect(
    page.getByRole("button", { name: "Use dark theme" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await rootBackground()).toBe("rgb(12, 20, 22)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0c1416"
  );
});

test("landscape phone keeps onboarding actions in reach", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page
    .locator("footer")
    .getByRole("button", { name: "How to use" })
    .click();

  const fullGuide = page.getByRole("button", { name: "See full guide" });
  await expect(fullGuide).toBeInViewport();
  const box = await fullGuide.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await fullGuide.click();
  await expect(page.getByRole("button", { name: "Got it" })).toBeInViewport();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the footer guide starts simple and reveals the full guide on demand", async ({
  page,
}) => {
  await page.goto("/");

  const header = page.locator("header");
  await expect(
    header.getByRole("button", { name: "How to use" })
  ).toHaveCount(0);

  const guide = page
    .locator("footer")
    .getByRole("button", { name: "How to use" });
  await expect(guide).toBeVisible();
  await guide.click();

  const dialog = page.locator(
    '[role="dialog"][aria-labelledby="app-guide-title"]'
  );
  await expect(
    page.getByRole("dialog", { name: "Three things to know" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Find a stop" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Check the next bus" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Use Get-off Alert" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Watch for disruptions" })
  ).toHaveCount(0);

  const quickHeader = dialog.locator("header");
  const quickBackground = await quickHeader.evaluate(
    (element) => globalThis.getComputedStyle(element).backgroundImage
  );
  expect(quickBackground).toContain("turku-onboarding");
  expect(quickBackground).toContain("linear-gradient");

  const quickResults = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-labelledby="app-guide-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(quickResults.violations).toEqual([]);

  await dialog.getByRole("button", { name: "See full guide" }).click();

  await expect(
    page.getByRole("dialog", { name: "How to use Turku Departures" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Watch for disruptions" })
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Save familiar places" })
  ).toBeVisible();

  const fullBackground = await dialog.locator("header").evaluate(
    (element) => globalThis.getComputedStyle(element).backgroundImage
  );
  expect(fullBackground).toBe("none");

  const results = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-labelledby="app-guide-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(guide).toBeFocused();
});

// A Finnish phone got an English page, whatever else it had going for it:
// localization scored lowest of everything in the pre-release review.
test.describe("on a Finnish phone", () => {
  test.use({ locale: "fi-FI" });

  // Words that would only be on screen if something was left in English.
  // Names (stops, destinations, the brand, "In English" on the switch) are
  // taken out first; STOP in capitals is the button's own label in Finnish.
  const ENGLISH_WORDS =
    /\b(?:[Tt]he|[Aa]nd|[Yy]ou|[Yy]our|[Ss]tops?|[Dd]epartures?|[Ll]oading|[Rr]efresh|[Nn]ext|[Hh]ome|[Ll]ive|[Uu]pdates?|[Aa]lert|[Rr]ide|[Nn]ear|[Ss]how|[Ff]ind|[Ss]earch|[Ss]aved|[Pp]laces|[Ww]ork|[Ss]chool|[Ll]ate|[Ee]arly|[Ss]cheduled|[Tt]imetable|[Dd]river|[Bb]ackup)\b/g;
  const ALLOWED = ["Turku Departures", "Mykola Dotsenko", "In English", "Google Maps", "CC BY 4.0", "GitHub", "data.foli.fi"];

  async function englishLeftOnScreen(page) {
    let text = await page.locator("body").innerText();
    for (const allowed of ALLOWED) text = text.replaceAll(allowed, "");
    return [...new Set(text.match(ENGLISH_WORDS) || [])];
  }

  test("the app is in Finnish, readable, and can be switched to English for good", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name === "chromium-mobile") await atMorningCommute(page);
    await routeTargetStop(page);
    await page.goto("/?stop=164");
    await seedHome(page, { primaryStopId: "32" });

    await expect(page.locator("html")).toHaveAttribute("lang", "fi");
    await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Lähtee" })).toBeVisible();
    await expect(page.getByLabel("Etsi pysäkki")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Liikennetiedotteet" })).toBeVisible();

    // The README's Finnish picture, a phone's first screen.
    if (testInfo.project.name === "chromium-mobile") {
      fs.mkdirSync("artifacts/screenshots", { recursive: true });
      await page.screenshot({ path: "artifacts/screenshots/foli-mobile-fi.png" });
    }

    const nextStops = page.getByRole("button", { name: "Seuraavat pysäkit" }).first();
    await nextStops.click();
    await expect(page.getByText("Seuraavat pysäkit · aikataulun ajat")).toBeVisible();

    expect(await englishLeftOnScreen(page)).toEqual([]);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "In English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("columnheader", { name: "Due" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Suomeksi" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Due" })).toBeVisible();
  });

  test("a first visit is in Finnish too", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Lähelläsi" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Etsi lähin pysäkki" })).toBeVisible();
    expect(await englishLeftOnScreen(page)).toEqual([]);
  });
});

// At a busy stop a commuter waits for one line. Following it is kept for
// the stop, so tomorrow's glance shows the 7 without setting it again.
test("a commuter can follow one line at a stop, and it is still followed after a reload", async ({
  page,
}, testInfo) => {
  test.skip(!["chromium-mobile", "webkit-mobile"].includes(testInfo.project.name));

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  const board = page.locator('section[aria-labelledby="departures-title"]');
  await expect(board.getByText("Satama")).toBeVisible();

  await board.getByRole("button", { name: "Filter lines" }).click();
  await board
    .getByRole("group", { name: "Show only these lines" })
    .getByRole("button", { name: "Line 7" })
    .click();

  await expect(board.getByText("Runosmäki")).toBeVisible();
  await expect(board.getByText("Satama")).toHaveCount(0);
  await expect(board.getByRole("button", { name: "Only line 7" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.reload();
  await expect(board.getByRole("button", { name: "Only line 7" })).toBeVisible();
  await expect(board.getByText("Runosmäki")).toBeVisible();
  await expect(board.getByText("Satama")).toHaveCount(0);
});

test("mobile layout does not create horizontal page overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const recovery = page.locator(
    'section[aria-labelledby="home-recovery-title"]'
  );
  const moreHomeOptions = recovery.getByRole("button", { name: "Home options" });
  if (await moreHomeOptions.isVisible()) {
    await moreHomeOptions.click();
  }
  await recovery.getByText("Backup Home stop").click();
  await expect(
    recovery.getByRole("link", {
      name: "Route there: backup Home stop Puistokatu, stop 32, by public transit",
    })
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile first screen shows a real departure without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.goto("/?stop=164");
  await seedHome(page);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();

  const metrics = await firstDeparture.evaluate((row) => {
    const rect = row.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });

  expect(metrics.scrollY).toBe(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeLessThan(metrics.viewportHeight);
});

// Stacked, Get me Home, search and service updates pushed the first
// departure to 851px on a 1280x800 laptop, below the fold, with most of the
// width empty. On a wide screen they now share the top in two columns.
test("a laptop with Home saved shows a departure without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);
    await expect(page.getByRole("heading", { name: "Service updates" })).toBeVisible();

    const firstDeparture = page.locator("tbody tr").first();
    const { top, bottom } = await firstDeparture.evaluate((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    // Its line, destination and time, not just a sliver of the row.
    expect(top + 60).toBeLessThanOrEqual(viewport.height);
    expect(bottom).toBeGreaterThan(top);

    // Get me Home and search share the first row.
    const recovery = await page
      .locator('section[aria-labelledby="home-recovery-title"]')
      .boundingBox();
    const search = await page.locator(".search-panel").boundingBox();
    expect(Math.abs(recovery.y - search.y)).toBeLessThan(2);
    expect(search.x).toBeGreaterThan(recovery.x + recovery.width - 1);
  }
});

test("narrow 320 and 360px layouts keep core controls on-screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);
    await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(
      page.getByRole("combobox", { name: "Find your stop" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show departures" })
    ).toBeVisible();
  }
});

test("a browser that blocks site data still gets departures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  // What Chrome does with "Don't allow sites to save data": the read of
  // window.localStorage itself throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new globalThis.DOMException(
          "Access is denied for this document.",
          "SecurityError"
        );
      },
    });
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?stop=164");

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("each stop gets its own tab title, and the app says who makes it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.goto("/");
  const defaultTitle = await page.title();
  expect(defaultTitle).toContain("Turku Departures");

  await page.goto("/?stop=164");
  await expect(page).toHaveTitle("Kauppatori (164) · Turku Departures");

  const about = page.locator("details.about");
  await about.getByText("About & privacy").click();
  await expect(
    about.getByText(/independent project by Mykola Dotsenko/)
  ).toBeVisible();
  await expect(about.getByText("No account, no ads, no analytics.")).toBeVisible();

  await expect(page.locator(".brand")).toHaveText("Turku Departures");
  await expect(page.getByRole("link", { name: "Contact the maker by email" })).toHaveAttribute(
    "href",
    /^mailto:/
  );
  await expect(page.getByRole("link", { name: "Report a problem" })).toHaveAttribute(
    "href",
    /issues\/new\?template=bug_report\.yml/
  );
  await expect(page.getByRole("link", { name: "Source code" })).toHaveAttribute(
    "href",
    /github\.com\/MykolaDotsenko\/foli-live-departures/
  );

  // With no stop on screen the page goes back to its own title. (A bare
  // address would now reopen Kauppatori, the stop last looked at.)
  await page.goto("/?stop=not-a-stop");
  await expect(page).toHaveTitle(defaultTitle);
});

// The home-screen icon opens the bare address, which started a daily
// passenger on an empty search every time.
test("a returning passenger opens on the stop they last looked at", async ({ page }) => {
  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Find your stop" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
});

test("deep links survive reload and invalid stop links recover canonically", async ({ page }) => {
  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/stop=4/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.goto("/?stop=not-a-stop");
  await expect(page).not.toHaveURL(/stop=/);
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toHaveValue("");
  await expect(
    page.locator('section[aria-labelledby="departures-title"]')
  ).toHaveCount(0);
});

// The stop catalogue names the stop long before its departures arrive. The
// board used to count that name as an answer, so every slow load — and every
// failed one — told the passenger there were no departures.
test("a stop still loading says so instead of claiming there are no departures", async ({
  page,
}) => {
  await page.route("https://data.foli.fi/siri/sm/164", () => new Promise(() => {}));

  await page.goto("/?stop=164");

  await expect(
    page.getByRole("heading", { name: "Kauppatori", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Loading departures…")).toBeVisible();
  await expect(page.getByText("No upcoming departures.")).toHaveCount(0);
});

test("a stop whose departures fail to load says so and recovers on retry", async ({
  page,
}) => {
  let failing = true;
  await page.route("https://data.foli.fi/siri/sm/164", async (route) => {
    if (failing) {
      await route.fulfill({ status: 503, body: "{}" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(monitorPayload("164")),
    });
  });

  await page.goto("/?stop=164");

  await expect(page.getByText("Couldn’t load departures.")).toBeVisible();
  await expect(page.getByText("No upcoming departures.")).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Harbour")).toBeVisible();
  await expect(page.getByText("Couldn’t load departures.")).toHaveCount(0);
});

test("ten departures remain scan-friendly without horizontal table scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.route("https://data.foli.fi/siri/sm/164", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        stopname: "Kauppatori",
        servertime: now,
        result: Array.from({ length: 10 }, (_, index) => ({
          lineref: String(index + 1),
          destinationdisplay:
            index === 0
              ? "Very long destination name through the city centre"
              : `Destination ${index + 1}`,
          monitored: index % 2 === 0,
          delay: index % 2 === 0 ? index * 10 : null,
          recordedattime: now - 15,
          expecteddeparturetime: index % 2 === 0 ? now + 180 + index * 120 : null,
          aimeddeparturetime: now + 180 + index * 120,
        })),
      }),
    });
  });

  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);

  const tableMetrics = await page.locator("table").evaluate((table) => ({
    scrollWidth: table.scrollWidth,
    clientWidth: table.parentElement.clientWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(tableMetrics.scrollWidth - tableMetrics.clientWidth).toBeLessThanOrEqual(1);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  fs.mkdirSync("artifacts/screenshots", { recursive: true });
  await page
    .locator('[aria-labelledby="departures-title"]')
    .screenshot({
      path: `artifacts/screenshots/foli-${testInfo.project.name}-ten-departures.png`,
      animations: "disabled",
    });
});

test("a departure Föli has cancelled at this stop says so on the board", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: [],
        cancellations: [
          {
            id: 900,
            line: "1",
            cause: "TECHNICAL_PROBLEM",
            departure: now + 100,
            stops: [{ stop: "164", arrival: now + 205, isactive: true }],
          },
        ],
      }),
    });
  });

  await page.goto("/?stop=164");

  const lineOneRow = page.locator("tbody tr", { hasText: "Satama" });
  await expect(
    lineOneRow.getByRole("cell", { name: "Cancelled", exact: true })
  ).toBeVisible();
  await expect(lineOneRow.getByText(/Cancelled at this stop/)).toBeVisible();
  await expect(
    lineOneRow.getByRole("button", { name: "Get-off alert" })
  ).toHaveCount(0);
});

test("an opened disruption notice shows its whole message on a phone", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  const message =
    "Line 1 runs via Aurakatu because of roadworks. The Kauppatori stop " +
    "on Eerikinkatu is not served; board at the temporary stop on " +
    "Linnankatu instead, about 150 metres away.";

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: [
          {
            message_id: 700,
            isactive: true,
            priority: 1000,
            effect: "DETOUR",
            cause: "CONSTRUCTION",
            affected_stops: ["164"],
            affected_routes: [],
            header: "Line 1 temporary stop",
            message,
            repeat: [[now - 60, now + 3600]],
            images: [],
          },
        ],
        cancellations: [],
      }),
    });
  });

  await page.goto("/?stop=164");
  await openServiceUpdates(page);
  await page.getByText("Line 1 temporary stop", { exact: true }).click();

  // The notice is the only place a passenger learns where the moved stop
  // is. Cut to one line, it ended mid-sentence with no way to read on.
  const body = page.getByText(message);
  await expect(body).toBeVisible();
  const clipped = await body.evaluate(
    (element) => element.scrollHeight - element.clientHeight
  );
  expect(clipped).toBeLessThanOrEqual(1);
});

test("six simultaneous alerts stay compact and keep departures reachable", async ({
  page,
}, testInfo) => {
  test.skip(
    !["webkit-mobile", "chromium-mobile"].includes(testInfo.project.name)
  );

  await page.route("https://data.foli.fi/alerts", async (route) => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: now,
        global_message: {},
        emergency_message: {},
        messages: Array.from({ length: 6 }, (_, index) => ({
          message_id: 100 + index,
          isactive: true,
          priority: 1000 - index,
          effect: index === 0 ? "NO_SERVICE" : "DETOUR",
          cause: "CONSTRUCTION",
          affected_stops: ["164"],
          affected_routes: [],
          header: `Service update ${index + 1}`,
          message: `Important passenger information ${index + 1}.`,
          repeat: [[now - 60, now + 3600]],
          images: [],
        })),
        cancellations: [],
      }),
    });
  });

  await page.goto("/?stop=164");
  await expect(page.getByLabel("6 service updates")).toBeAttached();
  await openServiceUpdates(page);
  await expect(
    page.getByRole("button", { name: "Show 2 more updates" })
  ).toBeVisible();

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();
  const position = await firstDeparture.evaluate((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, viewportHeight: window.innerHeight };
  });
  expect(position.top).toBeLessThan(position.viewportHeight);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
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

test("200 percent text scaling keeps core mobile controls usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?stop=164");
  await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });

  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Find your stop" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show departures" })
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  for (const locator of [
    page.getByRole("combobox", { name: "Find your stop" }),
    page.getByRole("button", { name: "Show departures" }),
    page.getByRole("button", { name: "Refresh" }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
});

test("a frequent passenger still sees a departure on a 360px phone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "foli-saved-stops-v1",
      JSON.stringify({
        favorites: [
          { id: "164", name: "Kauppatori" },
          { id: "32", name: "Puistokatu" },
        ],
        recents: [],
      })
    );
  });
  await page.goto("/?stop=164");
  await seedHome(page);

  const shortcuts = page.getByRole("navigation", {
    name: "Saved and recent stops",
  });
  await expect(shortcuts.getByText("Puistokatu")).toBeVisible();
  await expect(shortcuts.getByText("Kauppatori")).toHaveCount(0);

  const firstDeparture = page.locator("tbody tr").first();
  await expect(firstDeparture).toBeVisible();
  const { top, viewportHeight } = await firstDeparture.evaluate((row) => ({
    top: row.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }));
  expect(top).toBeLessThan(viewportHeight);
});

test("the current favourite does not waste first-screen space", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "foli-saved-stops-v1",
      JSON.stringify({
        favorites: [{ id: "164", name: "Kauppatori" }],
        recents: [],
      })
    );
  });
  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Saved and recent stops" })
  ).toHaveCount(0);
});

test("mobile long stop identity wraps without horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?stop=164");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const stopName = page.locator("#departures-title");
  await stopName.evaluate((element) => {
    element.textContent =
      "Very long Turku city-centre interchange stop name";
  });

  const styles = await stopName.evaluate((element) => {
    const computed = globalThis.getComputedStyle(element);
    return {
      whiteSpace: computed.whiteSpace,
      overflowWrap: computed.overflowWrap,
    };
  });
  expect(styles.whiteSpace).toBe("normal");
  expect(["anywhere", "break-word"]).toContain(styles.overflowWrap);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the mobile guide keeps both actions distinct on a 320px screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
  await page
    .locator("footer")
    .getByRole("button", { name: "How to use" })
    .click();

  const gotIt = page.getByRole("button", { name: "Got it" });
  const fullGuide = page.getByRole("button", { name: "See full guide" });
  const a = await gotIt.boundingBox();
  const b = await fullGuide.boundingBox();

  expect(a).not.toBeNull();
  expect(b).not.toBeNull();

  const horizontalGap =
    Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const verticalGap =
    Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(7);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the mobile viewport opts into safe-area layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/
  );
});

test("stop search advertises the mobile search keyboard action", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Find your stop" });
  await expect(search).toHaveAttribute("inputmode", "search");
  await expect(search).toHaveAttribute("enterkeyhint", "search");
});

test("first-visit search row keeps location and Show inside the card", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const input = page.getByRole("combobox", { name: "Find your stop" });
    const locate = page.getByRole("button", { name: "Use current location" });
    const show = page.getByRole("button", { name: "Show departures" });

    await expect(input).toBeVisible();
    await expect(locate).toBeVisible();
    await expect(show).toBeVisible();

    const inputBox = await input.boundingBox();
    const locateBox = await locate.boundingBox();
    const showBox = await show.boundingBox();

    expect(inputBox).not.toBeNull();
    expect(locateBox).not.toBeNull();
    expect(showBox).not.toBeNull();

    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(locateBox.x);
    expect(locateBox.x + locateBox.width).toBeLessThanOrEqual(showBox.x);
    expect(showBox.x + showBox.width).toBeLessThanOrEqual(viewport.width + 1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("mobile viewport matrix keeps core journey controls inside the screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?stop=164");
    await seedHome(page);

    const controls = [
      page.getByRole("combobox", { name: "Find your stop" }),
      page.getByRole("button", { name: "Show departures" }),
      page.getByRole("button", { name: "Refresh", exact: true }),
      page.getByRole("button", { name: "Save Kauppatori to favourites" }),
      page.getByRole("button", { name: "Filter lines" }),
      page.getByRole("button", { name: "Get-off alert" }).first(),
    ];

    for (const locator of controls) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("stop suggestions stay reachable when a mobile keyboard shrinks the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?stop=164");

  const search = page.getByRole("combobox", { name: "Find your stop" });
  await search.fill("Tur");
  const option = page.getByRole("option", { name: /Turun linna/i });
  await expect(option).toBeVisible();

  // Approximate the dynamic viewport contraction produced by a software
  // keyboard without depending on a particular mobile OS keyboard.
  await page.setViewportSize({ width: 390, height: 500 });

  const listbox = page.getByRole("listbox");
  const box = await listbox.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(500);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("320px dark mode with 200 percent text still reflows without horizontal scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?stop=164");
  await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  const overflowState = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className:
            typeof element.className === "string" ? element.className : "",
          text: (element.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > window.innerWidth + 1)
      )
      .slice(0, 20);
    return { overflow, offenders };
  });
  expect(
    overflowState.overflow,
    JSON.stringify(overflowState.offenders, null, 2)
  ).toBeLessThanOrEqual(1);

  for (const locator of [
    page.getByRole("combobox", { name: "Find your stop" }),
    page.getByRole("button", { name: "Show departures" }),
    page.getByRole("button", { name: "Refresh", exact: true }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
  }
});

test("closing the guide restores focus to the footer trigger", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.goto("/");
  const trigger = page
    .locator("footer")
    .getByRole("button", { name: "How to use" });
  await trigger.focus();
  await trigger.click();

  await expect(page.getByRole("dialog", { name: "Three things to know" })).toBeVisible();
  await page.getByRole("button", { name: "Close guide" }).click();

  await expect(
    page.getByRole("dialog", { name: "Three things to know" })
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

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
      ? "foli-mobile-ios.png"
      : testInfo.project.name === "chromium-mobile"
        ? "foli-mobile-android.png"
        : "foli-desktop.png";

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
