import { describe, expect, test } from "vitest";
import {
  destinationFromExternalPlace,
  destinationStopCandidates,
  estimateFinalWalkSeconds,
} from "./placeDestination";

describe("place destination", () => {
  test("inflates straight-line distance into a conservative walking estimate", () => {
    expect(estimateFinalWalkSeconds(100)).toBeGreaterThan(100 / 1.15);
    expect(estimateFinalWalkSeconds(null)).toBeNull();
  });

  test("keeps several nearby candidate destination stops", () => {
    const stops = Array.from({ length: 10 }, (_, index) => ({
      id: String(index + 1),
      name: `Candidate ${index + 1}`,
      lat: 60.45 + index * 0.001,
      lon: 22.26,
    }));

    const candidates = destinationStopCandidates(stops, {
      lat: 60.45,
      lon: 22.26,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates[0].id).toBe("1");
    expect(candidates[0].finalWalkDistanceM).toBeLessThan(10);
  });

  test("builds a session-only external place destination with per-stop walk cost", () => {
    const destination = destinationFromExternalPlace(
      {
        id: "nominatim:N:123",
        label: "Prisma Test",
        lat: 60.45,
        lon: 22.26,
        source: "nominatim",
      },
      [
        { id: "100", name: "Near", lat: 60.451, lon: 22.26 },
        { id: "200", name: "Farther", lat: 60.455, lon: 22.26 },
        { id: "300", name: "Third", lat: 60.458, lon: 22.26 },
      ]
    );

    expect(destination).toMatchObject({
      id: "external:nominatim:N:123",
      kind: "external-place",
      label: "Prisma Test",
      source: "nominatim",
      point: { lat: 60.45, lon: 22.26 },
    });
    expect(destination.acceptableStopIds).toContain("100");
    expect(destination.stopAccess["100"].distanceMeters).toBeGreaterThan(0);
    expect(destination.stopAccess["100"].walkDurationSec).toBeGreaterThan(0);
  });

  test("fails closed when no stop with usable coordinates is nearby", () => {
    expect(
      destinationFromExternalPlace(
        {
          id: "place",
          label: "Somewhere",
          lat: 60.45,
          lon: 22.26,
        },
        [{ id: "100", name: "No coordinates" }]
      )
    ).toBeNull();
  });
});
