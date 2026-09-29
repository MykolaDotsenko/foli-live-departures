import { act, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import BusStopDisplay from "./BusStopDisplay";
import { resetLanguageForTests } from "../i18n";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("uses official route identity while preserving readable contrast and live proximity", () => {
  const now = Math.floor(Date.now() / 1000);
  const routesByShortName = new Map([
    [
      "1",
      {
        id: "1",
        shortName: "1",
        longName: "Satama–Kauppatori–Lentoasema",
        type: 3,
        color: "#ffff00",
        textColor: "#ffffff",
      },
    ],
  ]);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }}
      routesByShortName={routesByShortName}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          latitude: 60.4538,
          longitude: 22.2666,
          recordedattime: now - 10,
          expecteddeparturetime: now + 180,
          aimeddeparturetime: now + 160,
        },
      ]}
    />
  );

  const lineBadge = screen.getByTitle("Satama–Kauppatori–Lentoasema");
  expect(lineBadge).toHaveAttribute(
    "title",
    "Satama–Kauppatori–Lentoasema"
  );
  expect(lineBadge).toHaveStyle({
    backgroundColor: "#ffff00",
    color: "#000000",
  });
  expect(screen.getByText(/Bus nearby/i)).toBeInTheDocument();
});


test("does not present an old vehicle position as current nearby status", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          latitude: 60.4538,
          longitude: 22.2666,
          recordedattime: now - 200,
          expecteddeparturetime: now + 180,
          aimeddeparturetime: now + 160,
        },
      ]}
    />
  );

  expect(screen.getByText(/Last bus position/i)).toHaveTextContent("3 min old");
  expect(screen.queryByText(/Bus nearby/i)).not.toBeInTheDocument();
});


test("drops already-departed and untimed rows instead of presenting them as Due", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "OLD",
          destinationdisplay: "Already gone",
          monitored: false,
          aimeddeparturetime: now - 180,
        },
        {
          lineref: "NONE",
          destinationdisplay: "Missing time",
          monitored: false,
        },
        {
          lineref: "NEXT",
          destinationdisplay: "Still useful",
          monitored: false,
          aimeddeparturetime: now + 300,
        },
      ]}
    />
  );

  expect(screen.queryByText("Already gone")).not.toBeInTheDocument();
  expect(screen.queryByText("Missing time")).not.toBeInTheDocument();
  expect(screen.getByText("Still useful")).toBeInTheDocument();
});


test("keeps aging a last successful payload while refreshes fail", () => {
  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const serverTime = nowSeconds - 180;

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }}
      routesByShortName={new Map()}
      serverTime={serverTime}
      receivedAtMs={nowMs - 180_000}
      loading={false}
      refreshing={false}
      error
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          latitude: 60.4538,
          longitude: 22.2666,
          recordedattime: serverTime - 10,
          expecteddeparturetime: nowSeconds + 300,
          aimeddeparturetime: nowSeconds + 280,
        },
      ]}
    />
  );

  expect(
    screen.getByText(/Live update failed.*last successful update 3 min ago/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/Live data · 3 min old/i)).toBeInTheDocument();
  expect(screen.getByText(/Last bus position/i)).toHaveTextContent("3 min old");
});


test("prefers provider vehicle-at-stop truth over geometric proximity", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori" }}
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          vehicleatstop: true,
          recordedattime: now - 10,
          expecteddeparturetime: now + 60,
        },
      ]}
    />
  );

  expect(screen.getByText("Bus is at the stop")).toBeInTheDocument();
});

function destinationBoard(arrival) {
  const now = Math.floor(Date.now() / 1000);

  return (
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          monitored: false,
          aimeddeparturetime: now + 300,
          ...arrival,
        },
      ]}
    />
  );
}

// The sign on the bus reads "Satama". A board that said only "Harbour" gave
// an English reader nothing to match against the bus pulling in.
test("leads with the destination the bus sign shows, the reader's language beside it", () => {
  render(
    destinationBoard({
      destinationdisplay: "Satama",
      destinationdisplay_en: "Harbour",
      destinationdisplay_sv: "Hamnen",
    })
  );

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.getByText("Harbour")).toHaveAttribute("lang", "en");
  expect(screen.queryByText("Hamnen")).not.toBeInTheDocument();
});

test("gives a Swedish reader the Swedish name beside the sign", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["sv-FI", "en"]);

  render(
    destinationBoard({
      destinationdisplay: "Satama",
      destinationdisplay_en: "Harbour",
      destinationdisplay_sv: "Hamnen",
    })
  );

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.getByText("Hamnen")).toHaveAttribute("lang", "sv");
  expect(screen.queryByText("Harbour")).not.toBeInTheDocument();
});

test("adds nothing in the Finnish interface or for a name that only repeats the sign", () => {
  resetLanguageForTests("fi");
  const { unmount } = render(
    destinationBoard({
      destinationdisplay: "Satama",
      destinationdisplay_en: "Harbour",
    })
  );
  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.queryByText("Harbour")).not.toBeInTheDocument();
  unmount();
  resetLanguageForTests("en");

  render(
    destinationBoard({
      destinationdisplay: "Runosmäki",
      destinationdisplay_en: "Runosmäki",
    })
  );
  expect(screen.getAllByText("Runosmäki")).toHaveLength(1);
});

// Someone who switched a Finnish phone to the English interface has said
// they would rather not read Finnish.
test("gives the English name beside the sign to an English reader on a Finnish phone", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["fi-FI", "en"]);
  try {
    render(
      destinationBoard({
        destinationdisplay: "Satama",
        destinationdisplay_en: "Harbour",
      })
    );

    expect(screen.getByText("Satama")).toBeInTheDocument();
    expect(screen.getByText("Harbour")).toHaveAttribute("lang", "en");
  } finally {
    vi.restoreAllMocks();
  }
});

test("falls back to a translated name when the sign text is missing", () => {
  render(destinationBoard({ destinationdisplay_en: "Harbour" }));

  expect(screen.getAllByText("Harbour")).toHaveLength(1);
});

test("keeps counting down between provider refreshes instead of freezing", () => {
  vi.useFakeTimers();

  const serverTime = 1_900_000_000;
  const receivedAtMs = Date.now();

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      serverTime={serverTime}
      receivedAtMs={receivedAtMs}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          expecteddeparturetime: serverTime + 300,
        },
      ]}
    />
  );

  expect(screen.getByText("5 min")).toBeInTheDocument();

  // No new payload arrives; only the clock moves.
  act(() => {
    vi.advanceTimersByTime(120_000);
  });

  expect(screen.getByText("3 min")).toBeInTheDocument();
});

// The last listed bus leaving says nothing about the next one: while it was
// ahead, the timetable was never asked. "No upcoming departures" stood there
// until the next poll, half a minute later.
test("drops a departure once it has left, and asks what comes next", () => {
  vi.useFakeTimers();

  const serverTime = 1_900_000_000;
  const receivedAtMs = Date.now();
  const onRefresh = vi.fn();
  const arrivals = [
    {
      lineref: "1",
      destinationdisplay: "Satama",
      monitored: true,
      expecteddeparturetime: serverTime + 60,
    },
  ];
  const props = {
    stopId: "164",
    stopName: "Kauppatori",
    serverTime,
    receivedAtMs,
    loading: false,
    refreshing: false,
    error: false,
    onRefresh,
    arrivals,
  };

  const { rerender } = render(<BusStopDisplay {...props} />);

  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(onRefresh).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(120_000);
  });

  expect(screen.queryByText("Satama")).not.toBeInTheDocument();
  expect(screen.getByText("Checking for the next departures…")).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
  expect(onRefresh).toHaveBeenCalledTimes(1);

  // The feed can keep listing a bus that has gone. Answering with it again
  // must not become a request loop.
  rerender(
    <BusStopDisplay
      {...props}
      serverTime={serverTime + 120}
      receivedAtMs={receivedAtMs + 120_000}
      arrivals={arrivals.map((arrival) => ({ ...arrival }))}
    />
  );
  expect(onRefresh).toHaveBeenCalledTimes(1);
});


test("shows scheduled departures when realtime is unavailable instead of an empty board", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="621"
      stopName="Takakirves"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      receivedAtMs={Date.now()}
      realtimeAvailable={false}
      scheduleAvailable
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "32",
          destinationdisplay: "Varissuo",
          monitored: false,
          aimeddeparturetime: now + 300,
        },
      ]}
    />
  );

  expect(screen.getByText("Varissuo")).toBeInTheDocument();
  expect(
    screen.getByText(/Live updates are unavailable.*showing scheduled Föli times/i)
  ).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("shows tomorrow's next scheduled service instead of an empty board", () => {
  const nowMs = Date.parse("2026-09-21T12:45:00Z");
  const now = Math.floor(nowMs / 1000);
  vi.spyOn(Date, "now").mockReturnValue(nowMs);

  render(
    <BusStopDisplay
      stopId="621"
      stopName="Takakirves"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      receivedAtMs={nowMs}
      realtimeAvailable
      scheduleAvailable
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "32",
          destinationdisplay: "Varissuo",
          monitored: false,
          aimeddeparturetime: Date.parse("2026-09-22T03:30:00Z") / 1000,
        },
      ]}
    />
  );

  expect(screen.getByText("Varissuo")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Tomorrow 06:30" })).toBeInTheDocument();
  expect(
    screen.getByText(/No live departure is published right now.*next scheduled Föli times/i)
  ).toBeInTheDocument();
  expect(screen.queryByText("No upcoming departures.")).not.toBeInTheDocument();
});

test("keeps a future planned row visible when its realtime estimate has gone stale", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="621"
      stopName="Takakirves"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "32",
          destinationdisplay: "Varissuo",
          monitored: true,
          expecteddeparturetime: now - 120,
          aimeddeparturetime: now + 300,
        },
      ]}
    />
  );

  expect(screen.getByText("Varissuo")).toBeInTheDocument();
  expect(screen.getByText("5 min")).toBeInTheDocument();
});

// Line 1's yellow is 1.07:1 against the white row, so the badge had no
// visible edge at all: only the black number floated there.
test("outlines a line badge too light to stand out from the row", () => {
  const now = Math.floor(Date.now() / 1000);
  const routes = new Map([
    ["1", { id: "1", shortName: "1", color: "#ffff00", textColor: "#000000" }],
    ["7", { id: "7", shortName: "7", color: "#007985", textColor: "#ffffff" }],
  ]);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesByShortName={routes}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        { lineref: "1", destinationdisplay: "Satama", aimeddeparturetime: now + 200 },
        { lineref: "7", destinationdisplay: "Runosmäki", aimeddeparturetime: now + 400 },
      ]}
    />
  );

  expect(screen.getByText("1").style.boxShadow).toContain("inset");
  expect(screen.getByText("7").style.boxShadow).toBe("");
});

// Föli can cancel a departure at a stop (ALERTS cancellations, active from
// about ten minutes before the planned arrival). The notice sat in Service
// updates while the same bus kept counting down on the board as if coming.
test("marks a departure Föli has cancelled at this stop instead of counting it down", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      onStartRide={() => {}}
      cancellations={[{ line: "1", scheduledTime: now + 240 }]}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: false,
          tripref: "trip-cancelled",
          aimedarrivaltime: now + 240,
          aimeddeparturetime: now + 240,
        },
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: false,
          tripref: "trip-running",
          aimedarrivaltime: now + 900,
          aimeddeparturetime: now + 900,
        },
      ]}
    />
  );

  const [cancelledRow, runningRow] = screen.getAllByRole("row").slice(1);
  expect(within(cancelledRow).getByText("Cancelled", { selector: "td" })).toBeInTheDocument();
  expect(
    within(cancelledRow).queryByRole("button", { name: "Get-off alert" })
  ).not.toBeInTheDocument();
  expect(within(runningRow).getByText("15 min")).toBeInTheDocument();
  expect(
    within(runningRow).getByRole("button", { name: "Get-off alert" })
  ).toBeInTheDocument();
});


test("a cancellation does not spill onto the next close departure of the same line", () => {
  const now = Math.floor(Date.now() / 1000);
  const cancelledOrigin = now - 1_200;
  const nextOrigin = cancelledOrigin + 60;

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      onStartRide={() => {}}
      cancellations={[
        {
          line: "1",
          scheduledTime: now + 240,
          originDepartureTime: cancelledOrigin,
        },
      ]}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: false,
          tripref: "trip-cancelled",
          originaimeddeparturetime: cancelledOrigin,
          aimedarrivaltime: now + 240,
          aimeddeparturetime: now + 240,
        },
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: false,
          tripref: "trip-running",
          originaimeddeparturetime: nextOrigin,
          aimedarrivaltime: now + 300,
          aimeddeparturetime: now + 300,
        },
      ]}
    />
  );

  const [cancelledRow, runningRow] = screen.getAllByRole("row").slice(1);

  expect(
    within(cancelledRow).getByText("Cancelled", { selector: "td" })
  ).toBeInTheDocument();
  expect(
    within(cancelledRow).queryByRole("button", { name: "Get-off alert" })
  ).not.toBeInTheDocument();

  expect(
    within(runningRow).queryByText("Cancelled", { selector: "td" })
  ).not.toBeInTheDocument();
  expect(
    within(runningRow).getByRole("button", { name: "Get-off alert" })
  ).toBeInTheDocument();
});


test("does not present undated physical vehicle telemetry as current proximity", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }}
      stops={[]}
      routesByShortName={new Map()}
      serverTime={now}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          monitored: true,
          vehicleatstop: true,
          latitude: 60.4518,
          longitude: 22.2666,
          recordedattime: null,
          expecteddeparturetime: now + 60,
          aimeddeparturetime: now + 50,
        },
      ]}
    />
  );

  expect(screen.queryByText("Bus is at the stop")).not.toBeInTheDocument();
  expect(screen.queryByText("Bus at or near stop")).not.toBeInTheDocument();
  expect(screen.queryByText(/Bus nearby/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Last bus position/i)).not.toBeInTheDocument();
});
