// Ride Mode set-up: a bus arriving at the exit stop, and the taps that start a ride.
import { expect } from "@playwright/test";

export function rideArrival(now, overrides = {}) {
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

export async function routeTargetStop(page, overrides = {}) {
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
export async function turnOffNotifications(page) {
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

export async function startRide(page, { gps }) {
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
