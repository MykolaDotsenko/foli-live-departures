import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      selectedJourney={overrides.selectedJourney || null}
      boardingRequest={overrides.boardingRequest || 0}
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

// The alert is set up for the bus being boarded, so the setup is often still
// open as that bus leaves. Half a minute later its row went, and the setup
// with it, chosen stop and all, before the passenger could press Start.
test("an open get-off setup stays as its bus pulls away, and after the feed drops it", async () => {
  const onStartRide = vi.fn();
  const atStop = { aimeddeparturetime: NOW + 20, expecteddeparturetime: NOW + 20 };
  const { rerender } = render(
    board([departure(atStop)], KAUPPATORI, { onStartRide })
  );
  await openSetupAndChooseTurunLinna();

  // A minute gone, still listed.
  rerender(
    board(
      [departure({ ...atStop, expecteddeparturetime: NOW - 60 })],
      KAUPPATORI,
      { onStartRide }
    )
  );
  expect(setupPanels()).toHaveLength(1);
  expect(document.querySelector('input[type="radio"][value="3"]')).toBeChecked();

  // Then no longer listed at all.
  rerender(board([], KAUPPATORI, { onStartRide }));
  expect(setupPanels()).toHaveLength(1);
  expect(document.querySelector('input[type="radio"][value="3"]')).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));
  expect(onStartRide).toHaveBeenCalledTimes(1);
  expect(onStartRide.mock.calls[0][0]).toMatchObject({ tripRef: "trip-1" });
  // Started, the row it held goes the way of any departed bus.
  expect(setupPanels()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Get-off alert" })).toBeNull();
});

test("cancelling the setup of a departed bus lets its row go", async () => {
  const atStop = { aimeddeparturetime: NOW + 20, expecteddeparturetime: NOW + 20 };
  const { rerender } = render(board([departure(atStop)]));
  await openSetupAndChooseTurunLinna();
  rerender(board([departure({ ...atStop, expecteddeparturetime: NOW - 60 })]));
  expect(setupPanels()).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(setupPanels()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Get-off alert" })).toBeNull();
});

test("an expanded next-stops list stays open across a refresh", async () => {
  const { rerender } = render(board([departure()]));
  fireEvent.click(screen.getByRole("button", { name: "Next stops" }));
  await screen.findByText("Next stops · timetable times");

  rerender(board([departure({ expecteddeparturetime: NOW + 320 })]));

  expect(
    screen.getByRole("button", { name: "Hide stops" })
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
  // The row button keeps its name open or closed; aria-expanded says which.
  expect(
    screen
      .getAllByRole("button", { name: "Get-off alert" })
      .filter((button) => button.getAttribute("aria-expanded") === "true")
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
// board for it dropped keyboard focus to the page and redrew the header.
test("the board header keeps focus and its meta line across a stop change", () => {
  const { rerender } = render(board([departure()]));
  const refresh = screen.getByRole("button", { name: "Refresh" });
  refresh.focus();
  const stopLine = screen.getByText(/^Stop 164/);

  rerender(board([departure()], TURUN_LINNA));

  expect(document.activeElement).toBe(refresh);
  expect(screen.getByText(/^Stop 4/)).toBe(stopLine);
});

// The meta line carries the update time, so as a live region it was read
// out twice on every 30-second refresh: "Refreshing…", then "Updated". A
// change of stop is announced by App instead, and Refreshing is said by the
// button alone.
test("a routine refresh is not announced by the meta line", () => {
  const props = (refreshing) => ({ ...board([departure()]).props, refreshing });
  const { rerender } = render(<BusStopDisplay {...props(false)} />);
  const stopLine = screen.getByText(/^Stop 164/);

  rerender(<BusStopDisplay {...props(true)} />);

  expect(stopLine).not.toHaveAttribute("aria-live");
  expect(stopLine.closest("[aria-live], [role='status']")).toBeNull();
  expect(stopLine).not.toHaveTextContent("Refreshing");
  expect(screen.getByRole("button", { name: "Refreshing…" })).toBeInTheDocument();
});

// Cancel goes away with the setup it closes. Focus used to fall to the top
// of the page; it goes back to the row's own button instead.
test("cancelling the get-off setup returns focus to the row's alert button", async () => {
  render(board([departure()]));
  fireEvent.click(screen.getByRole("button", { name: "Get-off alert" }));
  await screen.findByText("Turun linna");

  const cancel = screen.getByRole("button", { name: "Cancel" });
  cancel.focus();
  fireEvent.click(cancel);

  expect(setupPanels()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Get-off alert" })).toHaveFocus();
});

// Refresh is busy every half minute. Disabled, it dropped keyboard focus to
// the page each time; busy, it keeps focus and a press does nothing.
test("a busy Refresh keeps keyboard focus and ignores presses", () => {
  const onRefresh = vi.fn();
  const props = (refreshing) => ({ ...board([departure()]).props, refreshing, onRefresh });
  const { rerender } = render(<BusStopDisplay {...props(false)} />);
  const refresh = screen.getByRole("button", { name: "Refresh" });
  refresh.focus();

  rerender(<BusStopDisplay {...props(true)} />);

  const busy = screen.getByRole("button", { name: "Refreshing…" });
  expect(busy).toBe(refresh);
  expect(busy).toHaveFocus();
  expect(busy).not.toBeDisabled();
  expect(busy).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(busy);
  expect(onRefresh).not.toHaveBeenCalled();

  rerender(<BusStopDisplay {...props(false)} />);
  expect(refresh).not.toHaveAttribute("aria-disabled");
  fireEvent.click(refresh);
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

// A name that changed with the state as well as aria-pressed read "Remove
// Kauppatori from favourites, pressed". One name; pressed says it is saved.
test("the favourite button keeps one name and says whether it is saved", () => {
  const props = (isFavorite) => ({
    ...board([departure()]).props,
    isFavorite,
    onToggleFavorite: () => {},
  });
  const { rerender } = render(<BusStopDisplay {...props(false)} />);
  const favourite = screen.getByRole("button", {
    name: "Save Kauppatori to favourites",
    pressed: false,
  });

  rerender(<BusStopDisplay {...props(true)} />);

  expect(
    screen.getByRole("button", {
      name: "Save Kauppatori to favourites",
      pressed: true,
    })
  ).toBe(favourite);
});

// Ticking the star filled it and said nothing: a favourite is listed under
// the stop search, but never beside its own board.
test("ticking the star says it worked and where to find the stop", () => {
  vi.useFakeTimers();
  try {
    let saved = false;
    const props = () => ({
      ...board([departure()]).props,
      isFavorite: saved,
      onToggleFavorite: () => {
        saved = !saved;
      },
    });
    const { rerender } = render(<BusStopDisplay {...props()} />);
    const star = screen.getByRole("button", {
      name: "Save Kauppatori to favourites",
    });

    fireEvent.click(star);
    rerender(<BusStopDisplay {...props()} />);
    const said = screen.getAllByText("Saved. You’ll find it under the stop search.");
    // Seen once, and heard from a region that was already in the page.
    expect(said).toHaveLength(2);
    expect(said.filter((node) => node.getAttribute("role") === "status")).toHaveLength(1);

    fireEvent.click(star);
    rerender(<BusStopDisplay {...props()} />);
    expect(screen.getAllByText("Removed from favourites.")).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Removed from favourites.")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

// A label on a plain div is not read; as a group its name is.
test("the departure counts are a named group", () => {
  render(board([departure()]));

  expect(
    screen.getByRole("group", { name: "Departure data summary" })
  ).toHaveTextContent("1 upcoming");
});

// The gap between the sign and its translation is a margin, and a screen
// reader ran the two together: "SatamaHarbour".
test("a destination and its translation are read apart", () => {
  render(board([departure({ destinationdisplay_en: "Harbour" })]));

  const cell = screen.getByText("Harbour").closest("td");
  expect(cell.textContent).toMatch(/^Satama · Harbour/);
});


test("explicit journey boarding opens the selected bus setup with its exit prefilled", async () => {
  const selectedJourney = {
    id: "journey-1",
    stopId: "164",
    stopName: "Kauppatori",
    tripRef: "trip-1",
    lineRef: "1",
    aimedDepartureAt: NOW + 300,
    originAimedDepartureAt: null,
    destinationStopId: "4",
    destinationStopSequence: null,
    phase: "waiting",
    selectedAt: Date.now() - 60_000,
  };

  render(
    board([departure()], KAUPPATORI, {
      selectedJourney,
      boardingRequest: 1,
    })
  );

  const heading = await screen.findByRole("heading", {
    name: "Get off at Turun linna",
  });
  expect(setupPanels()).toHaveLength(1);
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();

  await waitFor(() => expect(heading).toHaveFocus());
});
