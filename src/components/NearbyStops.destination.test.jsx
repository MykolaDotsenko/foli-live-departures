import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const nearbyHook = vi.hoisted(() => ({
  useDestinationAwareNearby: vi.fn(),
}));

vi.mock("../hooks/useDestinationAwareNearby", () => ({
  default: nearbyHook.useDestinationAwareNearby,
}));

import NearbyStops from "./NearbyStops";

const stops = [
  { id: "100", name: "Closer wrong side", lat: 60.45182, lon: 22.2666 },
  { id: "200", name: "Farther useful", lat: 60.4530, lon: 22.2666 },
  { id: "300", name: "Third option", lat: 60.4540, lon: 22.2666 },
];

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("keeps every nearby stop but ranks a farther useful stop above a nearer wrong-direction stop", async () => {
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": {
        status: "other-direction",
        best: null,
      },
      "200": {
        status: "good",
        best: {
          lineRef: "18",
          departureAt: Math.floor(Date.now() / 1000) + 600,
          destinationArrivalAt: Math.floor(Date.now() / 1000) + 1_800,
        },
      },
      "300": {
        status: "no-direct",
        best: null,
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
            accuracy: 20,
          },
        })
      ),
    },
  });

  const onSelect = vi.fn();
  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={onSelect}
    />
  );

  // Nothing to choose from yet: the passenger is told what the button does.
  expect(
    screen.getByText("Uses your location once. It isn’t saved.")
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Choose the best fit or switch back to pure distance.")
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  const group = await screen.findByRole("group", {
    name: "Nearby Föli stops for Home stop",
  });
  expect(
    screen.getByText("Choose the best fit or switch back to pure distance.")
  ).toBeInTheDocument();

  await waitFor(() => {
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName(/Farther useful, stop 200/i);
    expect(buttons[1]).toHaveAccessibleName(/Closer wrong side, stop 100/i);
  });

  expect(screen.getByText("Best")).toBeInTheDocument();
  expect(screen.getByText("Current buses go the other direction")).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Nearest" }));

  const nearestOrder = within(group).getAllByRole("button");
  expect(nearestOrder[0]).toHaveAccessibleName(/Closer wrong side, stop 100/i);
  expect(nearestOrder).toHaveLength(3);
});
