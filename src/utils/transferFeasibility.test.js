import { describe, expect, test } from "vitest";
import {
  assessTransfer,
  transferRequiredSeconds,
  transferWalkSeconds,
} from "./transferFeasibility";

describe("transfer feasibility", () => {
  test("treats a same-stop eight-minute connection as comfortable", () => {
    const result = assessTransfer({
      incomingArrivalAt: 1_000,
      outgoingDepartureAt: 1_480,
      sameStop: true,
      incomingLiveState: "schedule",
    });

    expect(result.state).toBe("comfortable");
    expect(result.recommendable).toBe(true);
    expect(result.walkingDistanceM).toBe(0);
    expect(result.slackSec).toBeGreaterThanOrEqual(300);
  });

  test("downgrades a cross-platform connection with little spare time", () => {
    const result = assessTransfer({
      incomingArrivalAt: 1_000,
      outgoingDepartureAt: 1_360,
      walkingDistanceM: 150,
      incomingLiveState: "schedule",
    });

    expect(result.state).toBe("tight");
    expect(result.recommendable).toBe(true);
    expect(result.requiredSec).toBeGreaterThan(250);
  });

  test("rejects a connection that cannot cover the conservative walk", () => {
    const result = assessTransfer({
      incomingArrivalAt: 1_000,
      outgoingDepartureAt: 1_240,
      walkingDistanceM: 180,
      incomingLiveState: "delayed",
    });

    expect(result.state).toBe("broken");
    expect(result.recommendable).toBe(false);
    expect(result.slackSec).toBeLessThan(0);
  });

  test("marks a barely-positive connection as unlikely rather than safe", () => {
    const required = transferRequiredSeconds({
      sameStop: true,
      incomingLiveState: "live",
    });

    const result = assessTransfer({
      incomingArrivalAt: 2_000,
      outgoingDepartureAt: 2_000 + required + 30,
      sameStop: true,
      incomingLiveState: "live",
    });

    expect(result.state).toBe("unlikely");
    expect(result.recommendable).toBe(false);
  });

  test("fails closed when a cross-stop distance is unknown", () => {
    expect(
      assessTransfer({
        incomingArrivalAt: 1_000,
        outgoingDepartureAt: 1_900,
        walkingDistanceM: null,
        sameStop: false,
        incomingLiveState: "live",
      })
    ).toMatchObject({ state: "unknown", recommendable: false });
  });

  test("adds more uncertainty when incoming realtime is stale", () => {
    const live = transferRequiredSeconds({
      walkingDistanceM: 100,
      incomingLiveState: "live",
    });
    const delayed = transferRequiredSeconds({
      walkingDistanceM: 100,
      incomingLiveState: "delayed",
    });

    expect(delayed).toBeGreaterThan(live);
  });

  test("walking allowance is monotonic and conservative", () => {
    expect(transferWalkSeconds(0)).toBe(0);
    expect(transferWalkSeconds(200)).toBeGreaterThan(200);
  });
});
