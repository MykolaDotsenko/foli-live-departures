import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDestinationAwareNearby: vi.fn(),
}));

vi.mock("./useDestinationAwareNearby", () => ({
  loadDestinationAwareNearby: mocks.loadDestinationAwareNearby,
}));

import useTransferRecoveryOptions, {
  loadTransferRecoveryOptions,
} from "./useTransferRecoveryOptions";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Destination",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const allStops = [
  { id: "500", name: "Hub A", lat: 60.45, lon: 22.26 },
  { id: "501", name: "Hub B", lat: 60.4503, lon: 22.2603 },
];

function journey(overrides = {}) {
  return {
    id: "selected-transfer",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    transferLeg: 2,
    tripRef: "failed-run",
    originAimedDepartureAt: 2_400,
    transferPlan: {
      transfer: {
        alightStopId: "500",
        boardStopId: "501",
      },
      second: {
        tripRef: "failed-run",
        lineRef: "7",
        originAimedDepartureAt: 2_400,
      },
    },
    ...overrides,
  };
}

function departure(tripRef, departureAt, origin = 2_400) {
  return {
    tripRef,
    lineRef: "7",
    destinationStopId: "900",
    departureAt,
    aimedDepartureAt: departureAt,
    originAimedDepartureAt: origin,
    destinationArrivalAt: departureAt + 600,
    journeyArrivalAt: departureAt + 600,
    catchability: "comfortable",
    liveState: "live",
    rideDurationSec: 600,
  };
}

beforeEach(() => {
  mocks.loadDestinationAwareNearby.mockReset();
});

test("loads direct recovery choices from the transfer area and removes the failed run before ranking", async () => {
  const failed = departure("failed-run", 2_700);
  const replacement = departure("replacement-run", 2_760, 2_500);

  mocks.loadDestinationAwareNearby.mockResolvedValue({
    "500": {
      stopId: "500",
      status: "good",
      best: failed,
      departures: [failed, replacement],
      additionalCount: 1,
      checkedAt: 1,
    },
  });

  const options = await loadTransferRecoveryOptions({
    journey: journey(),
    destination,
    allStops,
  });

  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledWith(
    expect.objectContaining({
      destination,
      positionAccuracy: 0,
      stops: expect.arrayContaining([
        expect.objectContaining({ id: "500", distanceMeters: 0 }),
      ]),
    })
  );
  expect(options).toHaveLength(1);
  expect(options[0]).toMatchObject({
    stopId: "500",
    departure: { tripRef: "replacement-run" },
  });
});

test("does not search from the transfer hub before authoritative arrival moved recovery to leg 2", async () => {
  await expect(
    loadTransferRecoveryOptions({
      journey: journey({ transferLeg: 1 }),
      destination,
      allStops,
    })
  ).resolves.toEqual([]);

  expect(mocks.loadDestinationAwareNearby).not.toHaveBeenCalled();
});

test("hook remains idle while disabled", () => {
  const { result } = renderHook(() =>
    useTransferRecoveryOptions({
      enabled: false,
      journey: journey(),
      destination,
      allStops,
    })
  );

  expect(result.current.state).toBe("idle");
  expect(result.current.options).toEqual([]);
  expect(mocks.loadDestinationAwareNearby).not.toHaveBeenCalled();
});

test("hook automatically publishes fresh recovery options without committing one", async () => {
  const replacement = departure("replacement-run", 2_760, 2_500);
  mocks.loadDestinationAwareNearby.mockResolvedValue({
    "500": {
      stopId: "500",
      status: "good",
      best: replacement,
      departures: [replacement],
      additionalCount: 0,
      checkedAt: 1,
    },
  });

  const { result, unmount } = renderHook(() =>
    useTransferRecoveryOptions({
      enabled: true,
      journey: journey(),
      destination,
      allStops,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.options).toHaveLength(1);
  expect(result.current.options[0].departure.tripRef).toBe("replacement-run");

  unmount();
});

test("provider failure clears stale choices and exposes an error state", async () => {
  mocks.loadDestinationAwareNearby.mockRejectedValue(new Error("down"));

  const { result, unmount } = renderHook(() =>
    useTransferRecoveryOptions({
      journey: journey(),
      destination,
      allStops,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("error"));
  expect(result.current.options).toEqual([]);

  unmount();
});


test("equivalent recovery updates keep visible options instead of restarting the search", async () => {
  const replacement = departure("replacement-run", 2_760, 2_500);
  mocks.loadDestinationAwareNearby.mockResolvedValue({
    "500": {
      stopId: "500",
      status: "good",
      best: replacement,
      departures: [replacement],
      additionalCount: 0,
      checkedAt: 1,
    },
  });

  const { result, rerender, unmount } = renderHook(
    ({ selected }) =>
      useTransferRecoveryOptions({
        enabled: true,
        journey: selected,
        destination,
        allStops,
      }),
    { initialProps: { selected: journey({ lastSeenAt: 1 }) } }
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.options).toHaveLength(1);
  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledTimes(1);

  rerender({ selected: journey({ lastSeenAt: 2 }) });

  expect(result.current.state).toBe("ready");
  expect(result.current.options).toHaveLength(1);
  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledTimes(1);

  unmount();
});

test("changing the authoritative recovery anchor resets stale choices and searches again", async () => {
  const first = departure("replacement-run", 2_760, 2_500);
  const second = departure("replacement-run-2", 2_820, 2_550);
  mocks.loadDestinationAwareNearby
    .mockResolvedValueOnce({
      "500": {
        stopId: "500",
        status: "good",
        best: first,
        departures: [first],
        additionalCount: 0,
        checkedAt: 1,
      },
    })
    .mockResolvedValueOnce({
      "501": {
        stopId: "501",
        status: "good",
        best: second,
        departures: [second],
        additionalCount: 0,
        checkedAt: 2,
      },
    });

  const { result, rerender, unmount } = renderHook(
    ({ selected }) =>
      useTransferRecoveryOptions({
        enabled: true,
        journey: selected,
        destination,
        allStops,
      }),
    { initialProps: { selected: journey() } }
  );

  await waitFor(() => expect(result.current.options[0]?.departure.tripRef).toBe("replacement-run"));

  rerender({
    selected: journey({
      stopId: "501",
      atStopConfirmedAt: 2_200_000,
    }),
  });

  await waitFor(() =>
    expect(result.current.options[0]?.departure.tripRef).toBe(
      "replacement-run-2"
    )
  );
  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledTimes(2);

  unmount();
});
