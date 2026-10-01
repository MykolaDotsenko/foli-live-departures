import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStopMonitor: vi.fn(),
  reportProviderReached: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchStopMonitor: mocks.fetchStopMonitor,
}));

vi.mock("./useOnlineStatus", () => ({
  reportProviderReached: mocks.reportProviderReached,
}));

import useTransferLegRevalidation from "./useTransferLegRevalidation";

const journey = {
  phase: "waiting",
  transferLeg: 1,
  transferPlan: {
    first: { arrivalAt: 1_600 },
    transfer: {
      alightStopId: "500",
      boardStopId: "501",
      walkingDistanceM: 0,
      feasibility: {
        state: "comfortable",
        recommendable: true,
      },
    },
    second: {
      tripRef: "second",
      lineRef: "7",
      boardStopId: "501",
      departureAt: 2_000,
      aimedDepartureAt: 2_000,
      originAimedDepartureAt: 1_800,
    },
  },
};

beforeEach(() => {
  mocks.fetchStopMonitor.mockReset();
  mocks.reportProviderReached.mockReset();
  mocks.fetchStopMonitor.mockResolvedValue({
    arrivals: [
      {
        tripref: "second",
        lineref: "7",
        monitored: true,
        vehicleatstop: false,
        recordedattime: 1_700,
        originaimeddeparturetime: 1_800,
        aimeddeparturetime: 2_000,
        expecteddeparturetime: 2_060,
      },
    ],
    serverTime: 1_720,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  });
});

test("does no provider work while no committed transfer is active", () => {
  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: false,
      journey,
    })
  );

  expect(result.current.providerState).toBe("idle");
  expect(mocks.fetchStopMonitor).not.toHaveBeenCalled();
});

test("polls the second boarding stop as live-only data", async () => {
  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    })
  );

  await waitFor(() => expect(result.current.providerState).toBe("live"));
  expect(mocks.fetchStopMonitor).toHaveBeenCalledWith(
    "501",
    expect.any(AbortSignal),
    { scheduleFallback: false }
  );
  expect(result.current.departureAt).toBe(2_060);
  expect(mocks.reportProviderReached).toHaveBeenCalled();
});

test("provider failure is degraded rather than false missed", async () => {
  mocks.fetchStopMonitor.mockRejectedValue(new Error("temporary outage"));

  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    })
  );

  await waitFor(() => expect(result.current.providerState).toBe("degraded"));
  expect(result.current.decision).toBe("unknown");
});

test("cancellation can fail the connection even when SIRI has no row", async () => {
  mocks.fetchStopMonitor.mockResolvedValue({
    arrivals: [],
    serverTime: 1_800,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  });

  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
      cancelled: true,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    })
  );

  await waitFor(() => expect(result.current.decision).toBe("cancelled"));
  expect(result.current.providerState).toBe("cancelled");
});

test("aborts the second-leg request on unmount", async () => {
  let signal = null;
  mocks.fetchStopMonitor.mockImplementation((_stopId, requestSignal) => {
    signal = requestSignal;
    return new Promise(() => {});
  });

  const { unmount } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
    })
  );

  await waitFor(() => expect(signal).not.toBeNull());
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});
