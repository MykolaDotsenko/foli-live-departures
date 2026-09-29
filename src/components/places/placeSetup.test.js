import { expect, test } from "vitest";
import {
  isAccurateFix,
  isReliableSetupLocation,
  toggleStopSelection,
} from "./placeSetup";

const candidates = [
  { id: "164", distanceMeters: 40 },
  { id: "32", distanceMeters: 300 },
  { id: "4", distanceMeters: 900 },
];

test("trusts a location fix only when it is precise", () => {
  expect(isAccurateFix(18)).toBe(true);
  expect(isAccurateFix(250)).toBe(true);
  expect(isAccurateFix(251)).toBe(false);
  expect(isAccurateFix(null)).toBe(false);
  expect(isAccurateFix(Number.NaN)).toBe(false);
});

// Picking the nearest stop for the passenger needs both a good fix and a
// stop close enough that it is plausibly the one they mean.
test("preselects the nearest stop only for a precise fix near a stop", () => {
  expect(isReliableSetupLocation(18, candidates)).toBe(true);
  expect(isReliableSetupLocation(400, candidates)).toBe(false);
  expect(isReliableSetupLocation(18, [{ id: "1", distanceMeters: 2_001 }])).toBe(false);
  expect(isReliableSetupLocation(18, [{ id: "1" }])).toBe(false);
  expect(isReliableSetupLocation(18, [])).toBe(false);
});

test("the first stop ticked becomes the main stop", () => {
  const next = toggleStopSelection(new Set(), "", "32", candidates);

  expect([...next.selectedIds]).toEqual(["32"]);
  expect(next.primaryStopId).toBe("32");
});

test("ticking another stop keeps the main stop", () => {
  const next = toggleStopSelection(new Set(["32"]), "32", "4", candidates);

  expect([...next.selectedIds]).toEqual(["32", "4"]);
  expect(next.primaryStopId).toBe("32");
});

test("unticking the main stop hands it to the nearest stop still ticked", () => {
  const next = toggleStopSelection(new Set(["4", "164", "32"]), "164", "164", candidates);

  expect([...next.selectedIds].sort()).toEqual(["32", "4"]);
  expect(next.primaryStopId).toBe("32");
});

test("unticking the last stop leaves no main stop, and never edits the old set", () => {
  const selected = new Set(["164"]);
  const next = toggleStopSelection(selected, "164", "164", candidates);

  expect(next.selectedIds.size).toBe(0);
  expect(next.primaryStopId).toBe("");
  expect([...selected]).toEqual(["164"]);
});

test("unticking a backup stop keeps the main stop", () => {
  const next = toggleStopSelection(new Set(["164", "32"]), "164", "32", candidates);

  expect([...next.selectedIds]).toEqual(["164"]);
  expect(next.primaryStopId).toBe("164");
});
