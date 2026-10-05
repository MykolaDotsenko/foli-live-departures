import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripStopTimes: api.fetchTripStopTimes,
}));

import useDestinationBoardFits, {
  loadDestinationBoardFits,
} from "./useDestinationBoardFits";

function stopTime(stopId, stopSequence, time) {
  return {
    stopId,
    stopSequence,
    arrivalTime: time,
    departureTime: time,
    pickupType: 0,
    dropOffType: 0,
    timepoint: 1,
    shapeDistTraveled: null,
  };
}

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

beforeEach(() => {
  api.fetchTripStopTimes.mockReset();
  api.fetchTripStopTimes.mockImplementation(async (tripId) => {
    if (tripId === "good") {
      return [
        stopTime("100", 1, "10:00:00"),
        stopTime("900", 2, "10:20:00"),
      ];
    }
    if (tripId === "behind") {
      return [
        stopTime("900", 1, "10:00:00"),
        stopTime("100", 2, "10:20:00"),
      ];
    }
    if (tripId === "missing") throw new Error("not available");
    return [
      stopTime("100", 1, "10:00:00"),
      stopTime("777", 2, "10:20:00"),
    ];
  });
});

test("classifies compatible, other-direction, unrelated and unknown rows", async () => {
  const fits = await loadDestinationBoardFits({
    stopId: "100",
    arrivals: [
      { tripref: "good" },
      { tripref: "behind" },
      { tripref: "other" },
      { tripref: "missing" },
      {},
    ],
    rowKeys: ["a", "b", "c", "d", "e"],
    destination,
  });

  expect(fits.a).toMatchObject({
    status: "compatible",
    destinationStopId: "900",
    destinationStopSequence: 2,
    rideDurationSec: 20 * 60,
  });
  expect(fits.b.status).toBe("other-direction");
  expect(fits.c.status).toBe("not-serving");
  expect(fits.d.status).toBe("unknown");
  expect(fits.e.status).toBe("unknown");
});

test("a place is reached from the stop with the shorter walk, as the planner chooses", async () => {
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("901", 2, "10:05:00"),
    stopTime("902", 3, "10:07:00"),
  ]);

  const fits = await loadDestinationBoardFits({
    stopId: "100",
    arrivals: [{ tripref: "castle" }],
    rowKeys: ["a"],
    destination: {
      id: "external:osm-places:castle",
      kind: "external-place",
      label: "Turun linna",
      primaryStopId: "901",
      acceptableStopIds: ["901", "902"],
      // The first stop on the way is the farther walk: two minutes more on
      // the bus beat about ten more on foot.
      finalWalkDistanceByStop: { "901": 650, "902": 80 },
    },
  });

  expect(fits.a).toMatchObject({
    status: "compatible",
    destinationStopId: "902",
    destinationStopSequence: 3,
    rideDurationSec: 7 * 60,
  });
});

test("hook does no work without a destination and resolves when one is supplied", async () => {
  const arrivals = [{ tripref: "good" }];
  const rowKeys = ["row-good"];

  const { result, rerender } = renderHook(
    ({ target }) =>
      useDestinationBoardFits({
        stopId: "100",
        arrivals,
        rowKeys,
        destination: target,
      }),
    { initialProps: { target: null } }
  );

  expect(result.current.state).toBe("idle");
  expect(api.fetchTripStopTimes).not.toHaveBeenCalled();

  rerender({ target: destination });
  await waitFor(() => expect(result.current.state).toBe("ready"));
  expect(result.current.fitsByRowKey["row-good"].status).toBe("compatible");
});

test("keeps what it knew while the same board is checked again, not for another destination", async () => {
  const { result, rerender } = renderHook(
    ({ arrivals, rowKeys, target }) =>
      useDestinationBoardFits({ stopId: "100", arrivals, rowKeys, destination: target }),
    {
      initialProps: {
        arrivals: [{ tripref: "good" }, { tripref: "other" }],
        rowKeys: ["row-good", "row-other"],
        target: destination,
      },
    }
  );
  await waitFor(() => expect(result.current.state).toBe("ready"));

  // A bus has left and the next one is checked: the one still listed keeps
  // its answer meanwhile.
  let finish;
  api.fetchTripStopTimes.mockImplementation(
    () => new Promise((resolve) => (finish = resolve))
  );
  rerender({
    arrivals: [{ tripref: "good" }, { tripref: "next" }],
    rowKeys: ["row-good", "row-next"],
    target: destination,
  });
  expect(result.current.state).toBe("loading");
  expect(result.current.fitsByRowKey["row-good"].status).toBe("compatible");

  // Another destination: line "good" going home says nothing about work.
  rerender({
    arrivals: [{ tripref: "good" }, { tripref: "next" }],
    rowKeys: ["row-good", "row-next"],
    target: { ...destination, id: "stop:901", acceptableStopIds: ["901"] },
  });
  expect(result.current.state).toBe("loading");
  expect(result.current.fitsByRowKey).toEqual({});
  finish?.([]);
});
