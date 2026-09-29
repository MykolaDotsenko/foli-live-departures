// Time as the page and the mocks see it: the morning-commute clock, GTFS service-day times.

// The README's and the install sheet's pictures showed whatever hour the
// suite ran at, 01:00 more often than not. For them, the page and the mocks
// here both move to 08:10 in Turku, so every time on screen agrees.
let restoreClock = null;

export async function atMorningCommute(page) {
  const realNow = Date.now.bind(Date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(realNow()))
      .map((part) => [part.type, part.value])
  );
  const offsetHours = Number(parts.timeZoneName.match(/GMT([+-]\d+)/)?.[1] || 0);
  const morning = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    8 - offsetHours,
    10
  );
  const shift = morning - realNow();
  Date.now = () => realNow() + shift;
  restoreClock = () => {
    Date.now = realNow;
  };
  // Only Date is fixed. Real timers must keep running: Ride Mode polls the
  // target stop on timers, and freezing them made the screenshot scenario
  // intermittently miss its strongest "vehicle at stop" evidence.
  await page.clock.setFixedTime(Date.now());
}

// Called after every test by the shared fixture (./test.js), so one
// scenario's morning never leaks into the next one on the same worker.
export function restoreRealClock() {
  restoreClock?.();
  restoreClock = null;
}

// GTFS writes a trip's times in its service day, which runs past midnight
// ("24:05:00") until early morning.
export function gtfsClockAt(unixSeconds) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(unixSeconds * 1000));
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  let seconds = part("hour") * 3600 + part("minute") * 60 + part("second");
  if (seconds < 4 * 3600) seconds += 86_400;
  return (offset) => {
    const at = seconds + offset;
    return [Math.floor(at / 3600), Math.floor((at % 3600) / 60), at % 60]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };
}
