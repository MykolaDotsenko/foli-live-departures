import { describe, expect, it } from "vitest";
import {
  buildRadarContext,
  createRadarContextIndex,
} from "./radarContext";

function pack(addresses = null) {
  return {
    addresses:
      addresses ||
      [
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
          lon: 22.3,
        },
      ],
    streets: [],
  };
}

describe("radar context", () => {
  it("indexes shipped addresses and emits compact road/building paths", () => {
    const index = createRadarContextIndex(pack());
    expect(index).toBeInstanceOf(Map);
    expect([...index.values()].flat()).toHaveLength(6);

    const context = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      0,
      200
    );

    expect(context.roadPath).toMatch(/^M/);
    expect(context.roadPath).toContain("L");
    expect(context.buildingPath).toMatch(/^M/);
    expect(context.buildingPath).toContain("h");
  });

  it("rotates the compact context with the radar heading", () => {
    const index = createRadarContextIndex(pack());
    const north = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      0,
      200
    );
    const east = buildRadarContext(
      index,
      { lat: 60.4518, lon: 22.2662 },
      90,
      200
    );

    expect(north.roadPath).not.toBe(east.roadPath);
    expect(north.buildingPath).not.toBe(east.buildingPath);
  });

  it("fails open when context data is missing", () => {
    expect(createRadarContextIndex(null).size).toBe(0);
    expect(
      buildRadarContext(
        createRadarContextIndex(null),
        { lat: 60.4518, lon: 22.2662 },
        null,
        100
      )
    ).toEqual({
      buildingPath: "",
      roadPath: "",
    });
  });

  it("does not drag far-away addresses into the local context", () => {
    const context = buildRadarContext(
      createRadarContextIndex(
        pack([
          {
            id: "far",
            street: "Faraway",
            streetKey: "faraway",
            house: "1",
            lat: 60.47,
            lon: 22.3,
          },
        ])
      ),
      { lat: 60.4518, lon: 22.2662 },
      null,
      100
    );

    expect(context.roadPath).toBe("");
    expect(context.buildingPath).toBe("");
  });
});
