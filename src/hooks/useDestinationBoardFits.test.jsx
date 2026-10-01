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
  });
  expect(fits.b.status).toBe("other-direction");
  expect(fits.c.status).toBe("not-serving");
  expect(fits.d.status).toBe("unknown");
  expect(fits.e.status).toBe("unknown");
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


test("uses the same ride-plus-walk alighting stop for geocoded places", async () => {
  api.fetchTripStopTimes.mockResolvedValue([
    stopTime("100", 1, "10:00:00"),
    stopTime("900", 2, "10:10:00"),
    stopTime("901", 3, "10:12:00"),
  ]);

  const fits = await loadDestinationBoardFits({
    stopId: "100",
    arrivals: [{ tripref: "good", aimeddeparturetime: 1_500 }],
    rowKeys: ["row-place"],
    destination: {
      id: "geo:osm:node:1",
      kind: "geocoded-place",
      label: "Prisma",
      primaryStopId: "900",
      acceptableStopIds: ["900", "901"],
      destinationStopDistances: {
        "900": 900,
        "901": 80,
      },
      placeProvider: "nominatim",
    },
  });

  expect(fits["row-place"]).toMatchObject({
    status: "compatible",
    destinationStopId: "901",
    destinationStopSequence: 3,
  });
});
