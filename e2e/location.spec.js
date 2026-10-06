// Location: one-time geolocation for the search field, the nearest stop and the stops near you.
import { gtfsClockAt } from "./support/clock.js";
import { expect, test } from "./support/test.js";

test("bare URL keeps one-tap location beside search and only fills the field", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
  });

  await page.goto("/");

  const input = page.getByRole("combobox", { name: "Find your stop" });
  const locate = page.getByRole("button", { name: "Use my location", exact: true });
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
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
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
  await expect(page.getByText("Nearest", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Kauppatori is .+ away$/)).toBeVisible();

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
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
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
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
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

// A slow phone location fix, answered at Kauppatori three seconds after the
// tap, so the passenger has time to do something else while it is pending.
async function slowGeolocation(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          globalThis.setTimeout(
            () =>
              success({
                coords: {
                  latitude: 60.45182,
                  longitude: 22.26662,
                  accuracy: 10,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                },
                timestamp: Date.now(),
              }),
            3000
          );
        },
        watchPosition() {
          return 0;
        },
        clearWatch() {},
      },
    });
  });
}

// The fix used to land after the passenger had searched for another stop and
// jump the board to the nearest one, pushing a history entry on the way.
test("a late location fix leaves a stop searched for meanwhile on the board", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await slowGeolocation(page);

  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.getByRole("button", { name: "Find nearest stop" }).click();
  await page.getByRole("combobox", { name: "Find your stop" }).fill("32");
  await page.getByRole("button", { name: "Show departures" }).click();
  await expect(page).toHaveURL(/stop=32/);
  await expect(page.getByRole("heading", { name: "Puistokatu" })).toBeVisible();

  // The fix has arrived once the nearby list is up; the board is unmoved.
  await expect(page.getByText("Nearest")).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/stop=32/);
  await expect(page.getByRole("heading", { name: "Puistokatu" })).toBeVisible();
});

// The same late fix used to replace the words being typed in the search
// field with the nearest stop's name.
test("a late location fix does not overwrite the search being typed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await slowGeolocation(page);

  await page.goto("/");
  const input = page.getByRole("combobox", { name: "Find your stop" });
  const locate = page.getByRole("button", { name: "Use my location", exact: true });
  await locate.click();
  await expect(locate).toHaveAttribute("aria-busy", "true");
  await input.fill("Puistokatu");

  // The lookup has finished once the button is usable again.
  await expect(locate).toBeEnabled({ timeout: 10_000 });
  await expect(input).toHaveValue("Puistokatu");
  await expect(page).not.toHaveURL(/stop=/);
});

// The "Near you" fix, released by hand once the passenger is typing.
async function heldGeolocation(page) {
  await page.addInitScript(() => {
    let pending = null;
    globalThis.__releaseFix = (latitude, longitude) => {
      const success = pending;
      pending = null;
      success?.({
        coords: {
          latitude,
          longitude,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      return Boolean(success);
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          pending = success;
        },
        watchPosition() {
          return 0;
        },
        clearWatch() {},
      },
    });
  });
}

// Typing a search is choosing a stop too, only not yet finished. A late
// "Near you" fix jumped the board to the nearest stop, and the search field,
// following the board, put that stop's name over the half-typed one.
test("a late near-you fix leaves a half-typed search and its board alone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await heldGeolocation(page);

  await page.goto("/?stop=4");
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();

  await page.getByRole("button", { name: "Find nearest stop" }).click();
  const input = page.getByRole("combobox", { name: "Find your stop" });
  await input.fill("Puisto");
  expect(
    await page.evaluate(() => globalThis.__releaseFix(60.45182, 22.26662))
  ).toBe(true);

  // The fix has landed once the nearby list is up; nothing else moved.
  await expect(page.getByText("Nearest", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("Puisto");
  await expect(page).toHaveURL(/[?&]stop=4(&|$)/);
  await expect(page.getByRole("heading", { name: "Turun linna" })).toBeVisible();
});


test("stop radar gives live distance guidance without silently switching the board", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");

  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
  });
  await context.setGeolocation({
    latitude: 60.45182,
    longitude: 22.26662,
    accuracy: 12,
  });

  await page.goto("/?stop=32");
  await expect(page.getByRole("heading", { name: "Puistokatu" })).toBeVisible();

  await page.getByRole("button", { name: "Open stop radar" }).click();

  await expect(page.getByRole("heading", { name: "Stop radar" })).toBeVisible();
  await expect(page.getByText("North-up", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Live location runs only while this radar is open/i)
  ).toBeVisible();
  await expect(page).toHaveURL(/[?&]stop=32(&|$)/);

  const targetChooser = page.getByRole("group", {
    name: "Choose radar target",
  });
  await targetChooser.getByRole("button", { name: /Kauppatori/ }).click();

  const targetCard = page
    .getByText("Target stop", { exact: true })
    .locator("..");
  await expect(targetCard.getByText("<10 m", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/[?&]stop=32(&|$)/);
  await expect(page.getByRole("heading", { name: "Puistokatu" })).toBeVisible();

  await page.getByRole("button", { name: "Open target stop" }).click();

  await expect(page).toHaveURL(/[?&]stop=164(&|$)/);
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stop radar" })).toHaveCount(0);
});

test("with location refused, a destination is answered from a stop chosen by name", async ({
  page,
}) => {
  // The browser says no, as it does for a passenger who refused location.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success, failure) =>
          failure({ code: 1, message: "User denied Geolocation" }),
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto("/");

  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  await journey
    .getByRole("combobox", { name: "Stop, address or place" })
    .fill("Puistokatu");
  await journey.getByRole("option", { name: /Puistokatu.*Stop 32/ }).click();

  const nearby = page.locator(
    'section[aria-labelledby="nearby-stops-title"]'
  );
  await nearby
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(nearby.getByText(/Location access is blocked/)).toBeVisible();

  // Before, that error was where a destination without location ended.
  await nearby.getByRole("button", { name: "Choose a starting stop" }).click();
  const search = page.getByRole("combobox", { name: "Find your stop" });
  await expect(search).toBeFocused();
  await search.fill("Kauppatori");
  await page
    .getByRole("listbox", { name: "Matching bus stops" })
    .getByRole("option", { name: /Kauppatori/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Kauppatori" })).toBeVisible();

  // Line 1 stops at Puistokatu five minutes after it leaves here
  // (support/foli.js): the board names the bus, the stop and the time.
  const bus = page.getByText(/^To Puistokatu: line 1 at \d\d:\d\d$/);
  const exit = page.getByText(
    /^Get off at Puistokatu · arrive about \d\d:\d\d$/
  );
  await expect(bus).toBeVisible();
  await expect(exit).toBeVisible();
  const minutes = (text) => {
    const [hours, mins] = text.slice(-5).split(":").map(Number);
    return hours * 60 + mins;
  };
  expect(
    (minutes(await exit.innerText()) - minutes(await bus.innerText()) + 1440) %
      1440
  ).toBe(5);

  // The get-off alert for that bus already has Puistokatu chosen.
  await page
    .getByRole("row", { name: /Satama/ })
    .getByRole("button", { name: "Get-off alert" })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Choose your exit stop" })
      .getByRole("radio", { name: /^Puistokatu/ })
  ).toBeChecked();
});

// One bus there was all a passenger was offered, labelled "Fastest" among
// one. The bus after it is now the choice for missing it, and each card
// says where to get off and for how long.
test("journey options offer the next bus too, and where to get off", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  // Line 7 leaves the market square nine minutes on (support/foli.js) and,
  // here, stops at Puistokatu seven minutes later.
  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stop_times/trip/trip-164-7",
    async (route) => {
      const at = gtfsClockAt(Math.floor(Date.now() / 1000) + 540);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          [
            ["164", 0],
            ["32", 420],
          ].map(([stopId, offset], index) => ({
            stop_id: stopId,
            arrival_time: at(offset),
            departure_time: at(offset),
            stop_sequence: index + 1,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
          }))
        ),
      });
    }
  );
  await context.grantPermissions(["geolocation"], {
    origin: new globalThis.URL(baseURL).origin,
  });
  await context.setGeolocation({ latitude: 60.45182, longitude: 22.26662 });

  await page.goto("/");
  const journey = page.locator('section[aria-labelledby="journey-search-title"]');
  await journey
    .getByRole("combobox", { name: "Stop, address or place" })
    .fill("Puistokatu");
  await journey.getByRole("option", { name: /Puistokatu.*Stop 32/ }).click();
  await page
    .locator('section[aria-labelledby="nearby-stops-title"]')
    .getByRole("button", { name: "Use my location", exact: true })
    .click();

  const options = page.getByRole("region", { name: "Best ways to Puistokatu" });
  const cards = options.getByRole("button");
  await expect(cards).toHaveCount(2);
  await expect(options.getByText("2 options")).toBeVisible();

  await expect(cards.nth(0)).toContainText("Fastest");
  await expect(cards.nth(0)).toContainText("Line 1 → Satama");
  await expect(cards.nth(0)).toContainText(
    "Get off at Puistokatu · about 5 min on the bus"
  );
  await expect(cards.nth(1)).toContainText("Next bus");
  await expect(cards.nth(1)).toContainText("Line 7 → Runosmäki");
  await expect(cards.nth(1)).toContainText(
    "If you miss the first one · about 7 min later"
  );
});
