import { expect, test } from "vitest";
import { PLACE_PRESETS } from "../../hooks/useSavedPlaces";
import { journeyAction, PLACE_PHRASES } from "./placePhrases";

// Every place is spoken of in its own words, so a missing phrase would show
// as a blank button rather than fall back to another place's wording.
test("every place has every phrase", () => {
  const keys = Object.keys(PLACE_PHRASES.home).sort();

  for (const preset of PLACE_PRESETS) {
    expect(Object.keys(PLACE_PHRASES[preset.id]).sort()).toEqual(keys);
  }
});

test("names the journey in the place's own words", () => {
  expect(journeyAction({ id: "home" })).toBe("Get me Home");
  expect(journeyAction({ id: "work" })).toBe("Go to Work");
});
