import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";
import NearbyStops from "./NearbyStops";

// The radar's code as it is when the phone is offline before it was cached,
// or a deploy has removed the file a long-open page asks for.
vi.mock("./StopRadar", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
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

test("a radar that cannot load says so in its place and leaves the rest of the app", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
    },
  });

  render(
    <AppErrorBoundary>
      <section aria-label="Ride in progress">Your stop is next</section>
      <NearbyStops stops={stops} coordinatesStatus="ready" activeStopId="32" onSelect={vi.fn()} />
    </AppErrorBoundary>
  );

  fireEvent.click(screen.getByRole("button", { name: "Open stop radar" }));

  expect(
    await screen.findByText(
      "Stop radar couldn’t open. Check your connection, then try again."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText("Something went wrong.")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Ride in progress" })).toBeInTheDocument();

  // The same button still closes it.
  fireEvent.click(screen.getByRole("button", { name: "Close stop radar" }));
  expect(
    screen.queryByText("Stop radar couldn’t open. Check your connection, then try again.")
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open stop radar" })).toBeInTheDocument();
});
