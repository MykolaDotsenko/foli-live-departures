import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAlerts: vi.fn(),
  fetchStopServedRouteIds: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchAlerts: mocks.fetchAlerts,
  fetchStopServedRouteIds: mocks.fetchStopServedRouteIds,
}));

import useStopAlerts from "./useStopAlerts";
import { reportProviderReached } from "./useOnlineStatus";

const routesById = new Map([["50", { id: "50", shortName: "50" }]]);
const noLines = [];

beforeEach(() => {
  mocks.fetchAlerts.mockReset();
  mocks.fetchStopServedRouteIds.mockReset();
  mocks.fetchAlerts.mockResolvedValue({
    messages: [
      {
        message_id: 50,
        isactive: true,
        priority: 500,
        affected_routes: ["50"],
        affected_stops: [],
        header: "Line 50 stop moved",
      },
    ],
  });
});

// The routes found to serve one stop were kept while the next stop's lookup
// ran, so a line-50 notice stayed on screen under a stop line 50 never
// serves: data from one stop shown under another.
test("never shows the previous stop's route notices under a new stop", async () => {
  mocks.fetchStopServedRouteIds.mockImplementation((stopId) =>
    stopId === "164" ? Promise.resolve(new Set(["50"])) : new Promise(() => {})
  );

  const { result, rerender } = renderHook(
    ({ stopId }) => useStopAlerts(stopId, noLines, routesById),
    { initialProps: { stopId: "164" } }
  );

  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Line 50 stop moved",
    ])
  );

  rerender({ stopId: "32" });

  expect(result.current.alerts).toEqual([]);
});

test("shows a route notice once the new stop is confirmed to be on that route", async () => {
  mocks.fetchStopServedRouteIds.mockResolvedValue(new Set(["50"]));

  const { result } = renderHook(() =>
    useStopAlerts("32", noLines, routesById)
  );

  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Line 50 stop moved",
    ])
  );
});

// Started offline, the notices, cancellations among them, waited up to
// five minutes after the connection came back.
test("checks the notices again as soon as the connection comes back", async () => {
  mocks.fetchStopServedRouteIds.mockResolvedValue(new Set(["50"]));
  mocks.fetchAlerts.mockRejectedValueOnce(new Error("offline"));

  const { result } = renderHook(() => useStopAlerts("164", noLines, routesById));
  await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalledTimes(1));
  expect(result.current.alerts).toEqual([]);

  window.dispatchEvent(new globalThis.Event("online"));

  await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Line 50 stop moved",
    ])
  );
});

// A check can fail while the phone stays online. The board recovered within
// 30 seconds; the cancellations waited for the five-minute timer.
test("checks failed notices again once Föli answers the board", async () => {
  mocks.fetchStopServedRouteIds.mockResolvedValue(new Set(["50"]));
  mocks.fetchAlerts.mockRejectedValueOnce(new Error("timeout"));

  const { result } = renderHook(() => useStopAlerts("164", noLines, routesById));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(mocks.fetchAlerts).toHaveBeenCalledTimes(1);

  reportProviderReached();

  await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Line 50 stop moved",
    ])
  );

  // Once they are current, the board's answers do not ask again.
  reportProviderReached();
  expect(mocks.fetchAlerts).toHaveBeenCalledTimes(2);
});


test("a superseded alert request cannot mark a newer successful refresh as failed", async () => {
  mocks.fetchStopServedRouteIds.mockResolvedValue(new Set(["50"]));

  let calls = 0;
  mocks.fetchAlerts.mockImplementation((signal) => {
    calls += 1;

    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("superseded request")),
          { once: true }
        );
      });
    }

    return Promise.resolve({
      messages: [
        {
          message_id: 51,
          isactive: true,
          priority: 500,
          affected_routes: ["50"],
          affected_stops: [],
          header: "Fresh notice",
        },
      ],
    });
  });

  const { result } = renderHook(() =>
    useStopAlerts("164", noLines, routesById)
  );

  await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalledTimes(1));

  window.dispatchEvent(new globalThis.Event("online"));

  await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.receivedAtMs).not.toBeNull());
  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Fresh notice",
    ])
  );

  // The first request was deliberately aborted by the second one. Even if
  // that aborted adapter surfaces a generic Error instead of CanceledError,
  // it is not a failed provider check and must not overwrite the successful
  // refresh state.
  expect(result.current.error).toBe(false);
});


test("keeps the last successful cancellation when a later alerts refresh fails", async () => {
  const cancellationPayload = {
    cancellations: [
      {
        id: "cancel-50",
        line: "50",
        departure: 1_900_000_000,
        stops: [
          {
            stop: "164",
            arrival: 1_900_000_600,
            isactive: true,
          },
        ],
      },
    ],
    messages: [],
  };

  mocks.fetchAlerts
    .mockResolvedValueOnce(cancellationPayload)
    .mockRejectedValueOnce(new Error("temporary alerts outage"));

  const { result } = renderHook(() =>
    useStopAlerts("164", noLines, routesById)
  );

  await waitFor(() =>
    expect(result.current.alerts).toEqual([
      expect.objectContaining({
        type: "cancellation",
        line: "50",
        scheduledTime: 1_900_000_600,
        originDepartureTime: 1_900_000_000,
      }),
    ])
  );

  const firstReceivedAt = result.current.receivedAtMs;
  expect(firstReceivedAt).toEqual(expect.any(Number));

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await waitFor(() => expect(result.current.error).toBe(true));
  expect(mocks.fetchAlerts).toHaveBeenCalledTimes(2);

  // A failed refresh must not make a known cancelled departure look live
  // again while the previous successful alerts payload is still the best
  // information we have.
  expect(result.current.alerts).toEqual([
    expect.objectContaining({
      type: "cancellation",
      line: "50",
      scheduledTime: 1_900_000_600,
      originDepartureTime: 1_900_000_000,
    }),
  ]);
  expect(result.current.receivedAtMs).toBe(firstReceivedAt);
});

test("aborts an in-flight alerts request when the consumer unmounts", () => {
  let signal = null;
  mocks.fetchAlerts.mockImplementation((requestSignal) => {
    signal = requestSignal;
    return new Promise((_resolve, reject) => {
      requestSignal.addEventListener(
        "abort",
        () =>
          reject(
            new globalThis.DOMException(
              "The operation was aborted.",
              "AbortError"
            )
          ),
        { once: true }
      );
    });
  });

  const { unmount } = renderHook(() =>
    useStopAlerts("164", noLines, routesById)
  );

  expect(signal).not.toBeNull();
  expect(signal.aborted).toBe(false);

  unmount();

  expect(signal.aborted).toBe(true);
});

// Route-membership enrichment must never outlive the stop selection that started it.\ntest("aborts the previous stop-membership lookup when the selected stop changes", async () => {
  const membershipSignals = [];
  mocks.fetchStopServedRouteIds.mockImplementation(
    (_stopId, _routeIds, signal) => {
      membershipSignals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () =>
            reject(
              new globalThis.DOMException(
                "The operation was aborted.",
                "AbortError"
              )
            ),
          { once: true }
        );
      });
    }
  );

  const { rerender } = renderHook(
    ({ stopId }) => useStopAlerts(stopId, noLines, routesById),
    { initialProps: { stopId: "164" } }
  );

  await waitFor(() => expect(membershipSignals).toHaveLength(1));
  expect(membershipSignals[0].aborted).toBe(false);

  rerender({ stopId: "32" });

  await waitFor(() => expect(membershipSignals).toHaveLength(2));
  expect(membershipSignals[0].aborted).toBe(true);
  expect(membershipSignals[1].aborted).toBe(false);
});

test("a realtime line match does not wait for static membership enrichment", async () => {
  mocks.fetchStopServedRouteIds.mockImplementation(() => new Promise(() => {}));

  const { result } = renderHook(() =>
    useStopAlerts("164", ["50"], routesById)
  );

  await waitFor(() =>
    expect(result.current.alerts.map((alert) => alert.title)).toEqual([
      "Line 50 stop moved",
    ])
  );

  // The active line already proves relevance, so no optional GTFS membership
  // request is needed before the disruption can reach the passenger.
  expect(mocks.fetchStopServedRouteIds).not.toHaveBeenCalled();
});
