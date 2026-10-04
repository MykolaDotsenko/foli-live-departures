import { describe, expect, it } from "vitest";
import {
  buildRadarContext,
  createRadarContextIndex,
} from "./radarContext";

function pack() {
  return {
    addresses: [
      {
        id: "a1",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "1",
        lat: 60.4515,
        lon: 22.2664,
      },
      {
        id: "a2",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "3",
        lat: 60.4518,
        lon: 22.2664,
      },
      {
        id: "a3",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "5",
        lat: 60.4521,
        lon: 22.2664,
      },
      {
        id: "b1",
        street: "Eerikinkatu",
        streetKey: "eerikinkatu",
        house: "10",
        lat: 60.4518,
        lon: 22.2659,
      },
      {
        id: "b2",
        street: "Eerikinkatu",
        streetKey: "eerikinkatu",
        house: "12",
        lat: 60.4518,
        lon: 22.2669,
      },
      {
        id: "far",
        street: "Faraway",
        streetKey: "faraway",
        house: "1",
        lat: 60.47,
        lon: 22.30,
      },
    ],
    streets: [
      {
        id: "street:aurakatu",
        street: "Aurakatu",
        streetKey: "aurakatu",
        lat: 60.4518,
        lon: 22.2664,
      },
    ],
  };
}

describe("radar context", () => {
  it("indexes the shipped address data once and derives local roads/building cues", () => {
    const index = createRadarContextIndex(pack());
    expect(index).toBeInstanceOf(Map);
    expect([...index.values()].flat()).toHaveLength(6);

    const context = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      { lat: 60.4519, lon: 22.26642 },
      0,
      200
    );

    expect(context.targetStreet).toBe("Aurakatu");
    expect(context.roads.map((road) => road.street)).toEqual(
      expect.arrayContaining(["Aurakatu", "Eerikinkatu"])
    );
    expect(
      context.roads.find((road) => road.street === "Aurakatu")
    ).toMatchObject({ targetStreet: true, showLabel: true });
    expect(context.buildings.length).toBeGreaterThan(0);
    expect(context.buildings.every((building) => building.x >= 8 && building.x <= 92)).toBe(true);
    expect(context.buildings.every((building) => building.y >= 8 && building.y <= 92)).toBe(true);
    expect(context.buildings.some((building) => building.targetStreet)).toBe(true);
  });

  it("rotates the context with the radar heading instead of leaving a north-up map behind", () => {
    const index = createRadarContextIndex(pack());
    const north = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      { lat: 60.4519, lon: 22.26642 },
      0,
      200
    );
    const east = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      { lat: 60.4519, lon: 22.26642 },
      90,
      200
    );

    const northRoad = north.roads.find((road) => road.street === "Aurakatu");
    const eastRoad = east.roads.find((road) => road.street === "Aurakatu");
    expect(northRoad).toBeTruthy();
    expect(eastRoad).toBeTruthy();
    expect(eastRoad.x1).not.toBeCloseTo(northRoad.x1, 2);
    expect(eastRoad.y1).not.toBeCloseTo(northRoad.y1, 2);
  });

  it("fails open when context data is missing and never blocks the radar", () => {
    expect(createRadarContextIndex(null).size).toBe(0);
    expect(
      buildRadarContext(
        createRadarContextIndex(null),
        { lat: 60.4518, lon: 22.2662 },
        { lat: 60.4519, lon: 22.26642 },
        null,
        100
      )
    ).toEqual({
      buildings: [],
      roads: [],
      targetStreet: "",
    });
  });

  it("does not drag far-away addresses into the radar context", () => {
    const context = buildRadarContext(
      createRadarContextIndex(pack()),
      { lat: 60.4518, lon: 22.2662 },
      { lat: 60.4519, lon: 22.26642 },
      null,
      100
    );

    expect(context.buildings.map((building) => building.street)).not.toContain(
      "Faraway"
    );
    expect(context.roads.map((road) => road.street)).not.toContain("Faraway");
  });
});
