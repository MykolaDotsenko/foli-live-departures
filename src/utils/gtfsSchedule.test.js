import { describe, expect, it } from "vitest";
import {
  gtfsServiceEpoch,
  mergeRealtimeAndScheduled,
  scheduledClockCandidates,
  scheduledClockWindow,
  serviceDateKey,
  serviceRunsOnDate,
} from "./gtfsSchedule";

describe("GTFS scheduled departure helpers", () => {
  it("converts a Turku service date and clock into the correct epoch", () => {
    // 2026-09-21 15:20 in Helsinki is 12:20 UTC (EEST).
    expect(gtfsServiceEpoch("20260921", "15:20:00")).toBe(
      Date.parse("2026-09-21T12:20:00Z") / 1000
    );
  });


  it("anchors spring-forward service times to GTFS noon-minus-12 semantics", () => {
    // GTFS times are elapsed service-day time, not naive local wall-clock.
    // In Helsinki on 2026-03-29, local noon is 09:00Z; noon minus 12h is
    // 21:00Z on the previous day. Therefore 02:30:00 is 23:30Z.
    expect(gtfsServiceEpoch("20260329", "02:30:00")).toBe(
      Date.parse("2026-03-28T23:30:00Z") / 1000
    );
  });

  it("anchors fall-back service times to GTFS noon-minus-12 semantics", () => {
    // On 2026-10-25 Helsinki noon is 10:00Z; noon minus 12h is 22:00Z on
    // the previous day. Therefore GTFS 02:30:00 is 00:30Z, independent of
    // the repeated local hour later that night.
    expect(gtfsServiceEpoch("20261025", "02:30:00")).toBe(
      Date.parse("2026-10-25T00:30:00Z") / 1000
    );
  });

  it("keeps GTFS times beyond 24:00 on the originating service date", () => {
    expect(gtfsServiceEpoch("20260921", "24:10:00")).toBe(
      Date.parse("2026-09-21T21:10:00Z") / 1000
    );
  });

  it("derives service dates in Europe/Helsinki instead of the device timezone", () => {
    expect(
      serviceDateKey(Date.parse("2026-09-20T21:30:00Z") / 1000)
    ).toBe("20260921");
  });

  it("uses the weekly GTFS calendar for ordinary service days", () => {
    const calendar = {
      weekday: {
        monday: 1,
        tuesday: 1,
        wednesday: 1,
        thursday: 1,
        friday: 1,
        saturday: 0,
        sunday: 0,
        startDate: "20260901",
        endDate: "20260930",
      },
    };

    // 2026-09-21 is Monday.
    expect(serviceRunsOnDate(calendar, {}, "weekday", "20260921")).toBe(true);
    expect(serviceRunsOnDate(calendar, {}, "weekday", "20260920")).toBe(false);
    expect(serviceRunsOnDate(calendar, {}, "weekday", "20261001")).toBe(false);
  });

  it("lets calendar-date exceptions override the weekly calendar", () => {
    const calendar = {
      weekday: {
        monday: 1,
        tuesday: 1,
        wednesday: 1,
        thursday: 1,
        friday: 1,
        saturday: 0,
        sunday: 0,
        startDate: "20260901",
        endDate: "20260930",
      },
      special: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0,
        startDate: "20260901",
        endDate: "20260930",
      },
    };
    const calendarDates = {
      weekday: [{ date: "20260921", exceptionType: 2 }],
      special: [
        { date: "20260921", exceptionType: 0 },
        { date: "20260922", exceptionType: 1 },
      ],
    };

    expect(
      serviceRunsOnDate(calendar, calendarDates, "weekday", "20260921")
    ).toBe(false);
    expect(
      serviceRunsOnDate(calendar, calendarDates, "special", "20260921")
    ).toBe(true);
    expect(
      serviceRunsOnDate(calendar, calendarDates, "special", "20260922")
    ).toBe(true);
    expect(
      serviceRunsOnDate(calendar, calendarDates, "missing", "20260921")
    ).toBe(false);
  });

  it("finds timetable rows around now across midnight", () => {
    const reference = Date.parse("2026-09-21T20:55:00Z") / 1000; // 23:55 Helsinki
    const candidates = scheduledClockCandidates(
      [
        {
          tripId: "late",
          arrivalTime: "24:10:00",
          departureTime: "24:10:00",
          pickupType: 0,
        },
        {
          tripId: "tomorrow",
          arrivalTime: "00:20:00",
          departureTime: "00:20:00",
          pickupType: 0,
        },
      ],
      reference,
      { lookaheadSeconds: 60 * 60 }
    );

    expect(candidates.map((item) => item.tripId)).toEqual([
      "late",
      "tomorrow",
    ]);
    expect(candidates[0].serviceDate).toBe("20260921");
    expect(candidates[1].serviceDate).toBe("20260922");
  });

  it("keeps tomorrow morning in the default fallback horizon", () => {
    const reference = Date.parse("2026-09-21T12:45:00Z") / 1000; // 15:45 Helsinki
    const candidates = scheduledClockCandidates(
      [
        {
          tripId: "tomorrow-morning",
          departureTime: "06:30:00",
          arrivalTime: "06:30:00",
          pickupType: 0,
        },
      ],
      reference
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].serviceDate).toBe("20260922");
    expect(candidates[0].aimedDepartureTime).toBe(
      Date.parse("2026-09-22T03:30:00Z") / 1000
    );
  });

  it("excludes drop-off-only and far-away timetable rows", () => {
    const reference = Date.parse("2026-09-21T12:15:00Z") / 1000;
    const candidates = scheduledClockCandidates(
      [
        {
          tripId: "boardable",
          departureTime: "15:20:00",
          pickupType: 0,
        },
        {
          tripId: "dropoff-only",
          departureTime: "15:21:00",
          pickupType: 1,
        },
        {
          tripId: "too-late",
          departureTime: "22:00:00",
          pickupType: 0,
        },
      ],
      reference,
      { lookaheadSeconds: 4 * 60 * 60 }
    );

    expect(candidates.map((item) => item.tripId)).toEqual(["boardable"]);
  });

  it("says when the row cap cut candidates inside the window", () => {
    const reference = Date.parse("2026-09-21T12:15:00Z") / 1000; // 15:15 Helsinki
    const rows = ["15:20:00", "15:30:00", "15:40:00"].map((time, index) => ({
      tripId: `trip-${index}`,
      departureTime: time,
      pickupType: 0,
    }));
    const options = { lookaheadSeconds: 60 * 60 };

    const cut = scheduledClockWindow(rows, reference, { ...options, maxRows: 2 });
    expect(cut.candidates.map((item) => item.tripId)).toEqual(["trip-0", "trip-1"]);
    expect(cut.truncated).toBe(true);

    const whole = scheduledClockWindow(rows, reference, { ...options, maxRows: 3 });
    expect(whole.candidates).toHaveLength(3);
    expect(whole.truncated).toBe(false);
    expect(scheduledClockCandidates(rows, reference, { ...options, maxRows: 2 })).toEqual(
      cut.candidates
    );
  });

  it("lets a realtime row replace its scheduled copy", () => {
    const realtime = [
      {
        tripref: "trip-32",
        lineref: "32",
        monitored: true,
        aimeddeparturetime: 1000,
        expecteddeparturetime: 1040,
      },
    ];
    const scheduled = [
      {
        tripref: "trip-32",
        lineref: "32",
        monitored: false,
        aimeddeparturetime: 1000,
      },
      {
        tripref: "trip-99",
        lineref: "99",
        monitored: false,
        aimeddeparturetime: 1100,
      },
    ];

    expect(
      mergeRealtimeAndScheduled(realtime, scheduled).map((row) => [
        row.tripref,
        row.monitored,
      ])
    ).toEqual([
      ["trip-32", true],
      ["trip-99", false],
    ]);
  });

  it("deduplicates by line and aimed time when SIRI omits the trip reference", () => {
    const realtime = [
      {
        tripref: "",
        lineref: "32",
        aimeddeparturetime: 1000,
      },
    ];
    const scheduled = [
      {
        tripref: "static-trip",
        lineref: "32",
        aimeddeparturetime: 1080,
      },
    ];

    expect(mergeRealtimeAndScheduled(realtime, scheduled)).toHaveLength(1);
  });
});


it("one realtime row without trip identity replaces at most one nearby scheduled departure", () => {
  const realtime = [
    {
      tripref: "",
      lineref: "1",
      monitored: true,
      aimeddeparturetime: 1_000,
      expecteddeparturetime: 1_020,
    },
  ];
  const scheduled = [
    {
      tripref: "scheduled-a",
      lineref: "1",
      monitored: false,
      aimeddeparturetime: 1_000,
    },
    {
      tripref: "scheduled-b",
      lineref: "1",
      monitored: false,
      aimeddeparturetime: 1_090,
    },
  ];

  const merged = mergeRealtimeAndScheduled(realtime, scheduled, {
    timeToleranceSeconds: 120,
  });

  expect(merged.map((row) => row.tripref)).toEqual(["", "scheduled-b"]);
});


it("exact trip identity wins before fuzzy line-time matching", () => {
  const realtime = [
    {
      tripref: "trip-exact",
      lineref: "1",
      monitored: true,
      aimeddeparturetime: 1_090,
    },
  ];
  const scheduled = [
    {
      tripref: "trip-nearby",
      lineref: "1",
      monitored: false,
      aimeddeparturetime: 1_000,
    },
    {
      tripref: "trip-exact",
      lineref: "1",
      monitored: false,
      aimeddeparturetime: 1_090,
    },
  ];

  const merged = mergeRealtimeAndScheduled(realtime, scheduled, {
    timeToleranceSeconds: 120,
  });

  expect(merged.map((row) => row.tripref)).toEqual([
    "trip-exact",
    "trip-nearby",
  ]);
});


it("never fuzzy-deduplicates two departures with different known trip identities", () => {
  const realtime = [
    {
      tripref: "live-trip",
      lineref: "1",
      monitored: true,
      aimeddeparturetime: 1_000,
    },
  ];
  const scheduled = [
    {
      tripref: "scheduled-trip",
      lineref: "1",
      monitored: false,
      aimeddeparturetime: 1_060,
    },
  ];

  const merged = mergeRealtimeAndScheduled(realtime, scheduled, {
    timeToleranceSeconds: 120,
  });

  expect(merged.map((row) => row.tripref)).toEqual([
    "live-trip",
    "scheduled-trip",
  ]);
});
