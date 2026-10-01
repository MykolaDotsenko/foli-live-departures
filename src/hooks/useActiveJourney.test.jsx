import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import useActiveJourney from "./useActiveJourney";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Home stop",
  primaryStopId: "900",
  acceptableStopIds: ["900"],
};

const option = {
  id: "100:trip-1:1500",
  label: "fastest",
  stopId: "100",
  stopName: "Kauppatori D2",
  distanceMeters: 200,
  departure: {
    tripRef: "trip-1",
    lineRef: "18",
    destinationStopId: "900",
    departureAt: 1_500,
    aimedDepartureAt: 1_480,
    destinationArrivalAt: 2_100,
    catchability: "comfortable",
    liveState: "live",
    rideDurationSec: 600,
  },
  arrivalDeltaSec: 0,
  walkingDeltaMeters: 0,
};

test("selects, advances, observes and clears an active journey", () => {
  const { result } = renderHook(() => useActiveJourney());

  expect(result.current.journey).toBeNull();

  act(() => {
    expect(
      result.current.selectDirectJourney(option, destination)
    ).toBe(true);
  });
  expect(result.current.journey?.phase).toBe("walking-to-stop");

  act(() => result.current.confirmAtStop());
  expect(result.current.journey?.phase).toBe("waiting");

  act(() => {
    result.current.observeStopFeed({
      stopId: "100",
      arrival: {
        tripref: "trip-1",
        lineref: "18",
        aimeddeparturetime: 1_480,
        expecteddeparturetime: 1_650,
      },
      referenceTimeSec: 1_500,
      receivedAtMs: Date.now() + 60_000,
      feedError: false,
      cancelled: false,
    });
  });
  expect(result.current.journey?.departureAt).toBe(1_650);

  act(() => result.current.clearJourney());
  expect(result.current.journey).toBeNull();
});
