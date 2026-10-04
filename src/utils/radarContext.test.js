import { describe, expect, it } from "vitest";
import {
  createRadarContextIndex,
  radarContextPaths,
  selectRadarContext,
} from "./radarContext";

function address(street, house, lat, lon) {
  return { id: `${street}:${house}`, street, house, lat, lon };
}

function pack(addresses = null) {
  return {
    addresses:
      addresses ||
      [
        address("Aurakatu", "1", 60.4515, 22.2664),
        address("Aurakatu", "3", 60.4518, 22.2664),
        address("Aurakatu", "5", 60.4521, 22.2664),
        address("Eerikinkatu", "10", 60.4518, 22.2659),
        address("Eerikinkatu", "12", 60.4518, 22.2669),
        address("Faraway", "1", 60.47, 22.3),
      ],
    streets: [],
  };
}

const origin = { lat: 60.4518, lon: 22.2662 };

describe("radar context", () => {
  it("indexes shipped addresses and emits compact road/building paths", () => {
    const index = createRadarContextIndex(pack());
    expect(index).toBeInstanceOf(Map);
    expect([...index.values()].flat()).toHaveLength(6);

    const context = selectRadarContext(index, origin, 200);
    const paths = radarContextPaths(context, 0, 200);

    expect(paths.roadPath).toMatch(/^M\d+ \d+L\d+ \d+/);
    expect(paths.buildingPath).toMatch(/^(M\d+ \d+h0)+$/);
  });

  // Aurakatu runs north-south, Eerikinkatu east-west. A segment from one
  // house to the next drew a dash a few metres long; the axis follows the
  // street through its addresses.
  it("draws each street's axis along its addresses", () => {
    const context = selectRadarContext(createRadarContextIndex(pack()), origin, 200);
    expect(context.roads).toHaveLength(2);

    const [aurakatu, eerikinkatu] = [...context.roads].sort(
      (a, b) => Math.abs(a[1] - a[3]) < Math.abs(b[1] - b[3]) ? 1 : -1
    );
    // North-south: about 67 m long, its east offset the same at both ends.
    expect(Math.abs(aurakatu[3] - aurakatu[1])).toBeGreaterThan(60);
    expect(Math.abs(aurakatu[2] - aurakatu[0])).toBeLessThan(1);
    // East-west: about 55 m long.
    expect(Math.abs(eerikinkatu[2] - eerikinkatu[0])).toBeGreaterThan(50);
    expect(Math.abs(eerikinkatu[3] - eerikinkatu[1])).toBeLessThan(1);
  });

  // Addresses around a square or a courtyard block do not line up; a line
  // through them crossed the square as if it were a street.
  it("draws no axis through addresses that do not line up", () => {
    const square = [
      address("Kauppatori", "1", 60.4514, 22.2658),
      address("Kauppatori", "2", 60.4514, 22.2666),
      address("Kauppatori", "3", 60.4522, 22.2658),
      address("Kauppatori", "4", 60.4522, 22.2666),
      address("Kauppatori", "5", 60.4518, 22.2655),
      address("Kauppatori", "6", 60.4518, 22.2669),
    ];
    const context = selectRadarContext(createRadarContextIndex(pack(square)), origin, 200);
    expect(context.roads).toEqual([]);
    expect(context.buildings.length).toBeGreaterThan(0);
  });

  // The nearest 40 addresses all sat in a smudge round the passenger's dot
  // on a wide scale. Cues are kept apart by about 6% of the radar.
  it("spreads building cues over the scale instead of piling them up", () => {
    const row = Array.from({ length: 120 }, (_, i) =>
      address("Pitkäkatu", String(i + 1), 60.4518 + i * 0.00003, 22.2662)
    );
    const context = selectRadarContext(createRadarContextIndex(pack(row)), origin, 400);
    const spacing = 400 / 7;
    for (const [i, [x, y]] of context.buildings.entries()) {
      for (const [x2, y2] of context.buildings.slice(i + 1)) {
        expect(Math.hypot(x - x2, y - y2)).toBeGreaterThanOrEqual(spacing);
      }
    }
    // From the nearest cue out to beyond 300 m along the row.
    expect(Math.max(...context.buildings.map(([, y]) => y))).toBeGreaterThan(300);
    expect(context.buildings.length).toBeLessThanOrEqual(40);
  });

  // The compass turns the radar many times a second; what is drawn depends
  // on the fix and scale only, and the heading just turns it.
  it("rotates the context with the radar heading without choosing again", () => {
    const context = selectRadarContext(createRadarContextIndex(pack()), origin, 200);
    const north = radarContextPaths(context, 0, 200);
    const east = radarContextPaths(context, 90, 200);
    expect(north.roadPath).not.toBe(east.roadPath);
    expect(north.buildingPath).not.toBe(east.buildingPath);

    // Facing east, a cue due east of the passenger is straight up.
    const ahead = radarContextPaths({ roads: [], buildings: [[100, 0]] }, 90, 200);
    expect(ahead.buildingPath).toBe("M50 29h0");
    const northUp = radarContextPaths({ roads: [], buildings: [[100, 0]] }, null, 200);
    expect(northUp.buildingPath).toBe("M71 50h0");
  });

  it("fails open when context data is missing", () => {
    expect(createRadarContextIndex(null).size).toBe(0);
    const context = selectRadarContext(createRadarContextIndex(null), origin, 100);
    expect(context).toEqual({ roads: [], buildings: [] });
    expect(radarContextPaths(context, null, 100)).toEqual({
      buildingPath: "",
      roadPath: "",
    });
    expect(selectRadarContext(createRadarContextIndex(pack()), null, 100)).toEqual({
      roads: [],
      buildings: [],
    });
  });

  it("does not drag far-away addresses into the local context", () => {
    const context = selectRadarContext(
      createRadarContextIndex(pack([address("Faraway", "1", 60.47, 22.3)])),
      origin,
      100
    );
    expect(context).toEqual({ roads: [], buildings: [] });
  });
});
