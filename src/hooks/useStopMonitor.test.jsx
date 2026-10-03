import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchStopMonitor } from "../api/foliApi";
import useStopMonitor, { pollDelayMs } from "./useStopMonitor";

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: vi.fn(),
}));

function Harness({ stopId }) {
  const { stopName, error, receivedAtMs, refresh } = useStopMonitor(stopId);

  return (
    <div>
      <span>{stopName}</span>
      <span data-testid="error">{String(error)}</span>
      <span data-testid="received-at">{String(receivedAtMs)}</span>
      <button type="button" onClick={() => refresh()}>
        Refresh
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchStopMonitor).mockReset();
});

test("stays idle and makes no realtime request before a stop is selected", async () => {
  render(<Harness stopId="" />);

  await Promise.resolve();
  expect(fetchStopMonitor).not.toHaveBeenCalled();
  expect(screen.getByTestId("error")).toHaveTextContent("false");
});

test("never renders previous-stop data under a new stop ID", async () => {
  let resolveSecondRequest;

  vi.mocked(fetchStopMonitor)
    .mockResolvedValueOnce({
      stopName: "Kauppatori",
      arrivals: [{ lineref: "1" }],
      serverTime: 100,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondRequest = resolve;
        })
    );

  const { rerender } = render(<Harness stopId="164" />);

  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();

  rerender(<Harness stopId="32" />);

  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();

  resolveSecondRequest({
    stopName: "New stop",
    arrivals: [],
    serverTime: 200,
  });

  expect(await screen.findByText("New stop")).toBeInTheDocument();
});

test("keeps same-stop data when a refresh temporarily fails", async () => {
  vi.mocked(fetchStopMonitor)
    .mockResolvedValueOnce({
      stopName: "Kauppatori",
      arrivals: [{ lineref: "1" }],
      serverTime: 100,
    })
    .mockRejectedValueOnce(new Error("temporary outage"));

  render(<Harness stopId="164" />);

  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });

  expect(screen.getByText("Kauppatori")).toBeInTheDocument();
});


test("records when the last successful realtime payload was received", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  vi.mocked(fetchStopMonitor).mockResolvedValueOnce({
    stopName: "Kauppatori",
    arrivals: [],
    serverTime: 1_700_000_000,
  });

  render(<Harness stopId="164" />);

  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();
  expect(screen.getByTestId("received-at")).toHaveTextContent(
    "1700000000000"
  );
});


test("backs off repeated automatic retries without exceeding five minutes", () => {
  expect(pollDelayMs(0)).toBe(30_000);
  expect(pollDelayMs(1)).toBe(30_000);
  expect(pollDelayMs(2)).toBe(60_000);
  expect(pollDelayMs(3)).toBe(120_000);
  expect(pollDelayMs(4)).toBe(240_000);
  expect(pollDelayMs(5)).toBe(300_000);
  expect(pollDelayMs(20)).toBe(300_000);
});

test("refreshes on foreground return but not while hidden, and cleans up the listener", async () => {
  let visibility = "hidden";
  const visibilitySpy = vi
    .spyOn(document, "visibilityState", "get")
    .mockImplementation(() => visibility);

  vi.mocked(fetchStopMonitor).mockResolvedValue({
    stopName: "Kauppatori",
    arrivals: [],
    serverTime: 100,
  });

  const { unmount } = render(<Harness stopId="164" />);
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(1);

  fireEvent(document, new globalThis.Event("visibilitychange"));
  await Promise.resolve();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(1);

  visibility = "visible";
  fireEvent(document, new globalThis.Event("visibilitychange"));
  await waitFor(() => {
    expect(fetchStopMonitor).toHaveBeenCalledTimes(2);
  });

  unmount();
  fireEvent(document, new globalThis.Event("visibilitychange"));
  await Promise.resolve();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(2);

  visibilitySpy.mockRestore();
});


test("refreshes immediately when connectivity returns while visible and removes the listener on unmount", async () => {
  const visibilitySpy = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");

  vi.mocked(fetchStopMonitor).mockResolvedValue({
    stopName: "Kauppatori",
    arrivals: [],
    serverTime: 100,
  });

  const { unmount } = render(<Harness stopId="164" />);
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(1);

  fireEvent(window, new globalThis.Event("online"));
  await waitFor(() => {
    expect(fetchStopMonitor).toHaveBeenCalledTimes(2);
  });

  unmount();
  fireEvent(window, new globalThis.Event("online"));
  await Promise.resolve();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(2);

  visibilitySpy.mockRestore();
});

test("does not issue a foreground refresh on online while the document is hidden", async () => {
  const visibilitySpy = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");

  vi.mocked(fetchStopMonitor).mockResolvedValue({
    stopName: "Kauppatori",
    arrivals: [],
    serverTime: 100,
  });

  const { unmount } = render(<Harness stopId="164" />);
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();

  fireEvent(window, new globalThis.Event("online"));
  await Promise.resolve();
  expect(fetchStopMonitor).toHaveBeenCalledTimes(1);

  unmount();
  visibilitySpy.mockRestore();
});

const SNAPSHOT_KEY = "foli-last-departures-v1";

function seedSnapshot(stopId, { ageMs = 60_000, stopName = "Kauppatori" } = {}) {
  localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({
      [stopId]: {
        stopName,
        arrivals: [{ lineref: "1" }],
        serverTime: 1_900_000_000,
        receivedAtMs: Date.now() - ageMs,
      },
    })
  );
}

test("reopening offline shows the recent board for the same stop", async () => {
  seedSnapshot("164");
  vi.mocked(fetchStopMonitor).mockRejectedValue(new Error("offline"));

  render(<Harness stopId="164" />);

  // Available before the failed request even settles.
  expect(screen.getByText("Kauppatori")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });
  expect(screen.getByText("Kauppatori")).toBeInTheDocument();
});

test("ignores a board old enough to be misleading", async () => {
  seedSnapshot("164", { ageMs: 16 * 60_000 });
  vi.mocked(fetchStopMonitor).mockRejectedValue(new Error("offline"));

  render(<Harness stopId="164" />);

  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });
  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
});

test("never seeds one stop from another stop's stored board", async () => {
  seedSnapshot("164");
  vi.mocked(fetchStopMonitor).mockRejectedValue(new Error("offline"));

  render(<Harness stopId="32" />);

  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });
  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
});

test("stores each successful board, keeping only the most recent stops", async () => {
  vi.mocked(fetchStopMonitor).mockResolvedValue({
    stopName: "Kauppatori",
    arrivals: [{ lineref: "1" }],
    serverTime: 1_900_000_000,
  });

  render(<Harness stopId="164" />);
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();

  const stored = JSON.parse(localStorage.getItem(SNAPSHOT_KEY));
  expect(stored["164"]).toMatchObject({
    stopName: "Kauppatori",
    arrivals: [{ lineref: "1" }],
    serverTime: 1_900_000_000,
  });
  expect(Number(stored["164"].receivedAtMs)).toBeGreaterThan(0);
});

// About says boards stay "for up to 15 minutes": an older one waited in
// storage until five newer boards pushed it out.
test("drops boards past their 15 minutes when it stores a new one", async () => {
  seedSnapshot("32", { ageMs: 16 * 60_000, stopName: "Puistokatu" });
  vi.mocked(fetchStopMonitor).mockResolvedValue({
    stopName: "Kauppatori",
    arrivals: [{ lineref: "1" }],
    serverTime: 1_900_000_000,
  });

  render(<Harness stopId="164" />);
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();

  expect(Object.keys(JSON.parse(localStorage.getItem(SNAPSHOT_KEY)))).toEqual([
    "164",
  ]);
});

test("discards a stored board that claims to come from the future", async () => {
  seedSnapshot("164", { ageMs: -60_000 });
  vi.mocked(fetchStopMonitor).mockRejectedValue(new Error("offline"));

  render(<Harness stopId="164" />);

  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });
});

function ArrivalsHarness({ stopId }) {
  const { arrivals } = useStopMonitor(stopId);
  return <span data-testid="lines">{arrivals.map((row) => row.lineref).join(",")}</span>;
}

test("skips a saved departure that is not a departure instead of crashing on it", async () => {
  localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({
      164: {
        stopName: "Kauppatori",
        arrivals: [null, "1", { lineref: "7" }],
        serverTime: 1_900_000_000,
        receivedAtMs: Date.now() - 60_000,
      },
    })
  );
  vi.mocked(fetchStopMonitor).mockReturnValue(new Promise(() => {}));

  render(<ArrivalsHarness stopId="164" />);

  expect(screen.getByTestId("lines")).toHaveTextContent("7");
});

function FlagsHarness({ stopId }) {
  const { scheduleFailed, scheduleIncomplete } = useStopMonitor(stopId);
  return (
    <div>
      <span data-testid="schedule-failed">{String(scheduleFailed)}</span>
      <span data-testid="schedule-incomplete">{String(scheduleIncomplete)}</span>
    </div>
  );
}

// A quiet stop whose timetable could not be checked, reopened. Stored without
// these, its empty board came back as "No upcoming departures".
test("a reopened board still knows its timetable could not be checked", async () => {
  vi.mocked(fetchStopMonitor).mockResolvedValueOnce({
    stopName: "Kauppatori",
    arrivals: [],
    serverTime: 1_900_000_000,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: true,
    scheduleIncomplete: true,
  });

  const first = render(<FlagsHarness stopId="164" />);
  await waitFor(() => {
    expect(screen.getByTestId("schedule-failed")).toHaveTextContent("true");
  });
  first.unmount();

  vi.mocked(fetchStopMonitor).mockReturnValue(new Promise(() => {}));
  render(<FlagsHarness stopId="164" />);

  expect(screen.getByTestId("schedule-failed")).toHaveTextContent("true");
  expect(screen.getByTestId("schedule-incomplete")).toHaveTextContent("true");
});

// Switching stops cancels the old stop's request, however that request then
// surfaces. It is neither a failure of the new stop nor its answer.
test("a request cancelled by a stop switch does not fail the new stop", async () => {
  vi.mocked(fetchStopMonitor).mockImplementation((stopId, signal) =>
    stopId === "621"
      ? new Promise((resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("Föli departure data is unavailable."))
          );
        })
      : Promise.resolve({
          stopName: "Puistokatu",
          arrivals: [],
          serverTime: 1_900_000_000,
        })
  );

  const { rerender } = render(<Harness stopId="621" />);
  rerender(<Harness stopId="32" />);

  expect(await screen.findByText("Puistokatu")).toBeInTheDocument();
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByTestId("error")).toHaveTextContent("false");
});

test("an answer that arrives after a stop switch is not applied", async () => {
  let resolveOld;
  vi.mocked(fetchStopMonitor).mockImplementation((stopId) =>
    stopId === "164"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({
          stopName: "Puistokatu",
          arrivals: [],
          serverTime: 1_900_000_000,
        })
  );

  const { rerender } = render(<Harness stopId="164" />);
  rerender(<Harness stopId="32" />);
  expect(await screen.findByText("Puistokatu")).toBeInTheDocument();

  await act(async () => {
    resolveOld({ stopName: "Kauppatori", arrivals: [], serverTime: 1_900_000_000 });
  });

  expect(screen.getByText("Puistokatu")).toBeInTheDocument();
  expect(screen.queryByText("Kauppatori")).not.toBeInTheDocument();
});

// A focused Refresh button changed its name to "Refreshing…" and back on
// every half-minute poll, and a screen reader read it out each time.
test("only a refresh the passenger asks for says it is refreshing", async () => {
  vi.useFakeTimers();
  try {
    let resolvePoll;
    vi.mocked(fetchStopMonitor)
      .mockResolvedValueOnce({ stopName: "Kauppatori", arrivals: [], serverTime: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve; }))
      .mockImplementation(() => new Promise(() => {}));
    const seen = [];
    function Probe() {
      const { refreshing, refresh } = useStopMonitor("164");
      seen.push(refreshing);
      return (
        <button type="button" onClick={() => refresh()}>
          Refresh
        </button>
      );
    }
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchStopMonitor).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(false);
    expect(seen).not.toContain(true);

    await act(async () => {
      resolvePoll({ stopName: "Kauppatori", arrivals: [], serverTime: 2 });
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });
    expect(seen.at(-1)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

// During an outage every half-minute retry took "Couldn't load departures"
// off the board for up to the request timeout, then put it back, and a
// screen reader announced it afresh each time.
test("an outage message stays up while a quiet retry is on its way, and clears on success", async () => {
  const visibilitySpy = vi
    .spyOn(document, "visibilityState", "get")
    .mockImplementation(() => "visible");
  let answer;
  vi.mocked(fetchStopMonitor)
    .mockRejectedValueOnce(new Error("Föli down"))
    .mockImplementationOnce(
      () => new Promise((resolve) => {
        answer = resolve;
      })
    );

  render(<Harness stopId="164" />);
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });

  // A foreground return runs the same quiet refresh as the poll.
  fireEvent(document, new globalThis.Event("visibilitychange"));
  await waitFor(() => expect(fetchStopMonitor).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("error")).toHaveTextContent("true");

  await act(async () => {
    answer({ stopName: "Kauppatori", arrivals: [], serverTime: 100 });
  });
  expect(await screen.findByText("Kauppatori")).toBeInTheDocument();
  expect(screen.getByTestId("error")).toHaveTextContent("false");

  visibilitySpy.mockRestore();
});

test("a retry the passenger asks for clears the outage message while it tries", async () => {
  vi.mocked(fetchStopMonitor)
    .mockRejectedValueOnce(new Error("Föli down"))
    .mockReturnValueOnce(new Promise(() => {}));

  render(<Harness stopId="164" />);
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("true");
  });

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => {
    expect(screen.getByTestId("error")).toHaveTextContent("false");
  });
});
