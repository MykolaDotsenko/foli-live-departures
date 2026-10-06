import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const radarProbe = vi.hoisted(() => ({ props: null }));
const nearbyHook = vi.hoisted(() => ({
  useDestinationAwareNearby: vi.fn(),
}));

vi.mock("../hooks/useDestinationAwareNearby", () => ({
  default: nearbyHook.useDestinationAwareNearby,
}));

vi.mock("../utils/stopRadar", async (importOriginal) => ({
  ...(await importOriginal()),
  requestCompassPermission: vi.fn().mockResolvedValue("unavailable"),
}));

vi.mock("./StopRadar", () => ({
  default: (props) => {
    radarProbe.props = props;
    return <div data-testid="radar-probe" />;
  },
}));

import NearbyStops from "./NearbyStops";

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

afterEach(() => {
  radarProbe.props = null;
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("an explicit stop origin remains the Radar target even when another stop ranks best", async () => {
  nearbyHook.useDestinationAwareNearby.mockReturnValue({
    state: "ready",
    fitsByStop: {
      "100": { status: "good", best: null },
      "200": {
        status: "good",
        best: {
          lineRef: "18",
          departureAt: Math.floor(Date.now() / 1000) + 300,
          destinationArrivalAt: Math.floor(Date.now() / 1000) + 1200,
        },
      },
    },
  });

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
    },
  });

  render(
    <NearbyStops
      stops={[
        { id: "100", name: "Chosen origin", lat: 60.4518, lon: 22.2666 },
        { id: "200", name: "Ranked alternative", lat: 60.4524, lon: 22.2670 },
      ]}
      coordinatesStatus="ready"
      activeStopId="100"
      destination={{
        id: "stop:900",
        kind: "public-stop",
        label: "Destination",
        primaryStopId: "900",
        acceptableStopIds: ["900"],
      }}
      onSelect={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Open stop radar" }));

  await screen.findByTestId("radar-probe");
  await waitFor(() => expect(radarProbe.props).not.toBeNull());

  expect(radarProbe.props.initialTargetStopId).toBe("100");
  expect(radarProbe.props.recommendedTargetStopId).toBe("100");
  expect(radarProbe.props.activeStopId).toBe("100");
});
