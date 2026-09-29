import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import BusStopDisplay from "./BusStopDisplay";

const NOW = Math.floor(Date.now() / 1000);

// In the app the stop catalogue names the stop at once — for a returning
// passenger it is already cached — so every state below is rendered with the
// name known and no departure answer yet, which is what the passenger has.
function board(props) {
  return (
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori" }}
      arrivals={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={null}
      receivedAtMs={null}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      {...props}
    />
  );
}

const departure = {
  lineref: "1",
  destinationdisplay: "Satama",
  monitored: true,
  recordedattime: NOW - 5,
  expecteddeparturetime: NOW + 240,
  aimeddeparturetime: NOW + 200,
};

test("a stop that is still loading says so, even when its name is known", () => {
  render(board({ loading: true }));

  expect(screen.getByText("Loading departures…")).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("a first load that failed says so instead of claiming there are no departures", () => {
  render(board({ error: true }));

  expect(screen.getByText("Couldn’t load departures.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("an answer with nothing in it is still reported as no upcoming departures", () => {
  render(board({ serverTime: NOW, receivedAtMs: Date.now() }));

  expect(screen.getByText("No upcoming departures.")).toBeInTheDocument();
  expect(screen.queryByText("Couldn’t load departures.")).not.toBeInTheDocument();
});

test("a failed refresh after a good answer keeps the board and says the update failed", () => {
  render(
    board({
      arrivals: [departure],
      serverTime: NOW,
      receivedAtMs: Date.now() - 90_000,
      error: true,
    })
  );

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.getByText(/Live update failed · last successful update/)).toBeInTheDocument();
});

test("a failed refresh of an empty answer does not turn it into a load failure", () => {
  render(
    board({ serverTime: NOW, receivedAtMs: Date.now() - 90_000, error: true })
  );

  expect(screen.getByText("No upcoming departures.")).toBeInTheDocument();
  expect(screen.getByText(/Live update failed/)).toBeInTheDocument();
});

test("a saved board shown while reloading keeps its departures on screen", () => {
  render(
    board({
      arrivals: [departure],
      serverTime: NOW,
      receivedAtMs: Date.now() - 60_000,
      loading: true,
    })
  );

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.queryByText("Loading departures…")).not.toBeInTheDocument();
});

test("an empty live answer with an unchecked timetable does not claim the day is over", () => {
  render(
    board({ serverTime: NOW, receivedAtMs: Date.now(), scheduleFailed: true })
  );

  expect(screen.getByText("No live departures right now.")).toBeInTheDocument();
  expect(
    screen.getByText(/timetable could not be checked/i)
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("says when the timetable list stops early because a trip could not be checked", () => {
  render(
    board({
      arrivals: [
        {
          lineref: "32",
          destinationdisplay: "Varissuo",
          monitored: false,
          aimeddeparturetime: NOW + 300,
        },
      ],
      serverTime: NOW,
      receivedAtMs: Date.now(),
      realtimeAvailable: true,
      scheduleAvailable: true,
      scheduleIncomplete: true,
    })
  );

  expect(screen.getByText("Varissuo")).toBeInTheDocument();
  expect(
    screen.getByText(/later departures could not be checked/i)
  ).toBeInTheDocument();
});

// A board saved five minutes ago, reopened: its buses have all left. That is
// no answer about what comes next, yet it said "No upcoming departures" while
// the new update loaded, and again once that update failed.
const departedSnapshot = {
  arrivals: [
    {
      lineref: "1",
      destinationdisplay: "Satama",
      monitored: true,
      recordedattime: NOW - 320,
      expecteddeparturetime: NOW - 200,
    },
  ],
  serverTime: NOW - 300,
  receivedAtMs: Date.now() - 300_000,
};

test("a saved board whose buses have all left says it is loading, not that none are coming", () => {
  render(board({ ...departedSnapshot, loading: true }));

  expect(screen.getByText("Loading departures…")).toBeInTheDocument();
  expect(screen.queryByText("Satama")).not.toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("a saved board whose buses have all left, and whose update failed, says it could not load", () => {
  render(board({ ...departedSnapshot, error: true }));

  expect(screen.getByText("Couldn’t load departures.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("an empty board cut short at a trip that could not be checked is not called empty", () => {
  render(
    board({
      serverTime: NOW,
      receivedAtMs: Date.now(),
      realtimeAvailable: true,
      scheduleIncomplete: true,
    })
  );

  expect(screen.getByText("No live departures right now.")).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

// "?stop=1640" typed for 164 read as a stop with nothing coming.
test("a number Föli has no stop for says so instead of calling the stop empty", () => {
  render(
    board({
      stopId: "1640",
      stopName: "",
      stop: null,
      serverTime: NOW,
      receivedAtMs: Date.now(),
      unknownStop: true,
    })
  );

  expect(screen.getByText("Föli has no stop 1640.")).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("a stop the list does not know yet still shows the departures it has", () => {
  render(
    board({
      arrivals: [departure],
      serverTime: NOW,
      receivedAtMs: Date.now(),
      unknownStop: true,
    })
  );

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.queryByText(/has no stop/)).not.toBeInTheDocument();
});

// Reopened offline, a saved board still said "Live" and "Bus at stop ·
// board now" about buses that may have left minutes ago.
test("an offline board says its times are from the last update, not live", () => {
  render(
    board({
      arrivals: [{ ...departure, vehicleatstop: true, delay: 60 }],
      serverTime: NOW,
      receivedAtMs: Date.now(),
      online: false,
    })
  );

  expect(screen.getByText(/^Offline · last updated \d\d:\d\d$/)).toBeInTheDocument();
  expect(screen.getByText("Last live estimate · 1 min late")).toBeInTheDocument();
  expect(screen.queryByText(/^Live · /)).not.toBeInTheDocument();
  expect(screen.queryByText(/Bus at stop/)).not.toBeInTheDocument();
});

// A screen reader announces a change inside a live region it already knows,
// and may say nothing about a new one. Going offline after a failed update
// has to reword the same status, not swap it for another.
test("going offline rewords the board's status in place", () => {
  const failed = {
    arrivals: [departure],
    serverTime: NOW,
    receivedAtMs: Date.now() - 90_000,
    error: true,
  };
  const { rerender } = render(board(failed));
  const status = screen.getByText(/Live update failed/);

  rerender(board({ ...failed, online: false }));

  expect(screen.getByText(/^Offline · last updated/)).toBe(status);
});
