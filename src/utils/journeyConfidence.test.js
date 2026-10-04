import { describe, expect, test } from "vitest";
import {
  boardingDecision,
  directJourneyConfidence,
  transferJourneyConfidence,
} from "./journeyConfidence";

describe("direct journey confidence", () => {
  test("high requires fresh live evidence and comfortable boarding", () => {
    expect(
      directJourneyConfidence({
        distanceMeters: 280,
        departure: { liveState: "live", catchability: "comfortable" },
      })
    ).toEqual({ level: "high", reason: "live-comfortable" });
  });

  test("long boarding walk prevents high confidence even with live data", () => {
    expect(
      directJourneyConfidence({
        distanceMeters: 1200,
        departure: { liveState: "live", catchability: "comfortable" },
      }).level
    ).toBe("medium");
  });

  test("tight boarding and stale realtime fail closed to low", () => {
    expect(
      directJourneyConfidence({
        departure: { liveState: "live", catchability: "tight" },
      }).level
    ).toBe("low");
    expect(
      directJourneyConfidence({
        departure: { liveState: "delayed", catchability: "comfortable" },
      }).level
    ).toBe("low");
  });

  test("schedule plus comfortable boarding is medium, never high", () => {
    expect(
      directJourneyConfidence({
        departure: { liveState: "schedule", catchability: "comfortable" },
      })
    ).toEqual({ level: "medium", reason: "schedule-comfortable" });
  });
});

describe("transfer journey confidence", () => {
  const feasibility = (state) => ({ feasibility: { state } });

  test("all comfortable transfers can be high only with high reliability", () => {
    expect(
      transferJourneyConfidence({
        reliability: "high",
        transfers: [feasibility("comfortable"), feasibility("comfortable")],
      })
    ).toEqual({ level: "high", reason: "comfortable-transfers" });
  });

  test("acceptable transfer remains medium", () => {
    expect(
      transferJourneyConfidence({
        reliability: "medium",
        transfers: [feasibility("comfortable"), feasibility("acceptable")],
      }).level
    ).toBe("medium");
  });

  test("any tight transfer or low reliability is low", () => {
    expect(
      transferJourneyConfidence({
        reliability: "medium",
        transfers: [feasibility("tight")],
      }).level
    ).toBe("low");
    expect(
      transferJourneyConfidence({
        reliability: "low",
        transfers: [feasibility("comfortable")],
      }).level
    ).toBe("low");
  });
});

test("boarding decision exposes only known conservative states", () => {
  expect(boardingDecision("at-stop")).toBe("at-stop");
  expect(boardingDecision("comfortable")).toBe("comfortable");
  expect(boardingDecision("likely")).toBe("likely");
  expect(boardingDecision("tight")).toBe("tight");
  expect(boardingDecision("too-late")).toBe("unknown");
  expect(boardingDecision(undefined)).toBe("unknown");
});
