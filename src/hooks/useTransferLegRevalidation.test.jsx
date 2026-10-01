import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
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
    expect.any(globalThis.AbortSignal),
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


test("inactive journey shapes never schedule provider work and manual refresh is a no-op", async () => {
  for (const inactiveJourney of [
    null,
    { ...journey, transferLeg: 2 },
    {
      ...journey,
      transferPlan: {
        ...journey.transferPlan,
        second: { ...journey.transferPlan.second, boardStopId: "" },
      },
    },
  ]) {
    const { result, unmount } = renderHook(() =>
      useTransferLegRevalidation({
        enabled: true,
        journey: inactiveJourney,
      })
    );

    expect(result.current.providerState).toBe("idle");
    await expect(result.current.refresh()).resolves.toBeNull();
    unmount();
  }

  expect(mocks.fetchStopMonitor).not.toHaveBeenCalled();
});

test("the 30-second poll skips hidden tabs and online wake-up refreshes immediately when visible", async () => {
  const timeoutSpy = vi.spyOn(window, "setTimeout");
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");

  const { result, unmount } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    })
  );

  await waitFor(() => expect(result.current.providerState).toBe("live"));
  expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1);

  const firstPoll = timeoutSpy.mock.calls.find(
    ([callback, delay]) =>
      typeof callback === "function" && delay === 30_000
  )?.[0];
  expect(firstPoll).toEqual(expect.any(Function));

  visibility.mockReturnValue("hidden");
  await act(async () => {
    await firstPoll();
  });
  expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1);
  expect(
    timeoutSpy.mock.calls.filter(([, delay]) => delay === 30_000).length
  ).toBeGreaterThanOrEqual(2);

  act(() => {
    document.dispatchEvent(new globalThis.Event("visibilitychange"));
  });
  expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1);

  visibility.mockReturnValue("visible");
  const visiblePoll = timeoutSpy.mock.calls
    .filter(([callback, delay]) =>
      typeof callback === "function" && delay === 30_000
    )
    .at(-1)?.[0];
  expect(visiblePoll).toEqual(expect.any(Function));

  await act(async () => {
    await visiblePoll();
  });
  await waitFor(() => expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(2));

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });
  await waitFor(() => expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(3));

  unmount();
  visibility.mockRestore();
});

test("unmounting a pending refresh aborts it and never schedules another poll", async () => {
  let requestSignal = null;
  mocks.fetchStopMonitor.mockImplementation((_stopId, signal) => {
    requestSignal = signal;
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
  });

  const { unmount } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
    })
  );

  await waitFor(() => expect(requestSignal).not.toBeNull());
  const timeoutSpy = vi.spyOn(window, "setTimeout");

  await act(async () => {
    unmount();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(requestSignal.aborted).toBe(true);
  expect(
    timeoutSpy.mock.calls.some(([, delay]) => delay === 30_000)
  ).toBe(false);
});

test.each(["CanceledError", "AbortError"])(
  "%s from the provider adapter is treated as cancellation, not degraded evidence",
  async (errorName) => {
    const adapterError = Object.assign(new Error("cancelled request"), {
      name: errorName,
    });
    mocks.fetchStopMonitor.mockRejectedValue(adapterError);

    const { result } = renderHook(() =>
      useTransferLegRevalidation({
        enabled: true,
        journey,
      })
    );

    await waitFor(() => expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.providerState).not.toBe("degraded");
    expect(result.current.decision).toBe("unknown");
  }
);

test("sparse optional occurrence anchors still form an active watcher identity", async () => {
  const sparse = {
    ...journey,
    transferPlan: {
      ...journey.transferPlan,
      second: {
        ...journey.transferPlan.second,
        aimedDepartureAt: null,
        originAimedDepartureAt: null,
      },
    },
  };

  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey: sparse,
      incomingArrivalAt: 1_600,
    })
  );

  await waitFor(() => expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1));
  expect(result.current.providerState).not.toBe("idle");
});


test("a superseded second-leg response cannot overwrite the newer refresh", async () => {
  let resolveFirst;
  const first = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const fresh = {
    arrivals: [
      {
        tripref: "second",
        lineref: "7",
        monitored: true,
        vehicleatstop: false,
        recordedattime: 1_720,
        originaimeddeparturetime: 1_800,
        aimeddeparturetime: 2_000,
        expecteddeparturetime: 2_090,
      },
    ],
    serverTime: 1_730,
    realtimeAvailable: true,
    scheduleAvailable: false,
    scheduleFailed: false,
    scheduleIncomplete: false,
  };

  mocks.fetchStopMonitor
    .mockImplementationOnce(() => first)
    .mockResolvedValueOnce(fresh);

  const { result } = renderHook(() =>
    useTransferLegRevalidation({
      enabled: true,
      journey,
      incomingArrivalAt: 1_600,
      incomingLiveState: "live",
    })
  );

  await waitFor(() => expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(1));

  let manualResult;
  await act(async () => {
    manualResult = await result.current.refresh();
  });
  expect(manualResult).toBe(true);

  await act(async () => {
    resolveFirst({
      ...fresh,
      arrivals: [
        {
          ...fresh.arrivals[0],
          expecteddeparturetime: 2_300,
        },
      ],
    });
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.departureAt).toBe(2_090));
  expect(mocks.fetchStopMonitor).toHaveBeenCalledTimes(2);
});
