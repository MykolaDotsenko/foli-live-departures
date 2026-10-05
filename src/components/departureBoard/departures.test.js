import { expect, test } from "vitest";
import {
  DEPARTED_GRACE_SECONDS,
  departedSetKey,
  departureKeys,
  destinationAnswer,
  isCancelledHere,
  upcomingDepartures,
} from "./departures";

const NOW = 1_790_000_000;

function departure(overrides = {}) {
  return {
    lineref: "1",
    destinationdisplay: "Satama",
    tripref: "trip-1",
    aimeddeparturetime: NOW + 300,
    expecteddeparturetime: NOW + 300,
    ...overrides,
  };
}

test("upcoming departures drop buses gone past the grace and sort by time", () => {
  const later = departure({ tripref: "b", expecteddeparturetime: NOW + 600 });
  const sooner = departure({ tripref: "a", expecteddeparturetime: NOW + 60 });
  const justLeft = departure({
    tripref: "c",
    aimeddeparturetime: NOW - DEPARTED_GRACE_SECONDS,
    expecteddeparturetime: NOW - DEPARTED_GRACE_SECONDS,
  });
  const gone = departure({
    tripref: "d",
    aimeddeparturetime: NOW - DEPARTED_GRACE_SECONDS - 1,
    expecteddeparturetime: NOW - DEPARTED_GRACE_SECONDS - 1,
  });
  const arrivals = [later, gone, sooner, justLeft];

  expect(upcomingDepartures(arrivals, NOW)).toEqual([justLeft, sooner, later]);
  // The answer itself is left as it came.
  expect(arrivals[0]).toBe(later);
});

test("a departure keeps its key when its estimate moves", () => {
  const [first] = departureKeys([departure()], NOW, "164");
  const [moved] = departureKeys(
    [departure({ expecteddeparturetime: NOW + 420 })],
    NOW,
    "164"
  );

  expect(moved).toBe(first);
  expect(first).toBe(`164-1-trip-1-${NOW + 300}`);
});

test("the same trip at a neighbouring stop gets its own key", () => {
  const [here] = departureKeys([departure()], NOW, "164");
  const [there] = departureKeys([departure()], NOW, "165");

  expect(here).not.toBe(there);
});

test("identical rows still get unique keys", () => {
  expect(departureKeys([departure(), departure(), departure()], NOW, "164")).toEqual([
    `164-1-trip-1-${NOW + 300}`,
    `164-1-trip-1-${NOW + 300}#1`,
    `164-1-trip-1-${NOW + 300}#2`,
  ]);
});

test("the departed set is the same however the answer is ordered", () => {
  const a = departure({ tripref: "a" });
  const b = departure({ lineref: "2", tripref: "", datedvehiclejourneyref: "dvj" });

  expect(departedSetKey([a, b])).toBe(departedSetKey([b, a]));
  expect(departedSetKey([b])).toBe(`2|dvj|${NOW + 300}`);
});

test("a cancellation matches its line and planned time only", () => {
  const arrival = departure({ aimedarrivaltime: NOW + 300 });

  expect(isCancelledHere(arrival, [])).toBe(false);
  expect(isCancelledHere(arrival, undefined)).toBe(false);
  expect(
    isCancelledHere(arrival, [{ line: "1", scheduledTime: NOW + 390 }])
  ).toBe(true);
  expect(
    isCancelledHere(arrival, [{ line: "1", scheduledTime: NOW + 391 }])
  ).toBe(false);
  expect(
    isCancelledHere(arrival, [{ line: "2", scheduledTime: NOW + 300 }])
  ).toBe(false);
});

test("a cancellation with the trip's origin does not reach the next run", () => {
  const arrival = departure({ originaimeddeparturetime: NOW - 600 });

  expect(
    isCancelledHere(arrival, [
      { line: "1", scheduledTime: NOW + 300, originDepartureTime: NOW - 580 },
    ])
  ).toBe(true);
  expect(
    isCancelledHere(arrival, [
      { line: "1", scheduledTime: NOW + 300, originDepartureTime: NOW - 540 },
    ])
  ).toBe(false);
});

test("a row without a planned time is never taken for cancelled", () => {
  expect(
    isCancelledHere(
      departure({ aimeddeparturetime: undefined }),
      [{ line: "1", scheduledTime: NOW + 300 }]
    )
  ).toBe(false);
});

test("the destination answer is the bus there first, called fastest only against another", () => {
  const now = 1_000_000;
  const goes = (rideDurationSec) => ({
    status: "compatible",
    destinationStopId: "900",
    rideDurationSec,
  });
  const row = (lineref, inSeconds, fit) => ({
    arrival: { lineref, aimeddeparturetime: now + inSeconds },
    fit,
  });

  // Gone a minute ago, and a bus whose ride is unknown: neither is
  // compared, and the 18 with a known arrival is the answer.
  const answer = destinationAnswer(
    [
      row("1", -60, goes(60)),
      row("3", 120, goes(null)),
      row("18", 300, goes(600)),
    ],
    now,
    []
  );
  expect(answer.best).toMatchObject({
    arrivalAt: now + 900,
    departureAt: now + 300,
    stopId: "900",
  });
  expect(answer.best.arrival.lineref).toBe("18");
  expect(answer.compared).toBe(1);
  expect(answer.unchecked).toBe(false);

  // A row with nothing known about it keeps "none goes there" unsaid.
  expect(
    destinationAnswer(
      [row("7", 120, { status: "not-serving" }), row("8", 240, null)],
      now,
      []
    )
  ).toEqual({ best: null, compared: 0, unchecked: true });
});
