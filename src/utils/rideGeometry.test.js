import { describe, expect, it } from "vitest";
import {
  analyzeRideGps,
  prepareRideShape,
  projectPositionToRideShape,
} from "./rideGeometry";

describe("Ride Mode shape matching", () => {
  const shape = prepareRideShape([
    { lat: 60.45, lon: 22.25, traveled: 0 },
    { lat: 60.45, lon: 22.26, traveled: 550 },
    { lat: 60.45, lon: 22.27, traveled: 1100 },
    { lat: 60.45, lon: 22.28, traveled: 1650 },
    { lat: 60.45, lon: 22.29, traveled: 2200 },
  ]);

  it("keeps provider traveled distances as the shared GTFS distance axis", () => {
    expect(shape.usesGtfsDistance).toBe(true);
    expect(shape.lengthM).toBe(2200);
  });

  // Föli documents `traveled` only as a cumulative distance, without a unit.
  // Every threshold here is in metres, so kilometres would put a passenger
  // "110 m" from their stop the moment the ride began.
  it("refuses shape distances that are not on a metre scale", () => {
    const inKilometres = prepareRideShape([
      { lat: 60.45, lon: 22.25, traveled: 0 },
      { lat: 60.45, lon: 22.26, traveled: 0.55 },
      { lat: 60.45, lon: 22.27, traveled: 1.1 },
    ]);
    const inCentimetres = prepareRideShape([
      { lat: 60.45, lon: 22.25, traveled: 0 },
      { lat: 60.45, lon: 22.26, traveled: 55_000 },
      { lat: 60.45, lon: 22.27, traveled: 110_000 },
    ]);

    expect(inKilometres.usesGtfsDistance).toBe(false);
    expect(inCentimetres.usesGtfsDistance).toBe(false);
  });

  it("projects a GPS point onto the trip path instead of target straight-line distance", () => {
    const match = projectPositionToRideShape(
      { lat: 60.45005, lon: 22.275 },
      shape
    );

    expect(match.lateralDistanceM).toBeLessThan(10);
    expect(match.alongM).toBeGreaterThan(1300);
    expect(match.alongM).toBeLessThan(1450);
  });

  it("uses route distance and speed only when GPS is accurate and on-route", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.45, lon: 22.278 },
      accuracyM: 18,
      speedMps: 9,
      shape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2200,
      nowMs: 1_000_000,
    });

    expect(sample.usable).toBe(true);
    expect(sample.onRoute).toBe(true);
    expect(sample.routeDistanceM).toBeGreaterThan(500);
    expect(sample.routeDistanceM).toBeLessThan(800);
    expect(sample.routeEtaSec).toBeGreaterThan(50);
    expect(sample.routeEtaSec).toBeLessThan(100);
  });

  it("does not snap a fresh fix far forward onto a nearby future leg", () => {
    const loopShape = prepareRideShape([
      { lat: 60.45, lon: 22.25, traveled: 0 },
      { lat: 60.45, lon: 22.27, traveled: 1100 },
      { lat: 60.4503, lon: 22.27, traveled: 1135 },
      { lat: 60.4503, lon: 22.25, traveled: 2235 },
    ]);

    const sample = analyzeRideGps({
      // Geometrically this is much closer to the future return leg than the
      // leg the bus was on one second ago.
      position: { lat: 60.45028, lon: 22.259 },
      accuracyM: 15,
      speedMps: 8,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      previousAlongM: 500,
      previousFixAtMs: 1_000_000,
      nowMs: 1_001_000,
    });

    expect(sample.usable).toBe(true);
    expect(sample.onRoute).toBe(true);
    expect(sample.alongM).toBeGreaterThan(400);
    expect(sample.alongM).toBeLessThan(650);
    expect(sample.routeDistanceM).toBeGreaterThan(1_500);
  });

  it("allows real forward progress after a long gap between fixes", () => {
    const loopShape = prepareRideShape([
      { lat: 60.45, lon: 22.25, traveled: 0 },
      { lat: 60.45, lon: 22.27, traveled: 1100 },
      { lat: 60.4503, lon: 22.27, traveled: 1135 },
      { lat: 60.4503, lon: 22.25, traveled: 2235 },
    ]);

    const sample = analyzeRideGps({
      position: { lat: 60.4503, lon: 22.259 },
      accuracyM: 15,
      speedMps: 10,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      previousAlongM: 500,
      previousFixAtMs: 1_000_000,
      nowMs: 1_061_000,
    });

    expect(sample.usable).toBe(true);
    expect(sample.onRoute).toBe(true);
    expect(sample.alongM).toBeGreaterThan(1_500);
  });

  it("does not trust poor-accuracy GPS as route evidence", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.45, lon: 22.278 },
      accuracyM: 180,
      speedMps: 8,
      shape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2200,
    });

    expect(sample.usable).toBe(false);
    expect(sample.onRoute).toBe(false);
  });

  it("requires two minutes of accurate off-route movement before warning", () => {
    const first = analyzeRideGps({
      position: { lat: 60.455, lon: 22.27 },
      accuracyM: 20,
      speedMps: 10,
      shape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2200,
      nowMs: 1_000_000,
    });

    expect(first.onRoute).toBe(false);
    expect(first.offRouteSuspected).toBe(false);

    const later = analyzeRideGps({
      position: { lat: 60.455, lon: 22.275 },
      accuracyM: 20,
      speedMps: 10,
      shape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2200,
      offRouteSinceMs: first.offRouteSinceMs,
      nowMs: 1_121_000,
    });

    expect(later.offRouteSuspected).toBe(true);
  });

  it("detects confirmed passage beyond the target along the route", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.45, lon: 22.29 },
      accuracyM: 15,
      speedMps: 8,
      shape,
      boardingShapeDistM: 0,
      targetShapeDistM: 1800,
    });

    expect(sample.onRoute).toBe(true);
    expect(sample.routeDistanceM).toBeLessThan(-200);
    expect(sample.passedTarget).toBe(true);
  });
});


describe("Ride Mode ambiguity and recovery boundaries", () => {
  const loopShape = prepareRideShape([
    { lat: 60.45, lon: 22.25, traveled: 0 },
    { lat: 60.45, lon: 22.27, traveled: 1100 },
    { lat: 60.4503, lon: 22.27, traveled: 1135 },
    { lat: 60.4503, lon: 22.25, traveled: 2235 },
  ]);

  it("refuses a fix that is equally plausible on two distant legs of a loop", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.45015, lon: 22.259 },
      accuracyM: 18,
      speedMps: 8,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      nowMs: 1_000_000,
    });

    expect(sample.usable).toBe(false);
    expect(sample.reason).toBe("shape-match-ambiguous");
    expect(sample.offRouteSuspected).toBe(false);
    expect(sample.passedTarget).toBe(false);
  });

  it("uses recent route continuity to choose the correct parallel leg", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.45015, lon: 22.259 },
      accuracyM: 18,
      speedMps: 8,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      previousAlongM: 500,
      previousFixAtMs: 990_000,
      nowMs: 1_000_000,
    });

    expect(sample.usable).toBe(true);
    expect(sample.onRoute).toBe(true);
    expect(sample.alongM).toBeGreaterThan(400);
    expect(sample.alongM).toBeLessThan(650);
    expect(sample.routeDistanceM).toBeGreaterThan(1_500);
  });

  it("keeps the fix ambiguous when continuity cannot clearly distinguish two legs", () => {
    const match = projectPositionToRideShape(
      { lat: 60.45015, lon: 22.259 },
      loopShape,
      { previousAlongM: 1100 }
    );

    expect(match).not.toBeNull();
    expect(match.ambiguous).toBe(true);
  });

  it("clears an off-route timer immediately after a trustworthy on-route fix", () => {
    const offRoute = analyzeRideGps({
      position: { lat: 60.455, lon: 22.27 },
      accuracyM: 20,
      speedMps: 8,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      nowMs: 1_000_000,
    });

    expect(offRoute.onRoute).toBe(false);
    expect(offRoute.offRouteSinceMs).toBe(1_000_000);

    const recovered = analyzeRideGps({
      position: { lat: 60.45, lon: 22.26 },
      accuracyM: 20,
      speedMps: 8,
      shape: loopShape,
      boardingShapeDistM: 0,
      targetShapeDistM: 2235,
      offRouteSinceMs: offRoute.offRouteSinceMs,
      nowMs: 1_090_000,
    });

    expect(recovered.usable).toBe(true);
    expect(recovered.onRoute).toBe(true);
    expect(recovered.offRouteSinceMs).toBeNull();
    expect(recovered.offRouteSuspected).toBe(false);
  });

  it("never turns implausible speed into a route ETA", () => {
    for (const speedMps of [0, 1.9, 40.1, 80]) {
      const sample = analyzeRideGps({
        position: { lat: 60.45, lon: 22.278 },
        accuracyM: 15,
        speedMps,
        shape: prepareRideShape([
          { lat: 60.45, lon: 22.25, traveled: 0 },
          { lat: 60.45, lon: 22.29, traveled: 2200 },
        ]),
        boardingShapeDistM: 0,
        targetShapeDistM: 2200,
      });

      expect(sample.onRoute).toBe(true);
      expect(sample.routeEtaSec).toBeNull();
    }
  });

  it("does not call a geometrically passed target confirmed when the fix is off-route", () => {
    const sample = analyzeRideGps({
      position: { lat: 60.455, lon: 22.29 },
      accuracyM: 15,
      speedMps: 8,
      shape: prepareRideShape([
        { lat: 60.45, lon: 22.25, traveled: 0 },
        { lat: 60.45, lon: 22.30, traveled: 2750 },
      ]),
      boardingShapeDistM: 0,
      targetShapeDistM: 1900,
      nowMs: 1_000_000,
    });

    expect(sample.routeDistanceM).toBeLessThan(-250);
    expect(sample.onRoute).toBe(false);
    expect(sample.passedTarget).toBe(false);
  });
});
