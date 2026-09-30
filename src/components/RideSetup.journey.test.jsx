import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchTripDetails: vi.fn(),
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripDetails: api.fetchTripDetails,
  fetchTripStopTimes: api.fetchTripStopTimes,
}));

import RideSetup from "./RideSetup";

const trip = [
  {
    stopId: "164",
    departureTime: "17:41:00",
    stopSequence: 1,
    pickupType: 0,
    dropOffType: 0,
  },
  {
    stopId: "32",
    arrivalTime: "17:46:00",
    departureTime: "17:46:00",
    stopSequence: 2,
    pickupType: 0,
    dropOffType: 0,
  },
  {
    stopId: "4",
    arrivalTime: "17:55:00",
    departureTime: "17:55:00",
    stopSequence: 3,
    pickupType: 0,
    dropOffType: 0,
  },
];

const stops = new Map([
  ["164", { id: "164", name: "Kauppatori" }],
  ["32", { id: "32", name: "Puistokatu" }],
  ["4", { id: "4", name: "Turun linna" }],
]);

test("explicit journey exit beats the generic Home preselection", async () => {
  api.fetchTripDetails.mockResolvedValue(null);
  api.fetchTripStopTimes.mockResolvedValue(trip);
  const onStart = vi.fn();

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-1",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={stops}
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              primaryStopId: "32",
              stops: [{ id: "32", name: "Puistokatu" }],
            },
          ],
        ])
      }
      routesById={new Map()}
      preferredTargetStopId="4"
      preferredTargetStopSequence={3}
      onStart={onStart}
      onCancel={() => {}}
    />
  );

  await waitFor(() => expect(screen.getByDisplayValue("3")).toBeChecked());
  expect(screen.getByDisplayValue("2")).not.toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart.mock.calls[0][0].targetStop.id).toBe("4");
});

test("falls back to the existing Home primary when a journey target is unusable", async () => {
  api.fetchTripDetails.mockResolvedValue(null);
  api.fetchTripStopTimes.mockResolvedValue(trip);

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-1",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={stops}
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              primaryStopId: "32",
              stops: [{ id: "32", name: "Puistokatu" }],
            },
          ],
        ])
      }
      routesById={new Map()}
      preferredTargetStopId="999"
      onStart={() => {}}
      onCancel={() => {}}
    />
  );

  await waitFor(() => expect(screen.getByDisplayValue("2")).toBeChecked());
});
