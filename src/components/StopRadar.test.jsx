import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StopRadar from "./StopRadar";

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
  { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
];

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

function installLiveLocation() {
  let deliver;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 44;
      }),
      clearWatch,
    },
  });
  return {
    deliver(fix = {}) {
      act(() =>
        deliver({
          coords: {
            latitude: 60.45182,
            longitude: 22.26662,
            accuracy: 12,
            heading: null,
            speed: null,
            ...fix,
          },
          timestamp: Date.now(),
        })
      );
    },
    clearWatch,
  };
}

test("locks the initial target and changing radar target does not open a stop", async () => {
  const live = installLiveLocation();
  const onOpenStop = vi.fn();
  const onPosition = vi.fn();

  render(
    <StopRadar
      stops={stops}
      initialTargetStopId="32"
      recommendedTargetStopId="164"
      activeStopId="32"
      compassPermission="unavailable"
      onPosition={onPosition}
      onOpenStop={onOpenStop}
      onClose={vi.fn()}
    />
  );

  live.deliver();

  expect((await screen.findAllByText("Puistokatu")).length).toBeGreaterThan(0);
  expect(screen.getByText("North-up")).toBeInTheDocument();
  expect(onPosition).toHaveBeenCalledTimes(1);
  expect(onOpenStop).not.toHaveBeenCalled();

  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  fireEvent.click(within(chooser).getByRole("button", { name: /Kauppatori/ }));

  await waitFor(() =>
    expect(screen.getAllByText("Kauppatori").length).toBeGreaterThan(0)
  );
  expect(onOpenStop).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Open target stop" }));
  expect(onOpenStop).toHaveBeenCalledWith("164");
});

test("shows a conservative arrival state and compass fallback notice", async () => {
  const live = installLiveLocation();

  render(
    <StopRadar
      stops={stops}
      initialTargetStopId="164"
      compassPermission="denied"
      onClose={vi.fn()}
    />
  );

  live.deliver({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 8,
  });

  expect(
    await screen.findByText(/You are at the stop area/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Compass data is unavailable/i)
  ).toBeInTheDocument();
  expect(screen.getByText("<10 m")).toBeInTheDocument();
});
