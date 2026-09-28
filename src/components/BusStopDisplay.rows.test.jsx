import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTripStopTimes: vi.fn(() =>
    Promise.resolve([
      { stopId: "164", stopSequence: 1, arrivalTime: "12:00:00", departureTime: "12:00:00", dropOffType: 0 },
      { stopId: "32", stopSequence: 2, arrivalTime: "12:05:00", departureTime: "12:05:00", dropOffType: 0 },
      { stopId: "4", stopSequence: 3, arrivalTime: "12:10:00", departureTime: "12:10:00", dropOffType: 0 },
    ])
  ),
  fetchTripDetails: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripStopTimes: mocks.fetchTripStopTimes,
  fetchTripDetails: mocks.fetchTripDetails,
}));

import BusStopDisplay from "./BusStopDisplay";

const NOW = Math.floor(Date.now() / 1000);

function departure(overrides = {}) {
  return {
    lineref: "1",
    destinationdisplay: "Satama",
    tripref: "trip-1",
    monitored: true,
    recordedattime: NOW - 5,
    aimeddeparturetime: NOW + 300,
    expecteddeparturetime: NOW + 300,
    ...overrides,
  };
}

const KAUPPATORI = { id: "164", name: "Kauppatori" };
const TURUN_LINNA = { id: "4", name: "Turun linna" };

function board(arrivals, stop = KAUPPATORI, overrides = {}) {
  return (
    <BusStopDisplay
      stopId={stop.id}
      stopName={stop.name}
      stop={stop}
      stops={[
        { id: "164", name: "Kauppatori" },
        { id: "32", name: "Puistokatu" },
        { id: "4", name: "Turun linna" },
      ]}
      arrivals={arrivals}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      placesById={new Map()}
      activeRideTripRef={overrides.activeRideTripRef || ""}
      onStartRide={overrides.onStartRide || (() => {})}
    />
  );
}

function setupPanels() {
  return screen.queryAllByRole("region", { name: "Set up get-off alerts" });
}

async function openSetupAndChooseTurunLinna(buttonIndex = 0) {
  fireEvent.click(
    screen.getAllByRole("button", { name: "Get-off alert" })[
      buttonIndex
    ]
  );
  await screen.findByText("Turun linna");
  const choice = document.querySelector('input[type="radio"][value="3"]');
  fireEvent.click(choice);
  expect(choice).toBeChecked();
}

afterEach(() => {
  vi.restoreAllMocks();
});

// The board refreshes every 30 seconds and a live estimate moves on nearly
// every one. Keying the row on that estimate remounted it, so the get-off
// setup closed mid-choice and took the chosen stop with it.
test("an open get-off setup survives a routine live-estimate update", async () => {
  const { rerender } = render(board([departure()]));
  await openSetupAndChooseTurunLinna();

  rerender(board([departure({ expecteddeparturetime: NOW + 320 })]));

  expect(setupPanels()).toHaveLength(1);
  expect(
    document.querySelector('input[type="radio"][value="3"]')
  ).toBeChecked();
});

test("an open get-off setup survives an earlier bus leaving the board", async () => {
  const earlier = departure({
    lineref: "7",
    tripref: "trip-0",
    aimeddeparturetime: NOW + 60,
    expecteddeparturetime: NOW + 60,
  });
  const { rerender } = render(board([earlier, departure()]));
  await openSetupAndChooseTurunLinna(1);

  rerender(board([departure()]));

  expect(setupPanels()).toHaveLength(1);
  expect(
    document.querySelector('input[type="radio"][value="3"]')
  ).toBeChecked();
});

test("an expanded next-stops list stays open across a refresh", async () => {
  const { rerender } = render(board([departure()]));
  fireEvent.click(screen.getByRole("button", { name: "Next stops" }));
  await screen.findByText("Next stops · timetable times");

  rerender(board([departure({ expecteddeparturetime: NOW + 320 })]));

  expect(
    screen.getByRole("button", { name: "Hide next stops" })
  ).toBeInTheDocument();
});

test("two visits of one looping trip keep separate rows and panels", async () => {
  const consoleError = vi.spyOn(console, "error");
  render(
    board([
      departure(),
      departure({
        aimeddeparturetime: NOW + 1_500,
        expecteddeparturetime: NOW + 1_500,
      }),
    ])
  );

  fireEvent.click(
    screen.getAllByRole("button", { name: "Get-off alert" })[0]
  );

  expect(setupPanels()).toHaveLength(1);
  expect(
    screen.getAllByRole("button", { name: "Get-off alert" })
  ).toHaveLength(1);
  expect(
    consoleError.mock.calls.some((call) =>
      String(call[0]).includes("same key")
    )
  ).toBe(false);
});

test("a different departure taking the slot does not inherit an open setup", async () => {
  const { rerender } = render(board([departure()]));
  fireEvent.click(
    screen.getByRole("button", { name: "Get-off alert" })
  );
  expect(setupPanels()).toHaveLength(1);

  rerender(board([departure({ tripref: "trip-2" })]));

  expect(setupPanels()).toHaveLength(0);
});

test("replacing a different active get-off alert requires confirmation", async () => {
  const onStartRide = vi.fn();
  const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);

  render(
    board(
      [departure({ lineref: "7", tripref: "trip-7" })],
      KAUPPATORI,
      { activeRideTripRef: "trip-1", onStartRide }
    )
  );

  await openSetupAndChooseTurunLinna();
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(confirm).toHaveBeenCalledWith(
    "Switch get-off alert to line 7? Your current alert will end."
  );
  expect(onStartRide).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStartRide).toHaveBeenCalledTimes(1);
});

// A neighbouring stop can list the same trip under the same planned minute.
// The open setup belongs to the stop it was opened at, and coming back to that
// stop later must not reopen it either.
test("switching stops closes an open setup, and coming back does not reopen it", () => {
  const { rerender } = render(board([departure()]));
  fireEvent.click(
    screen.getByRole("button", { name: "Get-off alert" })
  );
  expect(setupPanels()).toHaveLength(1);

  rerender(board([departure()], TURUN_LINNA));
  expect(setupPanels()).toHaveLength(0);

  rerender(board([departure()]));
  expect(setupPanels()).toHaveLength(0);
});

test("an expanded next-stops list does not carry over to another stop", async () => {
  const { rerender } = render(board([departure()]));
  fireEvent.click(screen.getByRole("button", { name: "Next stops" }));
  await screen.findByText("Next stops · timetable times");

  rerender(board([departure()], TURUN_LINNA));

  expect(
    screen.getByRole("button", { name: "Next stops" })
  ).toBeInTheDocument();
  expect(screen.queryByText("Next stops · timetable times")).not.toBeInTheDocument();
});

// Back and Forward change the stop under the same board. Remounting the whole
// board for it dropped keyboard focus to the page and replaced the polite
// live region that announces the stop, so the new stop was not read out.
test("the board header keeps focus and its live region across a stop change", () => {
  const { rerender } = render(board([departure()]));
  const refresh = screen.getByRole("button", { name: "Refresh" });
  refresh.focus();
  const stopLine = screen.getByText(/^Stop 164/);

  rerender(board([departure()], TURUN_LINNA));

  expect(document.activeElement).toBe(refresh);
  expect(screen.getByText(/^Stop 4/)).toBe(stopLine);
});
