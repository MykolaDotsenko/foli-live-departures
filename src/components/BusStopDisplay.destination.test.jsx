import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const destinationFits = vi.hoisted(() => ({
  hook: vi.fn(),
}));

vi.mock("../hooks/useDestinationBoardFits", () => ({
  default: destinationFits.hook,
}));

import BusStopDisplay from "./BusStopDisplay";

test("shows matching trips first without hiding other departures", () => {
  destinationFits.hook.mockImplementation(({ arrivals, rowKeys }) => {
    const fitsByRowKey = {};
    arrivals.forEach((arrival, index) => {
      fitsByRowKey[rowKeys[index]] =
        arrival.lineref === "18"
          ? {
              status: "compatible",
              destinationStopId: "900",
              destinationStopSequence: 8,
            }
          : {
              status: "not-serving",
              destinationStopId: "",
              destinationStopSequence: null,
            };
    });
    return { fitsByRowKey, state: "ready" };
  });

  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      destination={{
        id: "stop:900",
        kind: "public-stop",
        label: "Home stop",
        primaryStopId: "900",
        acceptableStopIds: ["900"],
      }}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Other place",
          monitored: false,
          aimeddeparturetime: now + 120,
        },
        {
          lineref: "18",
          destinationdisplay: "Runosmäki",
          monitored: false,
          aimeddeparturetime: now + 300,
        },
      ]}
    />
  );

  expect(
    screen.getByText(
      "Trips to Home stop are shown first. Other departures stay below."
    )
  ).toBeInTheDocument();
  expect(screen.getByText("Goes to Home stop")).toBeInTheDocument();

  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("18")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Runosmäki")).toBeInTheDocument();
  expect(within(rows[1]).getByText("1")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Other place")).toBeInTheDocument();
  expect(rows).toHaveLength(2);
});


test("pins the explicitly selected concrete trip above other destination matches", () => {
  destinationFits.hook.mockImplementation(({ arrivals, rowKeys }) => {
    const fitsByRowKey = {};
    arrivals.forEach((arrival, index) => {
      fitsByRowKey[rowKeys[index]] = {
        status: "compatible",
        destinationStopId: "900",
        destinationStopSequence: 8,
      };
    });
    return { fitsByRowKey, state: "ready" };
  });

  const now = Math.floor(Date.now() / 1000);
  const selectedPlanned = now + 600;

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={now}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      destination={{
        id: "stop:900",
        kind: "public-stop",
        label: "Home stop",
        primaryStopId: "900",
        acceptableStopIds: ["900"],
      }}
      selectedJourney={{
        id: "selected",
        destinationId: "stop:900",
        destinationLabel: "Home stop",
        optionLabel: "easier-to-catch",
        stopId: "164",
        stopName: "Kauppatori",
        distanceMeters: 100,
        tripRef: "trip-selected",
        lineRef: "2",
        destinationStopId: "900",
        departureAt: selectedPlanned,
        aimedDepartureAt: selectedPlanned,
        destinationArrivalAt: now + 1800,
        liveState: "live",
        phase: "waiting",
        recoveryReason: null,
        selectedAt: Date.now() - 30_000,
        atStopConfirmedAt: Date.now() - 20_000,
        lastSeenAt: Date.now(),
      }}
      arrivals={[
        {
          lineref: "18",
          tripref: "trip-earlier",
          destinationdisplay: "Runosmäki",
          monitored: false,
          aimeddeparturetime: now + 300,
        },
        {
          lineref: "2",
          tripref: "trip-selected",
          destinationdisplay: "Home direction",
          monitored: false,
          aimeddeparturetime: selectedPlanned,
        },
      ]}
    />
  );

  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("2")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Your bus")).toBeInTheDocument();
  expect(
    within(rows[0]).getByRole("button", { name: "Get-off alert" })
  ).toHaveAttribute("id", "selected-journey-departure-action");

  expect(within(rows[1]).getByText("18")).toBeInTheDocument();
  expect(rows).toHaveLength(2);
});
