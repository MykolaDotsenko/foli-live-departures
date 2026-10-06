import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  useDestinationAwareNearby: vi.fn(),
  useTransferJourneyOptions: vi.fn(),
}));

vi.mock("../hooks/useDestinationAwareNearby", () => ({
  default: hooks.useDestinationAwareNearby,
}));
vi.mock("../hooks/useTransferJourneyOptions", () => ({
  default: hooks.useTransferJourneyOptions,
}));

import { resetLanguageForTests } from "../i18n";
import NearbyStops from "./NearbyStops";

const stops = [
  { id: "100", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "900", name: "Puistokatu", lat: 60.4462, lon: 22.2611 },
];

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Puistokatu",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

beforeEach(() => {
  resetLanguageForTests("en");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: { latitude: 60.4518, longitude: 22.2666, accuracy: 15 },
        })
      ),
    },
  });
});

afterEach(() => {
  resetLanguageForTests("en");
  vi.restoreAllMocks();
  hooks.useTransferJourneyOptions.mockReset();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

/** The only direct bus: line 1, leaving in ten minutes. */
function onlyOneDirectBus(now) {
  hooks.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": {
        status: "good",
        best: null,
        departures: [
          {
            tripRef: "trip-1",
            lineRef: "1",
            headsign: "Satama",
            destinationStopId: "900",
            departureAt: now + 600,
            destinationArrivalAt: now + 1_800,
            catchability: "comfortable",
            liveState: "live",
            rideDurationSec: 1_200,
          },
        ],
      },
    },
  });
}

function changeOfBus(id, leavesAt, arrivesAt) {
  return {
    id,
    legs: [
      { lineRef: "7", departureAt: leavesAt },
      { lineRef: "18", departureAt: leavesAt + 600 },
    ],
    transfers: [
      {
        alightStopId: "500",
        boardStopId: "500",
        boardStopName: "Aurakatu",
        feasibility: { state: "comfortable", slackSec: 300 },
      },
    ],
    journeyArrivalAt: arrivesAt,
    originDistanceMeters: 40,
    totalWalkingDistanceM: 40,
    reliability: "high",
  };
}

test("with one direct bus, a change of bus is offered too, but not one worse in every way", async () => {
  const now = Math.floor(Date.now() / 1000);
  onlyOneDirectBus(now);
  hooks.useTransferJourneyOptions.mockReturnValue({
    state: "ready",
    options: [
      // Leaves before the direct bus and gets there after it: no choice.
      changeOfBus("worse", now + 300, now + 2_400),
      // Leaves after it: the way on for whoever misses line 1.
      changeOfBus("later", now + 900, now + 2_700),
    ],
  });

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
      onSelectJourney={() => {}}
      onSelectTransferJourney={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my location" }));

  const direct = await screen.findByRole("region", {
    name: "Best ways to Puistokatu",
  });
  expect(within(direct).getAllByRole("button")).toHaveLength(1);
  expect(
    within(direct).getByText("The only bus there we found")
  ).toBeInTheDocument();

  // Before, a change of bus was searched only when no direct bus was found.
  expect(hooks.useTransferJourneyOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true })
  );
  const changes = screen.getByRole("region", {
    name: "Ways to Puistokatu with one change",
  });
  const cards = within(changes).getAllByRole("button");
  expect(cards).toHaveLength(1);
  expect(cards[0]).toHaveAccessibleName(/Line 7 → Line 18/);
});

test("says it is still looking for a change of bus beside the direct one", async () => {
  const now = Math.floor(Date.now() / 1000);
  onlyOneDirectBus(now);
  hooks.useTransferJourneyOptions.mockReturnValue({
    state: "loading",
    options: [],
  });

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
      onSelectJourney={() => {}}
      onSelectTransferJourney={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my location" }));

  // "No direct trip found nearby" stood under the direct trip it had found.
  expect(
    await screen.findByText("Also checking options with a change of bus…")
  ).toBeInTheDocument();
  expect(screen.queryByText(/No direct trip found/)).not.toBeInTheDocument();
});

test("a failed search for a change of bus is no news beside the direct bus", async () => {
  const now = Math.floor(Date.now() / 1000);
  onlyOneDirectBus(now);
  hooks.useTransferJourneyOptions.mockReturnValue({
    state: "error",
    options: [],
  });

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      destination={destination}
      onSelect={() => {}}
      onSelectJourney={() => {}}
      onSelectTransferJourney={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my location" }));

  await screen.findByRole("region", { name: "Best ways to Puistokatu" });
  expect(
    screen.queryByText(/Transfer search is temporarily unavailable/)
  ).not.toBeInTheDocument();
});
