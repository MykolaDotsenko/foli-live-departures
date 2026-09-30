import { describe, expect, test } from "vitest";
import {
  classifyCatchability,
  conservativeAccessSeconds,
} from "./catchability";

describe("catchability", () => {
  test("keeps the access estimate conservative", () => {
    expect(conservativeAccessSeconds(280, 20)).toBeGreaterThan(5 * 60);
  });

  test("marks a passenger beside the stop as at-stop", () => {
    expect(
      classifyCatchability({
        distanceM: 18,
        accuracyM: 12,
        departureAtSec: 1_100,
        nowSec: 1_000,
      })
    ).toBe("at-stop");
  });

  test("rejects a bus that cannot realistically be reached", () => {
    expect(
      classifyCatchability({
        distanceM: 350,
        accuracyM: 25,
        departureAtSec: 1_180,
        nowSec: 1_000,
      })
    ).toBe("too-late");
  });

  test("accepts a farther stop when there is ample time", () => {
    expect(
      classifyCatchability({
        distanceM: 280,
        accuracyM: 20,
        departureAtSec: 1_600,
        nowSec: 1_000,
      })
    ).toBe("comfortable");
  });
});
