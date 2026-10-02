import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripStopTimes: mocks.fetchTripStopTimes,
}));

import TripJourneyDetails from "./TripJourneyDetails";

test("loads the planned sequence only after the user opens Next stops", async () => {
  mocks.fetchTripStopTimes.mockResolvedValue([
    {
      stopId: "164",
      arrivalTime: "17:40:00",
      departureTime: "17:41:00",
      stopSequence: 1,
      dropOffType: 0,
      timepoint: 1,
    },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
      timepoint: 0,
    },
    {
      stopId: "4",
      arrivalTime: "25:05:00",
      departureTime: "25:05:00",
      stopSequence: 3,
      dropOffType: 0,
      timepoint: 1,
    },
  ]);

  render(
    <TripJourneyDetails
      tripId="trip-1"
      currentStopId="164"
      stopsById={
        new Map([
          ["164", { id: "164", name: "Kauppatori" }],
          ["32", { id: "32", name: "Puistokatu" }],
          ["4", { id: "4", name: "Turun linna" }],
        ])
      }
    />
  );

  expect(mocks.fetchTripStopTimes).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Next stops" }));

  expect(
    await screen.findByText("Next stops · timetable times")
  ).toBeInTheDocument();
  expect(mocks.fetchTripStopTimes).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      "A plain clock time is a published timetable timepoint. “Around” is approximate between timepoints."
    )
  ).toBeInTheDocument();
  expect(screen.getByText("Puistokatu")).toBeInTheDocument();
  expect(screen.getByText("around 17:46")).toHaveAttribute(
    "data-time-kind",
    "approximate"
  );
  expect(screen.getByText("Turun linna")).toBeInTheDocument();
  expect(screen.getByText("01:05")).toHaveAttribute(
    "data-time-kind",
    "timepoint"
  );
  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
});

// A loop serves Kauppatori twice. Opening "Next stops" on the second pass
// started from the first, listing stops the bus had already served and
// Kauppatori itself as still to come.
test("lists the stops after the pass the passenger is actually boarding", async () => {
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "12:00:00", stopSequence: 1 },
    { stopId: "10", departureTime: "12:05:00", stopSequence: 2 },
    { stopId: "20", departureTime: "12:10:00", stopSequence: 3 },
    { stopId: "164", departureTime: "12:15:00", stopSequence: 4 },
    { stopId: "30", departureTime: "12:20:00", stopSequence: 5 },
  ]);

  render(
    <TripJourneyDetails
      tripId="trip-loop"
      currentStopId="164"
      aimedDepartureTime={Date.UTC(2026, 8, 21, 9, 15) / 1000}
      stopsById={
        new Map([
          ["164", { id: "164", name: "Kauppatori" }],
          ["10", { id: "10", name: "Alpha" }],
          ["20", { id: "20", name: "Beta" }],
          ["30", { id: "30", name: "Gamma" }],
        ])
      }
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Next stops" }));

  expect(await screen.findByText("Gamma")).toBeInTheDocument();
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
});
