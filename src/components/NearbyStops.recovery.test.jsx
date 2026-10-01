import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";

const nearbyHook = vi.hoisted(() => ({
  useDestinationAwareNearby: vi.fn(),
}));

vi.mock("../hooks/useDestinationAwareNearby", () => ({
  default: nearbyHook.useDestinationAwareNearby,
}));

import NearbyStops from "./NearbyStops";

const now = Math.floor(Date.now() / 1000);

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const failedDeparture = {
  tripRef: "failed-trip",
  lineRef: "18",
  destinationStopId: "900",
  departureAt: now + 240,
  aimedDepartureAt: now + 220,
  destinationArrivalAt: now + 1_200,
  catchability: "tight",
  liveState: "live",
  rideDurationSec: 960,
};

const safeDeparture = {
  tripRef: "safe-trip",
  lineRef: "2",
  destinationStopId: "900",
  departureAt: now + 540,
  aimedDepartureAt: now + 520,
  destinationArrivalAt: now + 1_440,
  catchability: "comfortable",
  liveState: "live",
  rideDurationSec: 900,
};

const excludedJourney = {
  id: "failed-option",
  destinationId: "stop:900",
  destinationKind: "public-stop",
  destinationLabel: "Home stop",
  optionLabel: "fastest",
  stopId: "100",
  stopName: "Platform A",
  distanceMeters: 90,
  tripRef: "failed-trip",
  lineRef: "18",
  destinationStopId: "900",
  departureAt: failedDeparture.departureAt,
  aimedDepartureAt: failedDeparture.aimedDepartureAt,
  destinationArrivalAt: failedDeparture.destinationArrivalAt,
  liveState: "live",
  phase: "recovery",
  recoveryReason: "cancelled",
  selectedAt: Date.now() - 60_000,
  atStopConfirmedAt: null,
  lastSeenAt: Date.now() - 10_000,
};

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

beforeEach(() => {
  resetLanguageForTests("en");
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": {
        stopId: "100",
        status: "tight",
        best: failedDeparture,
        departures: [failedDeparture],
        additionalCount: 0,
        checkedAt: Date.now(),
      },
      "200": {
        stopId: "200",
        status: "good",
        best: safeDeparture,
        departures: [safeDeparture],
        additionalCount: 0,
        checkedAt: Date.now(),
      },
    },
  });

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 60.4518,
            longitude: 22.2666,
            accuracy: 15,
          },
        })
      ),
    },
  });
});

afterEach(() => {
  resetLanguageForTests("en");
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("recovery cards exclude the failed concrete trip but keep the full nearby list", async () => {
  render(
    <NearbyStops
      stops={[
        { id: "100", name: "Platform A", lat: 60.4519, lon: 22.2666 },
        { id: "200", name: "Platform B", lat: 60.4524, lon: 22.2666 },
      ]}
      coordinatesStatus="ready"
      activeStopId="100"
      destination={destination}
      excludedJourney={excludedJourney}
      onSelectJourney={() => {}}
      onSelect={() => {}}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  const routeRegion = await screen.findByRole("region", {
    name: "Best ways to Home stop",
  });
  const routeButtons = within(routeRegion).getAllByRole("button");

  expect(routeButtons).toHaveLength(1);
  expect(routeButtons[0]).toHaveTextContent("Line 2");
  expect(routeButtons[0]).not.toHaveTextContent("Line 18");

  const nearbyGroup = screen.getByRole("group", {
    name: "Nearby Föli stops for Home stop",
  });
  const nearbyButtons = within(nearbyGroup).getAllByRole("button");
  expect(nearbyButtons).toHaveLength(2);
  expect(nearbyButtons.some((button) => button.textContent.includes("Line 18"))).toBe(true);
  expect(nearbyButtons.some((button) => button.textContent.includes("Line 2"))).toBe(true);
});
