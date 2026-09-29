import { expect, test } from "vitest";
import { extractStopAlerts } from "./alerts";

const routesById = new Map([
  [
    "1",
    {
      id: "1",
      shortName: "1",
      longName: "Satama–Kauppatori–Lentoasema",
    },
  ],
  [
    "2",
    {
      id: "2",
      shortName: "1A",
      longName: "Satama–Kauppatori–Lentoasema",
    },
  ],
]);

test("returns active stop-specific alerts", () => {
  const result = extractStopAlerts(
    {
      global_message: {},
      emergency_message: {},
      messages: [
        {
          id: 1,
          isactive: true,
          priority: 50,
          affected_stops: ["164"],
          header: "Detour",
          message: "Use the temporary stop.",
        },
        {
          id: 2,
          isactive: true,
          priority: 10,
          affected_stops: ["32"],
          header: "Other stop",
        },
        {
          id: 3,
          isactive: false,
          affected_stops: ["164"],
          header: "Expired",
        },
      ],
    },
    { stopId: "164", lineRefs: [], routesById }
  );

  expect(result).toEqual([
    expect.objectContaining({
      type: "message",
      title: "Detour",
      message: "Use the temporary stop.",
    }),
  ]);
});

test("includes route-only disruptions for lines currently serving the stop", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          message_id: 217294,
          isactive: true,
          priority: 900,
          effect: "DETOUR",
          affected_stops: [],
          affected_routes: ["1", "2"],
          header: "Lines 1 and 1A on a detour",
          message: "Temporary route in the city centre.",
          information: "Stop 14 is not in use.",
        },
      ],
    },
    { stopId: "164", lineRefs: ["1"], routesById }
  );

  expect(result).toEqual([
    expect.objectContaining({
      type: "message",
      effectLabel: "Detour",
      routeNames: ["1", "1A"],
      information: "Stop 14 is not in use.",
    }),
  ]);
});

test("does not show a route-only alert for unrelated active lines", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          isactive: true,
          affected_routes: ["1"],
          affected_stops: [],
          header: "Line 1 detour",
        },
      ],
    },
    { stopId: "164", lineRefs: ["8"], routesById }
  );

  expect(result).toEqual([]);
});

test("puts active cancellations before service messages", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          isactive: true,
          priority: 1,
          affected_stops: ["164"],
          header: "General update",
        },
      ],
      cancellations: [
        {
          id: "c1",
          line: "1",
          cause: "TECHNICAL_PROBLEM",
          stops: [
            { stop: "164", arrival: 1900000000, isactive: true },
          ],
        },
      ],
    },
    { stopId: "164", lineRefs: ["1"], routesById }
  );

  expect(result[0]).toEqual(
    expect.objectContaining({
      type: "cancellation",
      line: "1",
      cause: "TECHNICAL_PROBLEM",
    })
  );
});

test("includes a non-empty global message but ignores empty envelopes", () => {
  expect(
    extractStopAlerts(
      { global_message: {}, emergency_message: {}, messages: [] },
      { stopId: "164", lineRefs: [], routesById }
    )
  ).toEqual([]);

  const result = extractStopAlerts(
    {
      global_message: {
        header: "Network-wide notice",
        message: "Expect unusually high demand today.",
      },
    },
    { stopId: "164", lineRefs: [], routesById }
  );

  expect(result[0]).toEqual(
    expect.objectContaining({
      type: "global",
      title: "Network-wide notice",
    })
  );
});

test("an emergency message replaces all other alert content", () => {
  const result = extractStopAlerts(
    {
      emergency_message: {
        header: "Emergency notice",
        message: "Follow Föli staff instructions.",
      },
      global_message: {
        message: "General message",
      },
      messages: [
        {
          isactive: true,
          affected_stops: ["164"],
          message: "Ordinary disruption",
        },
      ],
    },
    { stopId: "164", lineRefs: ["1"], routesById }
  );

  expect(result).toEqual([
    expect.objectContaining({
      type: "emergency",
      title: "Emergency notice",
      message: "Follow Föli staff instructions.",
    }),
  ]);
});


// A cancelled departure is not an ordinary notice: it is the bus's row on
// the board. Dropped with the notices, a cancelled 32 kept its countdown and
// "Get-off alert" through a storm warning.
test("keeps cancelled departures alongside an emergency notice", () => {
  const result = extractStopAlerts(
    {
      emergency_message: { header: "Storm warning" },
      messages: [
        { isactive: true, affected_stops: ["164"], message: "Ordinary disruption" },
      ],
      cancellations: [
        { id: 9, line: "32", stops: [{ stop: "164", isactive: true, arrival: 1_000 }] },
      ],
    },
    { stopId: "164", lineRefs: ["32"], routesById }
  );

  expect(result.map((alert) => [alert.type, alert.line || alert.title])).toEqual([
    ["emergency", "Storm warning"],
    ["cancellation", "32"],
  ]);
});

test("uses the user's preferred provider translation when available", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          message_id: 50,
          isactive: true,
          affected_stops: ["164"],
          header: "Poikkeusreitti",
          message: "Suomenkielinen viesti.",
          information: "Suomenkielinen lisätieto.",
          translations: {
            en_GB: {
              header: "Detour",
              message: "English service message.",
              information: "English additional information.",
            },
            sv_FI: {
              header: "Avvikande rutt",
              message: "Svenskt trafikmeddelande.",
              information: "Svensk tilläggsinformation.",
            },
          },
        },
      ],
    },
    {
      stopId: "164",
      lineRefs: [],
      routesById,
      preferredLanguages: ["en-US"],
    }
  );

  expect(result[0]).toEqual(
    expect.objectContaining({
      title: "Detour",
      message: "English service message.",
      information: "English additional information.",
    })
  );
});

test("falls back field-by-field when a provider translation is incomplete", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          message_id: 51,
          isactive: true,
          affected_stops: ["164"],
          header: "Pääotsikko",
          message: "Pääviesti",
          information: "Päälisätieto",
          translations: {
            en_GB: {
              header: "Translated title",
              message: "",
            },
          },
        },
      ],
    },
    {
      stopId: "164",
      lineRefs: [],
      routesById,
      preferredLanguages: ["en"],
    }
  );

  expect(result[0]).toEqual(
    expect.objectContaining({
      title: "Translated title",
      message: "Pääviesti",
      information: "Päälisätieto",
    })
  );
});

test("includes route-only disruptions discovered from static stop membership", () => {
  const result = extractStopAlerts(
    {
      messages: [
        {
          message_id: 88,
          isactive: true,
          priority: 500,
          affected_routes: ["2"],
          affected_stops: [],
          header: "Line 1A cancelled",
        },
      ],
    },
    {
      stopId: "164",
      lineRefs: [],
      routesById,
      servedRouteIds: new Set(["2"]),
    }
  );

  expect(result).toEqual([
    expect.objectContaining({
      title: "Line 1A cancelled",
      routeNames: ["1A"],
    }),
  ]);
});

test("normalizes HTTPS alert images and the active validity window", () => {
  const result = extractStopAlerts(
    {
      servertime: 1_900_000_000,
      messages: [
        {
          message_id: 90,
          isactive: true,
          affected_stops: ["164"],
          header: "Stop moved",
          repeat: [[1_899_999_000, 1_900_003_600]],
          images: [
            {
              url: "//data.foli.fi/media/detour.png",
              title: "Temporary stop map",
              type: "image/png",
            },
            { url: "javascript:alert(1)", title: "Unsafe" },
          ],
        },
      ],
    },
    { stopId: "164", lineRefs: [], routesById }
  );

  expect(result[0]).toEqual(
    expect.objectContaining({
      validity: { start: 1_899_999_000, end: 1_900_003_600 },
      images: [
        {
          url: "https://data.foli.fi/media/detour.png",
          title: "Temporary stop map",
          type: "image/png",
        },
      ],
    })
  );
});
// Föli's shape: the main text is Finnish, with English and Swedish
// translations beside it. With Finnish asked for first, a phone that also
// lists English (Chrome on Android does) got the English one.
const foliShapedNotice = {
  messages: [
    {
      message_id: 60,
      isactive: true,
      affected_stops: ["164"],
      header: "Linjan 1 poikkeusreitti",
      message: "Käytä tilapäistä pysäkkiä.",
      translations: {
        en_GB: { header: "Line 1 detour", message: "Use the temporary stop." },
        sv_FI: { header: "Linje 1 omledning", message: "Använd tillfällig hållplats." },
      },
    },
  ],
};

test.each([
  [["fi"], "Linjan 1 poikkeusreitti"],
  [["fi-FI", "fi", "en-US", "en"], "Linjan 1 poikkeusreitti"],
  [["fi-FI", "sv-FI"], "Linjan 1 poikkeusreitti"],
  [["sv-SE", "en"], "Linje 1 omledning"],
  [["de-DE", "en"], "Line 1 detour"],
])("reads Föli's notice for %j as %s", (preferredLanguages, title) => {
  const [alert] = extractStopAlerts(foliShapedNotice, {
    stopId: "164",
    lineRefs: [],
    routesById,
    preferredLanguages,
  });

  expect(alert.title).toBe(title);
});


test("keeps the cancelled trip's origin departure identity", () => {
  const result = extractStopAlerts(
    {
      cancellations: [
        {
          id: "c-origin",
          line: "1",
          departure: 1_900_000_000,
          stops: [
            { stop: "164", arrival: 1_900_000_900, isactive: true },
          ],
        },
      ],
    },
    { stopId: "164", lineRefs: ["1"], routesById }
  );

  expect(result).toEqual([
    expect.objectContaining({
      type: "cancellation",
      line: "1",
      scheduledTime: 1_900_000_900,
      originDepartureTime: 1_900_000_000,
    }),
  ]);
});
