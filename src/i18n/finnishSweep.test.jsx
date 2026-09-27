import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AREAS } from "./fi";
import { resetLanguageForTests } from ".";

// The screens a Finnish reader can reach, rendered in Finnish, and searched
// for English the app translates everywhere else. ESLint and the dictionary
// checks see the source; this sees what the passenger would, error states
// and all, which is where a phrase outside t() hides longest.

const mocks = vi.hoisted(() => ({
  fetchTripDetails: vi.fn(),
  fetchTripStopTimes: vi.fn(),
  fetchScheduledLineDepartures: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripDetails: mocks.fetchTripDetails,
  fetchTripStopTimes: mocks.fetchTripStopTimes,
  fetchScheduledLineDepartures: mocks.fetchScheduledLineDepartures,
}));

import AppErrorBoundary from "../components/AppErrorBoundary";
import BusStopDisplay from "../components/BusStopDisplay";
import BusStopForm from "../components/BusStopForm";
import ConnectivityStatus from "../components/ConnectivityStatus";
import HomeRecovery from "../components/HomeRecovery";
import LanguageSwitch from "../components/LanguageSwitch";
import MyPlaces from "../components/MyPlaces";
import NearbyStops from "../components/NearbyStops";
import QuickStops from "../components/QuickStops";
import RideMode from "../components/RideMode";
import RideSetup from "../components/RideSetup";
import SafePlaceDriverCard from "../components/SafePlaceDriverCard";
import ServiceAlerts from "../components/ServiceAlerts";
import TripJourneyDetails from "../components/TripJourneyDetails";

// Every stretch of English between placeholders that the dictionary turns
// into Finnish, kept when it is two words or more: a lone "min" or "Föli"
// is as likely to be a name or a unit as a leak.
const ENGLISH_PHRASES = [
  ...new Set(
    Object.values(AREAS).flatMap((entries) =>
      Object.entries(entries).flatMap(([key, finnish]) => {
        const english = key.includes("|") ? key.slice(key.indexOf("|") + 1) : key;
        if (finnish === english) return [];
        return english
          .split(/\{\w+\}/)
          .map((part) => part.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""))
          .filter((part) => (part.match(/[A-Za-z]{2,}/g) ?? []).length >= 2);
      })
    )
  ),
];

// Single words no Finnish sentence here uses, for English that never went
// through the dictionary at all.
const ENGLISH_WORDS =
  /\b(?:[Tt]he|[Aa]nd|[Yy]ou|[Yy]our|[Ss]tops?|[Dd]epartures?|[Ll]oading|[Rr]efresh|[Nn]ext|[Hh]ome|[Ll]ive|[Uu]pdates?|[Aa]lert|[Rr]ide|[Nn]ear|[Ss]how|[Ff]ind|[Ss]earch|[Ss]aved|[Pp]laces|[Ww]ork|[Ss]chool|[Ll]ate|[Ee]arly|[Ss]cheduled|[Tt]imetable|[Dd]river|[Bb]ackup|[Cc]ancel(?:led)?|[Cc]lose|[Tt]ry)\b/g;

// Names, which stay as they are in every language.
const NAMES = ["Turku Departures", "Google Maps", "CC BY 4.0", "data.foli.fi", "GitHub", "Mykola Dotsenko"];

const SPOKEN_ATTRIBUTES = [
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-roledescription",
  "title",
  "placeholder",
  "alt",
];

// What a Finnish reader sees or hears that is still English. English marked
// lang="en" is English on purpose: the driver card's second language and
// the switch back to English.
function englishOnScreen(root = document.body) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('[lang="en"], [lang^="en-"]').forEach((node) => node.remove());

  const texts = [];
  const walker = document.createTreeWalker(copy, globalThis.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    texts.push(node.nodeValue);
  }
  for (const element of copy.querySelectorAll("*")) {
    for (const name of SPOKEN_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) texts.push(value);
    }
  }

  let text = texts.join("\n");
  for (const name of NAMES) text = text.replaceAll(name, " ");

  return [
    ...ENGLISH_PHRASES.filter((phrase) => text.includes(phrase)),
    ...new Set(text.match(ENGLISH_WORDS) ?? []),
  ];
}

const leaks = [];

function sweep(state) {
  for (const phrase of englishOnScreen()) leaks.push(`${state}: ${phrase}`);
}

const NOW = Math.floor(Date.now() / 1000);

const STOPS = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
  { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
];
const STOPS_BY_ID = new Map(STOPS.map((stop) => [stop.id, stop]));

const HOME = {
  id: "home",
  label: "Home",
  icon: "⌂",
  primaryStopId: "164",
  stops: [
    { id: "164", name: "Kauppatori" },
    { id: "32", name: "Puistokatu" },
  ],
};

const THREE_STOP_TRIP = [
  { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
  { stopId: "32", arrivalTime: "17:46:00", departureTime: "17:46:00", stopSequence: 2, dropOffType: 0 },
  { stopId: "4", arrivalTime: "17:55:00", departureTime: "17:55:00", stopSequence: 3, dropOffType: 0 },
];

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");

function locateWith(getCurrentPosition) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}
const at = (coords) => (success) => success({ coords });
const failingWith = (code) => (_success, error) => error({ code });
const KAUPPATORI_FIX = { latitude: 60.45182, longitude: 22.26662, accuracy: 18 };

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests("fi");
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue(THREE_STOP_TRIP);
  mocks.fetchScheduledLineDepartures.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetLanguageForTests("en");
  localStorage.clear();
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("the sweep finds English, and leaves names and marked English alone", () => {
  render(
    <div>
      <p>Kauppatori · Turku Departures · Google Maps</p>
      <p lang="en">Could you help me get off at the right stop?</p>
      <button type="button" aria-label="Näytä lähdöt">
        Näytä
      </button>
    </div>
  );
  expect(englishOnScreen()).toEqual([]);
  cleanup();

  render(
    <div>
      <p>Show departures</p>
      <button type="button" aria-label="Try again" />
    </div>
  );
  expect(englishOnScreen()).toEqual(
    expect.arrayContaining(["Show departures", "Try again"])
  );
});

function board(props = {}) {
  return (
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={STOPS[0]}
      stops={STOPS}
      arrivals={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
      placesById={new Map()}
      onStartRide={() => {}}
      {...props}
    />
  );
}

const live = (overrides = {}) => ({
  lineref: "1",
  destinationdisplay: "Satama",
  destinationdisplay_en: "Harbour",
  tripref: "trip-1",
  monitored: true,
  recordedattime: NOW - 5,
  delay: 90,
  expecteddeparturetime: NOW + 240,
  aimeddeparturetime: NOW + 150,
  ...overrides,
});
const scheduled = (line, destination, inSeconds) => ({
  lineref: line,
  destinationdisplay: destination,
  tripref: `trip-${line}-${inSeconds}`,
  monitored: false,
  aimeddeparturetime: NOW + inSeconds,
});

test("the departure board, in every state it can be in", async () => {
  const states = {
    "board with live, late, nearby and scheduled rows": {
      stop: { ...STOPS[0] },
      arrivals: [
        live({ latitude: 60.4538, longitude: 22.2666 }),
        live({ tripref: "trip-2", delay: -70, vehicleatstop: true }),
        scheduled("32", "Varissuo", 900),
        scheduled("7", "Runosmäki", 60 * 60 * 30),
      ],
      scheduleAvailable: true,
    },
    "board loading": { serverTime: null, receivedAtMs: null, loading: true },
    "board that failed to load": { serverTime: null, receivedAtMs: null, error: true },
    "board with no departures": {},
    "board whose refresh failed": {
      arrivals: [live()],
      receivedAtMs: Date.now() - 90_000,
      error: true,
    },
    "board with an old answer": { arrivals: [live()], receivedAtMs: Date.now() - 200_000 },
    "board with no live data": {
      arrivals: [scheduled("32", "Varissuo", 300)],
      realtimeAvailable: false,
      scheduleAvailable: true,
    },
    "board whose timetable could not be checked": { scheduleFailed: true },
    "board cut short at an unchecked trip": {
      arrivals: [scheduled("32", "Varissuo", 300)],
      realtimeAvailable: true,
      scheduleAvailable: true,
      scheduleIncomplete: true,
    },
    "board with a cancelled departure": {
      arrivals: [scheduled("1", "Satama", 240), scheduled("1", "Satama", 900)],
      cancellations: [{ line: "1", scheduledTime: NOW + 240 }],
    },
    "board of a stop with no name yet": { stopName: "", stop: null },
    "board of a favourite stop": { isFavorite: true, onToggleFavorite: () => {} },
  };

  for (const [state, props] of Object.entries(states)) {
    render(board(props));
    sweep(state);
    cleanup();
  }

  // The line filter, open, then with nothing left to show.
  render(
    board({
      arrivals: [scheduled("1", "Satama", 60), scheduled("32", "Varissuo", 120)],
      scheduleAvailable: true,
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "Suodata linjoja" }));
  sweep("board with the line filter open");
  fireEvent.click(screen.getByRole("button", { name: "Linja 32" }));
  sweep("board following one line");
  cleanup();

  localStorage.setItem(
    "foli-line-filter-v1",
    JSON.stringify({ 164: { lines: ["99"], savedAt: Date.now() } })
  );
  render(
    board({
      arrivals: [scheduled("1", "Satama", 60), scheduled("32", "Varissuo", 120)],
    })
  );
  sweep("board checking a followed line's timetable");
  await screen.findByText(/seuraavan 36 tunnin aikana/);
  sweep("board following a line with nothing coming");
  cleanup();

  mocks.fetchScheduledLineDepartures.mockRejectedValueOnce(new Error("offline"));
  render(
    board({
      arrivals: [scheduled("1", "Satama", 60), scheduled("32", "Varissuo", 120)],
    })
  );
  await screen.findByText(/ei juuri nyt näy Fölin reaaliaikatiedoissa/);
  sweep("board following a line neither feed can answer for");
  cleanup();
  localStorage.clear();

  // A row's next stops, and its get-off setup.
  render(board({ arrivals: [live()] }));
  fireEvent.click(screen.getByRole("button", { name: /Seuraavat pysäkit/ }));
  await screen.findByText("Turun linna");
  sweep("board with next stops open");
  fireEvent.click(screen.getByRole("button", { name: "Pysäkkihälytys" }));
  await screen.findByDisplayValue("3");
  sweep("board with get-off setup open");

  expect(leaks).toEqual([]);
});

test("next stops that could not be loaded", async () => {
  mocks.fetchTripStopTimes.mockRejectedValue(new Error("offline"));
  render(
    <TripJourneyDetails tripId="trip-1" currentStopId="164" stopsById={STOPS_BY_ID} />
  );
  fireEvent.click(screen.getByRole("button", { name: /Seuraavat pysäkit/ }));
  await waitFor(() => expect(mocks.fetchTripStopTimes).toHaveBeenCalled());
  await act(async () => {});
  sweep("next stops that failed");

  expect(leaks).toEqual([]);
});

test("the stop search, and every way finding a stop can go wrong", async () => {
  const form = (props = {}) => (
    <BusStopForm
      activeStopId=""
      stops={STOPS}
      coordinatesStatus="ready"
      onSubmit={() => {}}
      {...props}
    />
  );

  render(form());
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kaup" } });
  sweep("search with suggestions");
  fireEvent.change(input, { target: { value: "zzz" } });
  fireEvent.submit(input.closest("form"));
  sweep("search that matched nothing");
  cleanup();

  const hub = [
    { id: "1", name: "Kauppatori" },
    { id: "2", name: "Kauppatori" },
  ];
  render(form({ stops: hub }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Kauppatori" } });
  fireEvent.submit(screen.getByRole("combobox").closest("form"));
  sweep("search for a name two stops share");
  cleanup();

  const locating = {
    "search located far away": at({ latitude: 60.1699, longitude: 24.9384, accuracy: 10 }),
    "search located roughly": at({ ...KAUPPATORI_FIX, accuracy: 3_000 }),
    "search with location blocked": failingWith(1),
    "search with location unavailable": failingWith(2),
    "search whose location timed out": failingWith(3),
  };
  for (const [state, getCurrentPosition] of Object.entries(locating)) {
    locateWith(getCurrentPosition);
    // The search's own location button is offered with a board open.
    render(form({ activeStopId: "164" }));
    fireEvent.click(screen.getByRole("button", { name: "Käytä nykyistä sijaintia" }));
    await screen.findByRole("alert");
    sweep(state);
    cleanup();
  }

  locateWith(at(KAUPPATORI_FIX));
  render(
    form({
      activeStopId: "164",
      coordinatesStatus: "loading",
      stops: [{ id: "164", name: "Kauppatori" }],
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "Käytä nykyistä sijaintia" }));
  sweep("search before stop locations have loaded");

  expect(leaks).toEqual([]);
});

test("Near you, found and not", async () => {
  const outside = {
    type: "MultiPolygon",
    coordinates: [[[[24, 61], [25, 61], [25, 62], [24, 62], [24, 61]]]],
  };
  const cases = {
    "near you with the nearest stop found": [at(KAUPPATORI_FIX), {}],
    "near you with location blocked": [failingWith(1), {}],
    "near you with location unavailable": [failingWith(2), {}],
    "near you located roughly": [at({ ...KAUPPATORI_FIX, accuracy: 2_500 }), {}],
    "near you located far away": [
      at({ latitude: 60.1699, longitude: 24.9384, accuracy: 10 }),
      {},
    ],
    "near you outside the Föli area": [at(KAUPPATORI_FIX), { serviceBoundary: outside }],
  };

  for (const [state, [getCurrentPosition, props]] of Object.entries(cases)) {
    locateWith(getCurrentPosition);
    render(
      <NearbyStops
        stops={STOPS}
        coordinatesStatus="ready"
        activeStopId="4"
        onSelect={() => {}}
        {...props}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Etsi lähin pysäkki" }));
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    );
    sweep(state);
    cleanup();
  }

  render(<NearbyStops stops={[]} coordinatesStatus="error" onSelect={() => {}} />);
  sweep("near you without stop locations");

  expect(leaks).toEqual([]);
});

test("service updates, feed down and full", () => {
  const notice = (id, overrides = {}) => ({
    id: `message-${id}`,
    type: "message",
    title: `Poikkeusreitti ${id}`,
    message: "Linja 1 kulkee Aurakatua pitkin.",
    information: "",
    effect: "DETOUR",
    effectLabel: "Poikkeusreitti",
    routeNames: ["1"],
    validity: { start: NOW - 3_600, end: NOW + 3_600 },
    images: [{ url: "https://data.foli.fi/media/kartta.png", title: "", type: "image/png" }],
    ...overrides,
  });

  render(
    <ServiceAlerts
      alerts={[
        notice(1, { type: "emergency" }),
        notice(2, { type: "global", routeNames: [] }),
        {
          id: "cancellation-1",
          type: "cancellation",
          title: "Peruttu lähtö",
          line: "32",
          cause: "BUS_BREAKDOWN",
          scheduledTime: NOW + 600,
          routeNames: ["32"],
          effect: "NO_SERVICE",
          effectLabel: "Ei liikennettä",
        },
        notice(3, { routeNames: ["1", "7"] }),
        notice(4),
        notice(5),
      ]}
      receivedAtMs={Date.now() - 11 * 60_000}
    />
  );
  for (const details of document.querySelectorAll("details")) details.open = true;
  fireEvent.click(screen.getByRole("button", { name: /Näytä 2 tiedotetta lisää/ }));
  sweep("service updates, all open");
  cleanup();

  render(<ServiceAlerts alerts={[]} error receivedAtMs={Date.now() - 20 * 60_000} />);
  sweep("service updates that could not be checked");

  expect(leaks).toEqual([]);
});

test("My Places, from the first visit to a place in use", async () => {
  const places = (props = {}) => (
    <MyPlaces
      stops={STOPS}
      coordinatesStatus="ready"
      activeStopId="32"
      placesById={new Map()}
      onSavePlace={() => {}}
      onImportSharedPlace={() => {}}
      onDismissSharedPlace={() => {}}
      onRemovePlace={() => {}}
      onSetPrimaryStop={() => {}}
      onOpenStop={() => {}}
      {...props}
    />
  );

  render(places());
  for (const details of document.querySelectorAll("details")) details.open = true;
  sweep("my places with nothing saved");
  cleanup();

  locateWith(at({ ...KAUPPATORI_FIX, accuracy: 2_500 }));
  render(places());
  fireEvent.click(screen.getAllByRole("button", { name: /^Käytä sijaintiani/ })[0]);
  await screen.findByRole("button", { name: "Tallenna koti" });
  sweep("setting up Home from a rough location");
  cleanup();

  const failing = {
    "setting up with location blocked": failingWith(1),
    "setting up far from any stop": at({ latitude: 60.1699, longitude: 24.9384, accuracy: 10 }),
  };
  for (const [state, getCurrentPosition] of Object.entries(failing)) {
    locateWith(getCurrentPosition);
    render(places());
    fireEvent.click(screen.getAllByRole("button", { name: /^Käytä sijaintiani/ })[0]);
    await screen.findByRole("alert");
    sweep(state);
    cleanup();
  }

  render(places({ placesById: new Map([["home", HOME]]) }));
  for (const details of document.querySelectorAll("details")) details.open = true;
  sweep("my places with Home saved");
  cleanup();

  render(
    places({
      placesById: new Map([["home", HOME]]),
      sharedPlace: { ...HOME, label: undefined },
    })
  );
  sweep("a shared Home offered in place of one already saved");
  cleanup();

  render(places({ online: false, placesById: new Map([["home", HOME]]) }));
  sweep("my places offline");

  expect(leaks).toEqual([]);
});

test("Get me Home, online and off, and the card for the driver", () => {
  render(<HomeRecovery home={HOME} stops={STOPS} onOpenStop={() => {}} />);
  for (const details of document.querySelectorAll("details")) details.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Kodin valinnat" }));
  sweep("get me home");
  cleanup();

  render(<HomeRecovery home={HOME} stops={STOPS} online={false} onOpenStop={() => {}} />);
  sweep("get me home offline");
  cleanup();

  render(
    <SafePlaceDriverCard place={HOME} primaryStop={{ id: "164", name: "" }} onClose={() => {}} />
  );
  sweep("driver card for a stop with no name");

  expect(leaks).toEqual([]);
});

test("setting up a ride, and every reason it cannot start", async () => {
  const setup = (arrival = {}) => (
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        destinationdisplay: "Satama",
        expecteddeparturetime: NOW + 600,
        ...arrival,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={STOPS_BY_ID}
      placesById={new Map([["home", { ...HOME, primaryStopId: "4", stops: [{ id: "4", name: "Turun linna" }] }]])}
      routesById={new Map()}
      onStart={() => {}}
      onCancel={() => {}}
    />
  );

  render(setup());
  fireEvent.click(await screen.findByDisplayValue("3"));
  sweep("ride setup with a stop chosen");
  cleanup();

  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", stopSequence: 1, dropOffType: 0 },
    { stopId: "32", arrivalTime: "17:46:00", departureTime: "17:46:00", stopSequence: 2, dropOffType: 0 },
  ]);
  render(setup());
  fireEvent.click(await screen.findByDisplayValue("2"));
  fireEvent.click(screen.getByRole("button", { name: "Käynnistä pysäkkihälytys" }));
  await screen.findByRole("alert");
  sweep("ride setup that cannot make a plan");
  cleanup();

  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    { stopId: "32", departureTime: "17:46:00", stopSequence: 2, dropOffType: 0 },
    { stopId: "164", departureTime: "17:51:00", stopSequence: 3, dropOffType: 0 },
  ]);
  render(setup({ expecteddeparturetime: null }));
  await screen.findByRole("alert");
  sweep("ride setup for a trip that loops back");
  cleanup();

  mocks.fetchTripStopTimes.mockRejectedValue(new Error("offline"));
  render(setup());
  await waitFor(() => expect(mocks.fetchTripStopTimes).toHaveBeenCalled());
  await act(async () => {});
  sweep("ride setup whose stops could not be loaded");

  expect(leaks).toEqual([]);
});

test("Ride Mode, from the start of a ride to a missed stop", () => {
  const session = (stage) => ({
    id: "ride-1",
    lineRef: "1",
    tripRef: "trip-1",
    routeType: 3,
    destination: "Satama",
    stage,
    targetStop: { id: "32", name: "Puistokatu" },
    previousStop: { id: "164", name: "Kauppatori" },
    nextStop: { id: "4", name: "Turun linna" },
    boardingStop: { id: "164", name: "Kauppatori" },
    options: { locationBackup: true, notifications: true },
  });
  const onRoute = {
    status: "active",
    shapeUsable: true,
    onRoute: true,
    routeDistanceM: 420,
    routeEtaSec: 55,
    distanceM: 300,
    error: "",
  };
  const states = {
    "ride waiting for the bus": ["boarding", { trackingHealth: "schedule", remainingStops: 4 }, { status: "off", error: "" }],
    "ride on its way": ["riding", { trackingHealth: "live", liveEtaSec: 600, remainingStops: 4, targetMatchBy: "trip", previousSeen: true }, onRoute],
    "ride approaching": ["soon", { trackingHealth: "live", etaSec: 240, remainingStops: 2 }, onRoute],
    "ride with the stop next": ["next", { trackingHealth: "live", liveEtaSec: 70, scheduleEtaSec: 80, remainingStops: 1, targetMatchBy: "trip" }, onRoute],
    "ride at the stop": ["now", { trackingHealth: "live", etaSec: 0, remainingStops: 0 }, { status: "off", distanceM: null, error: "" }],
    "ride past the stop": ["missed", { trackingHealth: "delayed", liveEtaSec: -90, remainingStops: 0 }, { status: "active", shapeUsable: true, onRoute: true, routeDistanceM: -180, error: "" }],
    "ride with an old location": ["soon", { trackingHealth: "delayed", etaSec: 240, remainingStops: 2, gpsAgeSec: 300 }, onRoute],
    "ride that may be on the wrong bus": ["soon", { trackingHealth: "live", etaSec: 240, remainingStops: 2 }, { status: "off-route", distanceM: 900, offRouteSuspected: true, error: "" }],
    "ride with location refused": ["soon", { trackingHealth: "live", etaSec: 240, remainingStops: 2 }, { status: "error", error: "Location backup was not allowed." }],
    "ride going by the timetable": ["soon", { trackingHealth: "schedule", etaSec: 200, remainingStops: 2, targetMatchBy: "dated-journey" }, { status: "off", error: "" }],
    "ride with live data lost": ["soon", { trackingHealth: "lost", etaSec: 200, remainingStops: 2 }, { status: "searching", error: "" }],
  };

  for (const [state, [stage, runtime, gps]] of Object.entries(states)) {
    render(
      <RideMode
        session={session(stage)}
        runtime={runtime}
        gps={gps}
        wakeLockState={stage === "missed" ? "inactive" : "active"}
        onTestAlert={() => {}}
        onEndRide={() => {}}
        onOpenStop={() => {}}
      />
    );
    sweep(state);
    cleanup();
  }

  expect(leaks).toEqual([]);
});

test("the smaller pieces: offline banner, saved stops, a crash, the switch", () => {
  render(<ConnectivityStatus online={false} />);
  sweep("offline banner");
  cleanup();

  render(
    <QuickStops
      favorites={[{ id: "164", name: "Kauppatori" }]}
      recents={[{ id: "32", name: "Puistokatu" }, { id: "40", name: "" }]}
      activeStopId=""
      onSelect={() => {}}
    />
  );
  sweep("saved and recent stops");
  cleanup();

  vi.spyOn(console, "error").mockImplementation(() => {});
  function Crash() {
    throw new Error("boom");
  }
  render(
    <AppErrorBoundary>
      <Crash />
    </AppErrorBoundary>
  );
  sweep("the crash screen");
  cleanup();

  render(<LanguageSwitch />);
  sweep("the language switch");

  expect(leaks).toEqual([]);
});

afterEach(() => {
  leaks.length = 0;
});
