import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchScheduledLineDepartures: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../api/foliApi", () => ({
  fetchScheduledLineDepartures: mocks.fetchScheduledLineDepartures,
  fetchTripDetails: vi.fn(() => Promise.resolve(null)),
  fetchTripStopTimes: vi.fn(() => Promise.resolve([])),
}));

import BusStopDisplay from "./BusStopDisplay";

const NOW = Math.floor(Date.now() / 1000);

function departure(line, destination, inSeconds) {
  return {
    lineref: line,
    destinationdisplay: destination,
    monitored: false,
    aimeddeparturetime: NOW + inSeconds,
  };
}

// A busy stop: the 32 is the one this commuter takes, and its second bus
// sits below the first ten rows of everything else.
const busyStop = [
  departure("1", "Satama", 60),
  departure("32", "Varissuo", 120),
  ...Array.from({ length: 10 }, (_, index) =>
    departure(index % 2 ? "7" : "1", index % 2 ? "Runosmäki" : "Satama", 180 + index * 60)
  ),
  departure("32", "Varissuo", 1_200),
];

function board(props = {}) {
  return (
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      arrivals={busyStop}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      scheduleAvailable
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      {...props}
    />
  );
}

const rows = () => screen.getAllByRole("row").slice(1);

beforeEach(() => {
  localStorage.clear();
  mocks.fetchScheduledLineDepartures.mockReset();
  mocks.fetchScheduledLineDepartures.mockResolvedValue([]);
});
afterEach(() => localStorage.clear());

test("following one line shows only its buses, later ones included", () => {
  render(board());
  expect(rows()).toHaveLength(10);

  fireEvent.click(screen.getByRole("button", { name: "Filter lines" }));
  const filter = screen.getByRole("group", { name: "Show only these lines" });
  fireEvent.click(within(filter).getByRole("button", { name: "Line 32" }));

  expect(rows()).toHaveLength(2);
  expect(screen.getAllByText("Varissuo")).toHaveLength(2);
  expect(screen.queryByText("Satama")).not.toBeInTheDocument();
  expect(within(filter).getByRole("button", { name: "Line 32" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(screen.getByRole("button", { name: "Only line 32" })).toBeInTheDocument();
});

test("several lines can be followed, and All lines clears them", () => {
  render(board());
  fireEvent.click(screen.getByRole("button", { name: "Filter lines" }));
  const filter = screen.getByRole("group", { name: "Show only these lines" });
  fireEvent.click(within(filter).getByRole("button", { name: "Line 32" }));
  fireEvent.click(within(filter).getByRole("button", { name: "Line 7" }));

  expect(screen.getByRole("button", { name: "Only lines 32, 7" })).toBeInTheDocument();
  expect(screen.queryByText("Satama")).not.toBeInTheDocument();

  fireEvent.click(within(filter).getByRole("button", { name: "All lines" }));
  expect(rows()).toHaveLength(10);
  expect(screen.getByRole("button", { name: "Filter lines" })).toBeInTheDocument();
});

test("a stop keeps its own filter, and another stop does not inherit it", () => {
  const { unmount } = render(board());
  fireEvent.click(screen.getByRole("button", { name: "Filter lines" }));
  fireEvent.click(screen.getByRole("button", { name: "Line 32" }));
  unmount();

  const { rerender } = render(board());
  expect(rows()).toHaveLength(2);

  rerender(board({ stopId: "32", stopName: "Puistokatu" }));
  expect(rows()).toHaveLength(10);
  expect(screen.getByRole("button", { name: "Filter lines" })).toBeInTheDocument();
});

function follow(lines) {
  localStorage.setItem(
    "foli-line-filter-v1",
    JSON.stringify({ 164: { lines, savedAt: Date.now() } })
  );
}

test("a followed line with nothing coming says so, not that the stop is empty", async () => {
  const onRefresh = vi.fn();
  follow(["99"]);
  render(board({ onRefresh }));

  expect(screen.getByText("Checking the timetable for line 99…")).toBeInTheDocument();
  expect(
    await screen.findByText("No departures on line 99 from this stop in the next 36 hours.")
  ).toBeInTheDocument();
  expect(mocks.fetchScheduledLineDepartures.mock.calls[0].slice(0, 2)).toEqual(["164", ["99"]]);
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
  expect(onRefresh).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Show all lines" }));
  expect(rows()).toHaveLength(10);
});

// The live feed looks an hour or so ahead: an hourly line was missing from a
// busy stop's board while it ran, and the filter said it had no departures.
test("a followed line missing from the live board shows its next buses from the timetable", async () => {
  mocks.fetchScheduledLineDepartures.mockResolvedValue([
    { ...departure("18", "Lauste", 70 * 60), tripref: "trip-18-1" },
  ]);
  follow(["18"]);
  render(board());

  expect(await screen.findByText("Lauste")).toBeInTheDocument();
  expect(rows()).toHaveLength(1);
  expect(within(rows()[0]).getByText("Scheduled")).toBeInTheDocument();
});

test("a followed line neither feed can answer for is not called not running", async () => {
  mocks.fetchScheduledLineDepartures.mockRejectedValue(new Error("offline"));
  follow(["18"]);
  render(board());

  expect(
    await screen.findByText("Line 18 is not in Föli’s live times right now.")
  ).toBeInTheDocument();
  expect(screen.queryByText(/No departures on line 18/)).not.toBeInTheDocument();

  mocks.fetchScheduledLineDepartures.mockResolvedValue([
    { ...departure("18", "Lauste", 70 * 60), tripref: "trip-18-1" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Lauste")).toBeInTheDocument();
});

test("a followed line that has a live row is not looked up in the timetable", () => {
  follow(["32"]);
  render(board());

  expect(rows()).toHaveLength(2);
  expect(mocks.fetchScheduledLineDepartures).not.toHaveBeenCalled();
});

test("a stop served by one line offers no filter", () => {
  render(board({ arrivals: [departure("32", "Varissuo", 120), departure("32", "Varissuo", 900)] }));

  expect(screen.queryByRole("button", { name: "Filter lines" })).not.toBeInTheDocument();
});

test("a stored filter that is not a filter is ignored", () => {
  localStorage.setItem("foli-line-filter-v1", JSON.stringify({ 164: { lines: "32" } }));
  render(board());

  expect(rows()).toHaveLength(10);
});

// An hourly line whose next bus is cancelled showed only "Cancelled", with
// nothing of the bus after it, which is past the live feed's hour.
test("a followed line whose only live row is cancelled still shows its next bus", async () => {
  mocks.fetchScheduledLineDepartures.mockResolvedValue([
    { ...departure("32", "Varissuo", 70 * 60), tripref: "trip-32-next" },
  ]);
  follow(["32"]);
  render(
    board({
      arrivals: [departure("1", "Satama", 60), departure("32", "Varissuo", 600)],
      cancellations: [{ line: "32", scheduledTime: NOW + 600 }],
    })
  );

  // The cancelled bus, and the one after it from the timetable.
  await waitFor(() => expect(screen.getAllByText("Varissuo")).toHaveLength(2));
  expect(mocks.fetchScheduledLineDepartures).toHaveBeenCalledWith(
    "164",
    ["32"],
    expect.anything(),
    expect.anything()
  );
});

// The timetable knows nothing of cancellations, so it lists the cancelled
// bus too, and the board showed "Cancelled" for it twice.
test("the cancelled bus is not listed again from the timetable", async () => {
  mocks.fetchScheduledLineDepartures.mockResolvedValue([
    { ...departure("32", "Varissuo", 600), tripref: "trip-32-cancelled" },
    { ...departure("32", "Varissuo", 70 * 60), tripref: "trip-32-next" },
  ]);
  follow(["32"]);
  render(
    board({
      arrivals: [
        departure("1", "Satama", 60),
        { ...departure("32", "Varissuo", 600), tripref: "trip-32-cancelled" },
      ],
      cancellations: [{ line: "32", scheduledTime: NOW + 600 }],
    })
  );

  await waitFor(() => expect(mocks.fetchScheduledLineDepartures).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByText("Varissuo")).toHaveLength(2));
  expect(rows()).toHaveLength(2);
  expect(rows().filter((row) => /Cancelled/.test(row.textContent))).toHaveLength(1);
});
