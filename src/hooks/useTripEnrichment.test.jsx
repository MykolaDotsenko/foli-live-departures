import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchTripDetails } from "../api/foliApi";
import useTripEnrichment from "./useTripEnrichment";

vi.mock("../api/foliApi", () => ({
  fetchTripDetails: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchTripDetails).mockReset();
});

test("recovers trip metadata after a transient provider failure without changing trip ids", async () => {
  vi.mocked(fetchTripDetails)
    .mockRejectedValueOnce(new Error("temporary GTFS failure"))
    .mockResolvedValueOnce({
      tripId: "trip-1",
      routeId: "route-1",
      headsign: "Runosmäki",
      wheelchairAccessible: 1,
    });

  const arrivals = [{ tripref: "trip-1" }];
  const { result } = renderHook(() => useTripEnrichment(arrivals));

  await waitFor(() => expect(fetchTripDetails).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.size).toBe(0));

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await waitFor(() => expect(fetchTripDetails).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(result.current.get("trip-1")).toEqual(
      expect.objectContaining({
        headsign: "Runosmäki",
        wheelchairAccessible: 1,
      })
    )
  );
});

test("keeps successful trip metadata while retrying a failed neighbour", async () => {
  vi.mocked(fetchTripDetails).mockImplementation((tripId) => {
    if (tripId === "trip-a") {
      return Promise.resolve({
        tripId: "trip-a",
        routeId: "route-a",
        headsign: "Satama",
      });
    }

    if (vi.mocked(fetchTripDetails).mock.calls.filter(([id]) => id === "trip-b").length === 1) {
      return Promise.reject(new Error("temporary failure"));
    }

    return Promise.resolve({
      tripId: "trip-b",
      routeId: "route-b",
      headsign: "Lentoasema",
    });
  });

  const arrivals = [{ tripref: "trip-a" }, { tripref: "trip-b" }];
  const { result } = renderHook(() => useTripEnrichment(arrivals));

  await waitFor(() => expect(fetchTripDetails).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.get("trip-a")?.headsign).toBe("Satama"));
  expect(result.current.has("trip-b")).toBe(false);

  act(() => {
    window.dispatchEvent(new globalThis.Event("online"));
  });

  await waitFor(() => expect(result.current.get("trip-b")?.headsign).toBe("Lentoasema"));
  expect(result.current.get("trip-a")?.headsign).toBe("Satama");
});
