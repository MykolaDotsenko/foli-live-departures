import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchStopMonitor: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchStopServedRouteIds: vi.fn(),
}));

vi.mock("../api/foliApi", async () => {
  const actual = await vi.importActual("../api/foliApi");
  return {
    ...actual,
    fetchStopMonitor: api.fetchStopMonitor,
    fetchAlerts: api.fetchAlerts,
    fetchStopServedRouteIds: api.fetchStopServedRouteIds,
  };
});

import useFutureLegRevalidations from "./useFutureLegRevalidations";

function leg(id, line, board, exit, departureAt, arrivalAt) {
  return {
    tripRef: id,
    lineRef: line,
    boardStopId: board,
    exitStopId: exit,
    departureAt,
    arrivalAt,
    aimedDepartureAt: departureAt,
    originAimedDepartureAt: departureAt - 100,
    liveState: "schedule",
  };
}

const journey = {
  id: "multi",
  phase: "waiting",
  activeLegIndex: 0,
  itinerary: {
    legs: [
      leg("one", "1", "100", "500", 1_000, 1_300),
      leg("two", "7", "500", "700", 1_700, 2_000),
      leg("three", "18", "700", "900", 2_400, 2_800),
    ],
    transfers: [
      {
        alightStopId: "500",
        boardStopId: "500",
        walkingDistanceM: 0,
      },
      {
        alightStopId: "700",
        boardStopId: "700",
        walkingDistanceM: 0,
      },
    ],
  },
};

beforeEach(() => {
  api.fetchStopMonitor.mockReset().mockImplementation(async (stopId) => ({
    arrivals: [
      {
        tripref: stopId === "500" ? "two" : "three",
        lineref: stopId === "500" ? "7" : "18",
        monitored: true,
        recordedattime: 1_200,
        aimeddeparturetime: stopId === "500" ? 1_700 : 2_400,
        expecteddeparturetime: stopId === "500" ? 1_760 : 2_460,
        originaimeddeparturetime: stopId === "500" ? 1_600 : 2_300,
      },
    ],
    serverTime: 1_210,
  }));
  api.fetchAlerts.mockReset().mockResolvedValue({
    messages: [],
    events: [],
  });
  api.fetchStopServedRouteIds.mockReset().mockResolvedValue(new Set());
});

test("watches both committed future legs with live-only SIRI", async () => {
  const { result } = renderHook(() =>
    useFutureLegRevalidations({
      journey,
      routesById: new Map(),
    })
  );

  await waitFor(() => expect(result.current.states).toHaveLength(2));
  expect(
    api.fetchStopMonitor.mock.calls.map(([stopId]) => stopId).sort()
  ).toEqual(["500", "700"]);
  for (const call of api.fetchStopMonitor.mock.calls) {
    expect(call[2]).toEqual({ scheduleFallback: false });
  }
  expect(result.current.states.map((entry) => entry.legIndex)).toEqual([1, 2]);
});

test("after advancing, only the remaining third leg stays active", async () => {
  const advanced = { ...journey, activeLegIndex: 1 };
  const { result } = renderHook(() =>
    useFutureLegRevalidations({
      journey: advanced,
      routesById: new Map(),
    })
  );

  await waitFor(() => expect(result.current.states).toHaveLength(1));
  expect(result.current.states[0].legIndex).toBe(2);
});
