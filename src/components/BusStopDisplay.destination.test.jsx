import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const destinationFits = vi.hoisted(() => ({
  hook: vi.fn(),
}));

vi.mock("../hooks/useDestinationBoardFits", () => ({
  default: destinationFits.hook,
}));

import BusStopDisplay from "./BusStopDisplay";
import { formatClock } from "../utils/time";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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

  // One bus goes there, so it is not called the fastest, and with no
  // ride time or stop name known nothing more is claimed about it.
  expect(
    screen.getByText(
      `To Home stop: line 18 at ${formatClock(now + 300)}`
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Fastest/)).not.toBeInTheDocument();
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
  // The chosen journey has its own panel: an answer beside it could name
  // the earlier 18 instead of the bus the passenger chose.
  expect(screen.queryByText(/to Home stop: line/i)).not.toBeInTheDocument();
});


test("keeps the selected journey visible through an existing line filter", () => {
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

  localStorage.setItem(
    "foli-line-filter-v1",
    JSON.stringify({
      "164": {
        lines: ["18"],
        savedAt: Date.now(),
      },
    })
  );

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
        destinationKind: "public-stop",
        destinationLabel: "Home stop",
        optionLabel: "fastest",
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
          tripref: "trip-filtered",
          destinationdisplay: "Filter line",
          monitored: false,
          aimeddeparturetime: now + 300,
        },
        {
          lineref: "2",
          tripref: "trip-selected",
          destinationdisplay: "Selected journey",
          monitored: false,
          aimeddeparturetime: selectedPlanned,
        },
        {
          lineref: "1",
          tripref: "trip-hidden",
          destinationdisplay: "Hidden by filter",
          monitored: false,
          aimeddeparturetime: now + 450,
        },
      ]}
    />
  );

  const rows = screen.getAllByRole("row").slice(1);
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText("2")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Your bus")).toBeInTheDocument();
  expect(within(rows[1]).getByText("18")).toBeInTheDocument();
  expect(screen.queryByText("Hidden by filter")).not.toBeInTheDocument();
});


test("keeps a just-departed selected row visible during journey grace", () => {
  destinationFits.hook.mockReturnValue({
    fitsByRowKey: {},
    state: "ready",
  });

  const now = Math.floor(Date.now() / 1000);
  const planned = now - 60;

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
      selectedJourney={{
        id: "selected",
        destinationId: "stop:900",
        destinationKind: "public-stop",
        destinationLabel: "Home stop",
        optionLabel: "fastest",
        stopId: "164",
        stopName: "Kauppatori",
        distanceMeters: 100,
        tripRef: "trip-selected",
        lineRef: "2",
        destinationStopId: "900",
        departureAt: planned,
        aimedDepartureAt: planned,
        destinationArrivalAt: now + 1200,
        liveState: "live",
        phase: "waiting",
        recoveryReason: null,
        selectedAt: Date.now() - 30_000,
        atStopConfirmedAt: Date.now() - 20_000,
        lastSeenAt: Date.now(),
      }}
      arrivals={[
        {
          lineref: "2",
          tripref: "trip-selected",
          destinationdisplay: "Selected journey",
          monitored: true,
          recordedattime: now - 10,
          aimeddeparturetime: planned,
          expecteddeparturetime: planned,
        },
      ]}
    />
  );

  expect(screen.getByText("Your bus")).toBeInTheDocument();
  expect(screen.getByText("Selected journey")).toBeInTheDocument();
  expect(
    screen.queryByText("Checking for the next departures…")
  ).not.toBeInTheDocument();
});


const homeStop = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

/**
 * The board for Kauppatori with a destination, each row's fit given by
 * line, as the trip check would have found it.
 */
function renderAnswer({
  fitsByLine,
  state = "ready",
  arrivals,
  stops = [],
  cancellations = [],
}) {
  destinationFits.hook.mockImplementation(({ arrivals: rows, rowKeys }) => {
    const fitsByRowKey = {};
    rows.forEach((arrival, index) => {
      const fit = fitsByLine[arrival.lineref];
      if (fit) fitsByRowKey[rowKeys[index]] = fit;
    });
    return { fitsByRowKey, state };
  });

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={stops}
      routesByShortName={new Map()}
      serverTime={Math.floor(Date.now() / 1000)}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      destination={homeStop}
      cancellations={cancellations}
      arrivals={arrivals}
    />
  );
}

const goesHome = (rideDurationSec) => ({
  status: "compatible",
  destinationStopId: "900",
  destinationStopSequence: 8,
  rideDurationSec,
});
const notServing = {
  status: "not-serving",
  destinationStopId: "",
  destinationStopSequence: null,
};

test("answers with the bus that gets there first, where to get off and when", () => {
  const now = Math.floor(Date.now() / 1000);

  renderAnswer({
    stops: [{ id: "900", name: "Puistokatu" }],
    // Föli cancelled the 3 here, so the earliest arrival it would have made
    // is no answer.
    cancellations: [{ line: "3", scheduledTime: now + 60 }],
    fitsByLine: {
      "1": goesHome(25 * 60),
      "3": goesHome(5 * 60),
      "18": goesHome(10 * 60),
    },
    arrivals: [
      { lineref: "3", monitored: false, aimeddeparturetime: now + 60 },
      // First to leave, but the long way round.
      { lineref: "1", monitored: false, aimeddeparturetime: now + 120 },
      { lineref: "18", monitored: false, aimeddeparturetime: now + 300 },
    ],
  });

  expect(
    screen.getByText(
      `Fastest to Home stop: line 18 at ${formatClock(now + 300)}`
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      `Get off at Puistokatu · arrive about ${formatClock(now + 900)}`
    )
  ).toBeInTheDocument();
  // Nothing about whether the passenger makes it: without their location
  // that is not known.
  expect(screen.queryByText(/make it|catch/i)).not.toBeInTheDocument();
});

test("says so when none of the listed buses goes there", () => {
  const now = Math.floor(Date.now() / 1000);

  renderAnswer({
    fitsByLine: { "1": notServing, "7": notServing },
    arrivals: [
      { lineref: "1", monitored: false, aimeddeparturetime: now + 120 },
      { lineref: "7", monitored: false, aimeddeparturetime: now + 300 },
    ],
  });

  expect(
    screen.getByText("None of the buses listed here go to Home stop.")
  ).toBeInTheDocument();
  // The old note said they were "shown first" with none to show.
  expect(screen.queryByText(/shown first/)).not.toBeInTheDocument();
});

test("does not say none goes there when a bus could not be checked", () => {
  const now = Math.floor(Date.now() / 1000);

  renderAnswer({
    fitsByLine: {
      "1": notServing,
      "7": {
        status: "unknown",
        destinationStopId: "",
        destinationStopSequence: null,
      },
    },
    arrivals: [
      { lineref: "1", monitored: false, aimeddeparturetime: now + 120 },
      { lineref: "7", monitored: false, aimeddeparturetime: now + 300 },
    ],
  });

  expect(
    screen.getByText("Couldn’t check where these buses go")
  ).toBeInTheDocument();
  expect(screen.queryByText(/None of the buses/)).not.toBeInTheDocument();
});

test("says it is checking while the trips are looked up", () => {
  const now = Math.floor(Date.now() / 1000);

  renderAnswer({
    state: "loading",
    fitsByLine: {},
    arrivals: [
      { lineref: "1", monitored: false, aimeddeparturetime: now + 120 },
    ],
  });

  expect(
    screen.getByText("Checking which buses go to Home stop…")
  ).toBeInTheDocument();
});

test("keeps its answer up while the board checks a new bus", () => {
  const now = Math.floor(Date.now() / 1000);

  renderAnswer({
    state: "loading",
    // The 18 was checked before; the 1 has just come onto the board.
    fitsByLine: { "18": goesHome(10 * 60) },
    arrivals: [
      { lineref: "1", monitored: false, aimeddeparturetime: now + 120 },
      { lineref: "18", monitored: false, aimeddeparturetime: now + 300 },
    ],
  });

  expect(
    screen.getByText(`To Home stop: line 18 at ${formatClock(now + 300)}`)
  ).toBeInTheDocument();
  expect(screen.queryByText(/Checking which buses/)).not.toBeInTheDocument();
});
