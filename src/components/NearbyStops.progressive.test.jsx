import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const nearbyHook = vi.hoisted(() => ({
  useDestinationAwareNearby: vi.fn(),
}));

vi.mock("../hooks/useDestinationAwareNearby", () => ({
  default: nearbyHook.useDestinationAwareNearby,
}));

import { resetLanguageForTests } from "../i18n";
import NearbyStops from "./NearbyStops";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const stops = Array.from({ length: 8 }, (_, index) => ({
  id: String((index + 1) * 100),
  name: `Candidate ${index + 1}`,
  lat: 60.4518 + index * 0.00035,
  lon: 22.2666,
}));

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

beforeEach(() => {
  resetLanguageForTests("en");
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

test("expands beyond the first six stops when no usable option exists there", async () => {
  const now = Math.floor(Date.now() / 1000);

  nearbyHook.useDestinationAwareNearby.mockImplementation(({ stops: candidates }) => {
    const fitsByStop = Object.fromEntries(
      candidates.map((stop) => [
        stop.id,
        {
          stopId: stop.id,
          status: "no-direct",
          best: null,
          departures: [],
          additionalCount: 0,
          checkedAt: Date.now(),
        },
      ])
    );

    if (candidates.length > 6) {
      fitsByStop["700"] = {
        stopId: "700",
        status: "good",
        best: {
          tripRef: "trip-700",
          lineRef: "18",
          destinationStopId: "900",
          departureAt: now + 600,
          destinationArrivalAt: now + 1_800,
          catchability: "comfortable",
          liveState: "live",
          rideDurationSec: 1_200,
        },
        departures: [
          {
            tripRef: "trip-700",
            lineRef: "18",
            destinationStopId: "900",
            departureAt: now + 600,
            destinationArrivalAt: now + 1_800,
            catchability: "comfortable",
            liveState: "live",
            rideDurationSec: 1_200,
          },
        ],
        additionalCount: 0,
        checkedAt: Date.now(),
      };
    }

    return {
      state: "ready",
      fitsByStop,
    };
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

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  await waitFor(() =>
    expect(
      screen.getByText("Checked 8 nearby stops")
    ).toBeInTheDocument()
  );

  const group = screen.getByRole("group", {
    name: "Nearby Föli stops for Home stop",
  });

  const stopButtons = within(group).getAllByRole("button");
  expect(stopButtons).toHaveLength(8);
  expect(stopButtons[0]).toHaveAccessibleName(/Candidate 7, stop 700/i);
  expect(screen.getByText("Best ways to Home stop")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Nearest" }));

  const nearestButtons = within(group).getAllByRole("button");
  expect(nearestButtons).toHaveLength(8);
  expect(nearestButtons[0]).toHaveAccessibleName(/Candidate 1, stop 100/i);
});

test("does not expand when the first six already contain two meaningful options", async () => {
  const now = Math.floor(Date.now() / 1000);

  nearbyHook.useDestinationAwareNearby.mockImplementation(({ stops: candidates }) => {
    const fitsByStop = Object.fromEntries(
      candidates.map((stop, index) => [
        stop.id,
        index === 1
          ? {
              stopId: stop.id,
              status: "tight",
              best: {
                tripRef: "trip-fast",
                lineRef: "2",
                destinationStopId: "900",
                departureAt: now + 260,
                destinationArrivalAt: now + 1_400,
                catchability: "tight",
                liveState: "live",
                rideDurationSec: 1_140,
              },
              departures: [
                {
                  tripRef: "trip-fast",
                  lineRef: "2",
                  destinationStopId: "900",
                  departureAt: now + 260,
                  destinationArrivalAt: now + 1_400,
                  catchability: "tight",
                  liveState: "live",
                  rideDurationSec: 1_140,
                },
              ],
              additionalCount: 0,
              checkedAt: Date.now(),
            }
          : index === 0
            ? {
                stopId: stop.id,
                status: "good",
                best: {
                  tripRef: "trip-safe",
                  lineRef: "18",
                  destinationStopId: "900",
                  departureAt: now + 600,
                  destinationArrivalAt: now + 1_650,
                  catchability: "comfortable",
                  liveState: "live",
                  rideDurationSec: 1_050,
                },
                departures: [
                  {
                    tripRef: "trip-safe",
                    lineRef: "18",
                    destinationStopId: "900",
                    departureAt: now + 600,
                    destinationArrivalAt: now + 1_650,
                    catchability: "comfortable",
                    liveState: "live",
                    rideDurationSec: 1_050,
                  },
                ],
                additionalCount: 0,
                checkedAt: Date.now(),
              }
            : {
                stopId: stop.id,
                status: "no-direct",
                best: null,
                departures: [],
                additionalCount: 0,
                checkedAt: Date.now(),
              },
      ])
    );

    return { state: "ready", fitsByStop };
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

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  const group = await screen.findByRole("group", {
    name: "Nearby Föli stops for Home stop",
  });

  await waitFor(() =>
    expect(within(group).getAllByRole("button")).toHaveLength(6)
  );

  expect(
    screen.queryByText(/Checked .* nearby stops/)
  ).not.toBeInTheDocument();
});
