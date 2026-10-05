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
    screen.queryByText("Tap a stop to see when its buses leave.")
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  const group = await screen.findByRole("group", {
    name: "Nearby Föli stops for Home stop",
  });
  expect(
    screen.getByText("Tap a stop to see when its buses leave.")
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

// "Route suitability is uncertain" said neither what was unknown nor what to
// do about it.
test("says which part of an uncertain stop is unknown", async () => {
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": { status: "uncertain", best: null },
      "200": {
        status: "uncertain",
        best: {
          lineRef: "18",
          departureAt: Math.floor(Date.now() / 1000) + 600,
          destinationArrivalAt: Math.floor(Date.now() / 1000) + 1_800,
        },
      },
      "300": { status: "no-direct", best: null },
    },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 20 },
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
  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));

  expect(
    await screen.findByText("Couldn’t check where these buses go")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Can’t tell if you’ll make it in time")
  ).toBeInTheDocument();
  expect(screen.queryByText(/suitability/i)).not.toBeInTheDocument();
});

// "You're near" on the chosen journey needs to know how good the fix was:
// the option carries the accuracy its distance was measured with, and the
// radar keeps saying what it is for once the results are in.
test("a chosen option carries the accuracy of the fix it was measured from", async () => {
  const now = Math.floor(Date.now() / 1000);
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": {
        status: "good",
        best: null,
        departures: [
          {
            tripRef: "trip-1",
            lineRef: "18",
            destinationStopId: "900",
            departureAt: now + 600,
            destinationArrivalAt: now + 1_800,
            catchability: "comfortable",
            liveState: "live",
          },
        ],
      },
    },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 20 },
        })
      ),
    },
  });
  const onSelectJourney = vi.fn();

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
      onSelectJourney={onSelectJourney}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));

  const options = await screen.findByRole("region", {
    name: "Best ways to Home stop",
  });
  fireEvent.click(within(options).getAllByRole("button")[0]);
  expect(onSelectJourney).toHaveBeenCalledWith(
    expect.objectContaining({ stopId: "100", positionAccuracyM: 20 })
  );

  expect(
    screen.getByRole("button", { name: "Open stop radar" })
  ).toHaveAccessibleDescription("The radar shows the way to a stop as you walk.");
});

test("with location refused, a destination still has a way to say where the journey starts", async () => {
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "idle",
    fitsByStop: {},
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_success, failure) => failure({ code: 1 })),
    },
  });

  render(
    <>
      {/* The page's own stop search, where the button sends the passenger. */}
      <input id="stop-search" aria-label="Find your stop" />
      <NearbyStops
        stops={stops}
        coordinatesStatus="ready"
        activeStopId=""
        destination={destination}
        onSelect={vi.fn()}
      />
    </>
  );

  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));
  expect(
    await screen.findByText(/Location access is blocked/)
  ).toBeInTheDocument();

  // Before, the error was all there was: a destination with location off
  // led nowhere.
  fireEvent.click(
    screen.getByRole("button", { name: "Choose a stop by name" })
  );
  expect(screen.getByRole("textbox", { name: "Find your stop" })).toHaveFocus();
});

test("offers the stop search only while there is no stop to start from", () => {
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "idle",
    fitsByStop: {},
  });

  const { rerender } = render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      onSelect={vi.fn()}
    />
  );
  // Without a destination the stop search needs no pointer: it is what the
  // page leads with.
  expect(
    screen.queryByRole("button", { name: "Choose a stop by name" })
  ).not.toBeInTheDocument();

  // With a board open, the journey starts from that stop and its board
  // answers for the destination.
  rerender(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="100"
      destination={destination}
      onSelect={vi.fn()}
    />
  );
  expect(
    screen.queryByRole("button", { name: "Choose a stop by name" })
  ).not.toBeInTheDocument();
});
