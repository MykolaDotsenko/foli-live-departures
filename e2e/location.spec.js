// Location: one-time geolocation for the search field, the nearest stop and the stops near you.
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
