import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDestinationAwareNearby: vi.fn(),
  loadTransferJourneyOptions: vi.fn(),
}));

vi.mock("./useDestinationAwareNearby", () => ({
  loadDestinationAwareNearby: mocks.loadDestinationAwareNearby,
}));

vi.mock("./useTransferJourneyOptions", () => ({
  loadTransferJourneyOptions: mocks.loadTransferJourneyOptions,
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

function transitLeg(tripRef, boardStopId, exitStopId, origin = 2_400) {
  return {
    tripRef,
    lineRef: "7",
    boardStopId,
    boardStopSequence: 1,
    exitStopId,
    exitStopSequence: 2,
    departureAt: origin + 60,
    arrivalAt: origin + 600,
    aimedDepartureAt: origin + 60,
    originAimedDepartureAt: origin,
    liveState: "schedule",
  };
}

function journey(overrides = {}) {
  const first = transitLeg("first-run", "100", "500", 1_800);
  const failed = transitLeg("failed-run", "501", "900", 2_400);
  return {
    id: "selected-transfer",
    phase: "recovery",
    recoveryReason: "transfer-cancelled",
    activeLegIndex: 1,
    stopId: "501",
    atStopConfirmedAt: null,
    itinerary: {
      id: "itinerary",
      originStopId: "100",
      originStopName: "Origin",
      originDistanceMeters: 0,
      legs: [first, failed],
      transfers: [
        {
          alightStopId: "500",
          alightStopSequence: 8,
          boardStopId: "501",
          boardStopName: "Hub B",
          walkingDistanceM: 35,
          feasibility: { state: "comfortable", recommendable: true },
        },
      ],
      destinationStopId: "900",
      destinationArrivalAt: 3_000,
      finalWalkDistanceM: 0,
      finalWalkSecEstimate: 0,
      journeyArrivalAt: 3_000,
      totalWalkingDistanceM: 35,
      reliability: "medium",
    },
    futureLegRevalidations: {
      1: {
        providerState: "cancelled",
        decision: "cancelled",
        departureAt: null,
        feasibility: null,
        missingSinceMs: null,
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

function transferOption() {
  return {
    id: "replacement-transfer",
    originStopId: "500",
    originStopName: "Hub A",
    originDistanceMeters: 0,
    legs: [
      transitLeg("replacement-first", "500", "700", 2_500),
      transitLeg("replacement-second", "701", "900", 3_200),
    ],
    transfers: [
      {
        alightStopId: "700",
        alightStopSequence: 2,
        boardStopId: "701",
        boardStopName: "Hub C",
        walkingDistanceM: 20,
        feasibility: { state: "comfortable", recommendable: true },
      },
    ],
    destinationStopId: "900",
    destinationArrivalAt: 3_800,
    finalWalkDistanceM: 0,
    finalWalkSecEstimate: 0,
    journeyArrivalAt: 3_800,
    totalWalkingDistanceM: 20,
    reliability: "medium",
  };
}

beforeEach(() => {
  mocks.loadDestinationAwareNearby.mockReset();
  mocks.loadTransferJourneyOptions.mockReset();
  mocks.loadTransferJourneyOptions.mockResolvedValue([]);
});

test("loads direct and one-transfer recovery choices and excludes the failed run", async () => {
  const failed = departure("failed-run", 2_700);
  const replacement = departure("replacement-run", 2_760, 2_500);
  const connected = transferOption();

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
  mocks.loadTransferJourneyOptions.mockResolvedValue([connected]);

  const result = await loadTransferRecoveryOptions({
    journey: journey(),
    destination,
    allStops,
  });

  expect(result.directOptions).toHaveLength(1);
  expect(result.directOptions[0]).toMatchObject({
    stopId: "500",
    departure: { tripRef: "replacement-run" },
  });
  expect(result.transferOptions).toEqual([connected]);

  expect(mocks.loadTransferJourneyOptions).toHaveBeenCalledWith(
    expect.objectContaining({
      destination,
      positionAccuracy: 0,
      maxTransitLegs: 2,
      excludedRun: {
        tripRef: "failed-run",
        originAimedDepartureAt: 2_400,
      },
      originStops: expect.arrayContaining([
        expect.objectContaining({ id: "500", distanceMeters: 0 }),
      ]),
    })
  );
});

test("partial provider failure remains useful while total failure is an error", async () => {
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
  mocks.loadTransferJourneyOptions.mockRejectedValueOnce(new Error("router down"));

  await expect(
    loadTransferRecoveryOptions({
      journey: journey(),
      destination,
      allStops,
    })
  ).resolves.toMatchObject({
    directOptions: [expect.objectContaining({ stopId: "500" })],
    transferOptions: [],
  });

  mocks.loadDestinationAwareNearby.mockRejectedValueOnce(new Error("nearby down"));
  mocks.loadTransferJourneyOptions.mockRejectedValueOnce(new Error("router down"));

  await expect(
    loadTransferRecoveryOptions({
      journey: journey(),
      destination,
      allStops,
    })
  ).rejects.toThrow("nearby down");
});

test("does not search before authoritative arrival reaches a transfer boundary", async () => {
  await expect(
    loadTransferRecoveryOptions({
      journey: journey({ activeLegIndex: 0 }),
      destination,
      allStops,
    })
  ).resolves.toEqual({ directOptions: [], transferOptions: [] });

  expect(mocks.loadDestinationAwareNearby).not.toHaveBeenCalled();
  expect(mocks.loadTransferJourneyOptions).not.toHaveBeenCalled();
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
  expect(result.current.transferOptions).toEqual([]);
});

test("hook publishes direct and transfer choices without committing either", async () => {
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
  mocks.loadTransferJourneyOptions.mockResolvedValue([transferOption()]);

  const { result, unmount } = renderHook(() =>
    useTransferRecoveryOptions({
      journey: journey(),
      destination,
      allStops,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.options[0]?.departure.tripRef).toBe("replacement-run");
  expect(result.current.transferOptions[0]?.id).toBe("replacement-transfer");

  unmount();
});

test("total provider failure clears stale choices and exposes an error state", async () => {
  mocks.loadDestinationAwareNearby.mockRejectedValue(new Error("down"));
  mocks.loadTransferJourneyOptions.mockRejectedValue(new Error("down"));

  const { result, unmount } = renderHook(() =>
    useTransferRecoveryOptions({
      journey: journey(),
      destination,
      allStops,
    })
  );

  await waitFor(() => expect(result.current.state).toBe("error"));
  expect(result.current.options).toEqual([]);
  expect(result.current.transferOptions).toEqual([]);

  unmount();
});

test("irrelevant journey timestamps do not restart a ready recovery search", async () => {
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
        journey: selected,
        destination,
        allStops,
      }),
    { initialProps: { selected: journey({ lastSeenAt: 1 }) } }
  );

  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledTimes(1);

  rerender({ selected: journey({ lastSeenAt: 2 }) });
  await Promise.resolve();

  expect(result.current.state).toBe("ready");
  expect(mocks.loadDestinationAwareNearby).toHaveBeenCalledTimes(1);

  unmount();
});

test("confirmed recovery boarding stop changes the search identity", async () => {
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
        journey: selected,
        destination,
        allStops,
      }),
    { initialProps: { selected: journey() } }
  );

  await waitFor(() =>
    expect(result.current.options[0]?.departure.tripRef).toBe("replacement-run")
  );

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

test("loader returns empty choices without destination", async () => {
  await expect(
    loadTransferRecoveryOptions({
      journey: journey(),
      destination: null,
      allStops,
    })
  ).resolves.toEqual({ directOptions: [], transferOptions: [] });
});

test("manual refresh is a no-op while recovery is inactive", async () => {
  const { result, unmount } = renderHook(() =>
    useTransferRecoveryOptions({
      enabled: false,
      journey: journey(),
      destination,
      allStops,
    })
  );

  await expect(result.current.refresh()).resolves.toBeNull();
  unmount();
});
