import { afterEach, expect, test } from "vitest";
import { resetLanguageForTests } from "../../i18n";
import {
  destinationNames,
  routeBadgeStyle,
  vehicleProximity,
  wheelchairLabel,
} from "./rowPresentation";

const NOW = 1_790_000_000;
const STOP = { id: "164", lat: 60.451, lon: 22.268 };

function live(overrides = {}) {
  return {
    monitored: true,
    recordedattime: NOW - 10,
    latitude: STOP.lat,
    longitude: STOP.lon,
    ...overrides,
  };
}

afterEach(() => resetLanguageForTests("en"));

test("an unmonitored or undated sample says nothing about the bus", () => {
  expect(vehicleProximity(live({ monitored: false }), STOP, null, NOW)).toBe("");
  expect(
    vehicleProximity(live({ recordedattime: undefined }), STOP, null, NOW)
  ).toBe("");
});

test("a fresh at-stop flag is said for the vehicle it is", () => {
  const atStop = live({ vehicleatstop: true, latitude: undefined });

  expect(vehicleProximity(atStop, STOP, null, NOW)).toBe("Bus is at the stop");
  expect(vehicleProximity(atStop, STOP, { type: 4 }, NOW)).toBe(
    "Waterbus is at the stop"
  );
});

test("distance is told in bands, and an old position says its age", () => {
  expect(vehicleProximity(live(), STOP, null, NOW)).toBe("Bus at or near stop");
  expect(
    vehicleProximity(live({ latitude: STOP.lat + 0.002 }), STOP, null, NOW)
  ).toMatch(/^Bus nearby · ≈/);
  expect(
    vehicleProximity(live({ latitude: STOP.lat + 0.02 }), STOP, null, NOW)
  ).toMatch(/^Bus ≈.* from stop$/);
  expect(
    vehicleProximity(live({ recordedattime: NOW - 300 }), STOP, null, NOW)
  ).toMatch(/^Last bus position ≈.* · 5 min old$/);
  expect(vehicleProximity(live(), { id: "164" }, null, NOW)).toBe("");
});

test("a pale route colour gets an outline, a dark one does not", () => {
  expect(routeBadgeStyle(undefined)).toBeUndefined();
  expect(routeBadgeStyle({ color: "#fff8cc" })).toHaveProperty("boxShadow");
  expect(routeBadgeStyle({ color: "#003366" })).toEqual({
    backgroundColor: "#003366",
    color: "#ffffff",
  });
});

test("the sign's name leads, with the reader's own beside it", () => {
  const arrival = {
    destinationdisplay: "Satama",
    destinationdisplay_en: "Harbour",
    destinationdisplay_sv: "Hamnen",
  };

  expect(destinationNames(arrival, ["sv", "en"])).toEqual({
    sign: "Satama",
    signLang: "fi",
    translation: "Hamnen",
    lang: "sv",
  });
  expect(destinationNames(arrival, ["fi"])).toEqual({
    sign: "Satama",
    signLang: "fi",
    translation: "",
    lang: "",
  });
  expect(
    destinationNames({ destinationdisplay: "Mylly", destinationdisplay_en: "mylly" }, ["en"])
  ).toEqual({ sign: "Mylly", signLang: "fi", translation: "", lang: "en" });
  expect(destinationNames({ destinationdisplay_en: "Airport" }, [])).toEqual({
    sign: "Airport",
    signLang: "en",
    translation: "",
    lang: "",
  });
});

test("wheelchair access is only named when Föli says", () => {
  expect(wheelchairLabel(1)).toBe("Wheelchair accessible");
  expect(wheelchairLabel(2)).toBe("Not wheelchair accessible");
  expect(wheelchairLabel(0)).toBe("");
});
