import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";

afterEach(() => {
  resetLanguageForTests("en");
  vi.unstubAllEnvs();
});

const mocks = vi.hoisted(() => ({
  fetchTripDetails: vi.fn(),
  fetchTripStopTimes: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchTripDetails: mocks.fetchTripDetails,
  fetchTripStopTimes: mocks.fetchTripStopTimes,
}));

import RideSetup from "./RideSetup";

test("prefers a saved Home stop and builds an exact trip/shape ride plan", async () => {
  mocks.fetchTripDetails.mockResolvedValue({
    tripId: "trip-164-1",
    routeId: "1",
    shapeId: "shape-1",
  });
  mocks.fetchTripStopTimes.mockResolvedValue([
    {
      stopId: "164",
      departureTime: "17:41:00",
      stopSequence: 1,
      dropOffType: 0,
      timepoint: 1,
      shapeDistTraveled: 0,
    },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
      timepoint: 0,
      shapeDistTraveled: 900,
    },
    {
      stopId: "4",
      arrivalTime: "17:55:00",
      departureTime: "17:55:00",
      stopSequence: 3,
      dropOffType: 0,
      timepoint: 1,
      shapeDistTraveled: 1800,
    },
  ]);

  const onStart = vi.fn();
  const stopsById = new Map([
    ["164", { id: "164", name: "Kauppatori", lat: 60.45, lon: 22.26 }],
    ["32", { id: "32", name: "Puistokatu", lat: 60.44, lon: 22.25 }],
    ["4", { id: "4", name: "Turun linna", lat: 60.43, lon: 22.23 }],
  ]);
  const placesById = new Map([
    [
      "home",
      {
        id: "home",
        label: "Home",
        primaryStopId: "32",
        stops: [{ id: "32", name: "Puistokatu" }],
      },
    ],
  ]);

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        datedvehiclejourneyref: "journey-1",
        vehicleref: "bus-1",
        destinationdisplay: "Satama",
        expecteddeparturetime: 2_000_000_000,
        originaimeddeparturetime: 1_999_999_900,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={stopsById}
      placesById={placesById}
      routesById={new Map([["1", { id: "1", type: 3 }]])}
      onStart={onStart}
      onCancel={() => {}}
    />
  );

  expect(
    await screen.findByRole("heading", { name: "Where do you want to get off?" })
  ).toBeInTheDocument();
  expect(screen.getByText("Home")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByDisplayValue("2")).toBeChecked();
  });

  fireEvent.click(
    screen.getByRole("checkbox", { name: /Follow my location/i })
  );
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart).toHaveBeenCalledTimes(1);
  const config = onStart.mock.calls[0][0];
  expect(config.targetStop.id).toBe("32");
  expect(config.previousStop.id).toBe("164");
  expect(config.nextStop.id).toBe("4");
  expect(config.options.locationBackup).toBe(false);
  expect(config.routeId).toBe("1");
  expect(config.routeType).toBe(3);
  expect(config.shapeId).toBe("shape-1");
  expect(config.targetStop.stopSequence).toBe(2);
  expect(config.targetStop.shapeDistTraveled).toBe(900);
  expect(config.plan.targetPredictedEpochSec).toBe(2_000_000_300);
});

test("native Android foreground companion requires an explicit per-ride opt-in", async () => {
  vi.stubEnv("VITE_NATIVE_BUILD", "true");
  mocks.fetchTripDetails.mockResolvedValue({
    tripId: "trip-164-1",
    routeId: "1",
    shapeId: "shape-1",
  });
  mocks.fetchTripStopTimes.mockResolvedValue([
    {
      stopId: "164",
      departureTime: "17:41:00",
      stopSequence: 1,
      dropOffType: 0,
    },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
    },
  ]);

  const onStart = vi.fn();
  renderSetup({ onStart });

  const nativeOption = await screen.findByRole("checkbox", {
    name: /Keep Ride Mode active on Android/i,
  });
  expect(nativeOption).not.toBeChecked();
  expect(nativeOption).toBeEnabled();

  fireEvent.click(screen.getByDisplayValue("2"));
  fireEvent.click(nativeOption);
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart.mock.calls[0][0].options).toMatchObject({
    locationBackup: true,
    nativeForeground: true,
  });
  expect(onStart.mock.calls[0][0].options.notifications).toBe(false);
});

// "route point 900 m" was shape_dist_traveled shown to a passenger. What is
// useful from a list of stop names is how far along the ride each one is.
test("describes each stop by where it falls in the ride, not by GTFS fields", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    // The bus stops here but nobody may get off, so it is not offered as a
    // choice — yet it still counts towards "after" and "stops away".
    { stopId: "99", departureTime: "17:43:00", stopSequence: 2, dropOffType: 1 },
    { stopId: "32", departureTime: "17:46:00", stopSequence: 3, dropOffType: 0 },
  ]);

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={
        new Map([
          ["99", { id: "99", name: "Portsa" }],
          ["32", { id: "32", name: "Puistokatu" }],
        ])
      }
      placesById={new Map()}
      routesById={new Map()}
      onStart={() => {}}
      onCancel={() => {}}
    />
  );

  const option = await screen.findByText(/stops away/);
  expect(option).toHaveTextContent("2 stops away");
  expect(option).toHaveTextContent("around 17:46");
  // Counted against the real trip, so the skipped stop is still the one before.
  expect(option).toHaveTextContent("after Portsa");
  expect(screen.queryByText(/route point/i)).not.toBeInTheDocument();
});

function renderSetup(overrides = {}) {
  const stopsById = new Map([
    ["164", { id: "164", name: "Kauppatori", lat: 60.45, lon: 22.26 }],
    ["32", { id: "32", name: "Puistokatu", lat: 60.44, lon: 22.25 }],
  ]);

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        datedvehiclejourneyref: "journey-1",
        vehicleref: "bus-1",
        destinationdisplay: "Satama",
        expecteddeparturetime: 2_000_000_000,
        originaimeddeparturetime: 1_999_999_900,
        ...overrides.arrival,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={stopsById}
      placesById={new Map()}
      routesById={new Map([["1", { id: "1", type: 3 }]])}
      onStart={overrides.onStart || (() => {})}
      onCancel={() => {}}
    />
  );
}

// An enabled button that does nothing when pressed is the worst possible
// failure on the action the whole feature hangs on.
test("says why the ride cannot start instead of ignoring the button", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  // The boarding row carries no time at all, so no plan can be anchored.
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", stopSequence: 1, dropOffType: 0 },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
    },
  ]);

  const onStart = vi.fn();
  renderSetup({ onStart });

  await screen.findByRole("button", { name: "Start get-off alert" });
  fireEvent.click(screen.getByDisplayValue("2"));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart).not.toHaveBeenCalled();
  expect(
    await screen.findByRole("alert")
  ).toHaveTextContent(/cannot work out a reliable plan/i);
});

test("explains a departure with no usable time", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
    },
  ]);

  const onStart = vi.fn();
  renderSetup({
    onStart,
    arrival: {
      expecteddeparturetime: null,
      aimeddeparturetime: null,
      expectedarrivaltime: null,
      aimedarrivaltime: null,
    },
  });

  await screen.findByRole("button", { name: "Start get-off alert" });
  fireEvent.click(screen.getByDisplayValue("2"));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /do not have a departure time/i
  );
});

test("clears a start error once another stop is chosen", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", stopSequence: 1, dropOffType: 0 },
    {
      stopId: "32",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
    },
    {
      stopId: "4",
      departureTime: "17:55:00",
      stopSequence: 3,
      dropOffType: 0,
    },
  ]);

  renderSetup();

  await screen.findByRole("button", { name: "Start get-off alert" });
  fireEvent.click(screen.getByDisplayValue("2"));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();

  fireEvent.click(screen.getByDisplayValue("3"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("refuses to guess when the trip passes the boarding stop twice", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    { stopId: "32", departureTime: "17:46:00", stopSequence: 2, dropOffType: 0 },
    { stopId: "164", departureTime: "17:51:00", stopSequence: 3, dropOffType: 0 },
  ]);

  renderSetup({ arrival: { aimeddeparturetime: null } });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /comes back to this stop later/i
  );
  expect(
    screen.queryByRole("button", { name: "Start get-off alert" })
  ).not.toBeInTheDocument();
});

const threeStopTrip = [
  { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
  { stopId: "32", arrivalTime: "17:46:00", departureTime: "17:46:00", stopSequence: 2, dropOffType: 0 },
  { stopId: "4", arrivalTime: "17:55:00", departureTime: "17:55:00", stopSequence: 3, dropOffType: 0 },
];
const tripStops = new Map([
  ["164", { id: "164", name: "Kauppatori" }],
  ["32", { id: "32", name: "Puistokatu" }],
  ["4", { id: "4", name: "Turun linna" }],
]);

function renderThreeStopSetup({ placesById = new Map(), onStart = vi.fn() } = {}) {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue(threeStopTrip);
  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        destinationdisplay: "Satama",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={tripStops}
      placesById={placesById}
      routesById={new Map()}
      onStart={onStart}
      onCancel={() => {}}
    />
  );
  return onStart;
}

test("preselects the main Home stop, not a backup the bus reaches first", async () => {
  renderThreeStopSetup({
    placesById: new Map([
      [
        "home",
        {
          id: "home",
          label: "Home",
          primaryStopId: "4",
          stops: [
            { id: "32", name: "Puistokatu" },
            { id: "4", name: "Turun linna" },
          ],
        },
      ],
    ]),
  });

  await waitFor(() => expect(screen.getByDisplayValue("3")).toBeChecked());
  expect(screen.getByDisplayValue("2")).not.toBeChecked();
});

test("names the chosen stop beside the button that starts the ride", async () => {
  // On a phone the button is pinned to the bottom of the screen while the
  // list can sit out of view, so the bar itself says where the ride goes.
  renderThreeStopSetup();
  fireEvent.click(await screen.findByDisplayValue("3"));

  expect(screen.getByText(/Get off at Turun linna/)).toBeInTheDocument();
});

test("does not offer notifications a browser cannot send", async () => {
  // iPhone Safari has no Notification API outside a Home Screen app, and
  // the option then did nothing at all.
  const original = globalThis.Notification;
  delete globalThis.Notification;
  try {
    const onStart = renderThreeStopSetup();
    fireEvent.click(await screen.findByDisplayValue("3"));

    expect(
      screen.queryByRole("checkbox", { name: /notification/i })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));
    expect(onStart.mock.calls[0][0].options.notifications).toBe(false);
  } finally {
    globalThis.Notification = original;
  }
});

// A browser that has blocked a site never asks it again, so the ticked box
// promised a notification that could not come, and nothing said so.
test("says when the browser has blocked notifications for this site", async () => {
  const Notification = Object.assign(function Notification() {}, {
    permission: "denied",
  });
  vi.stubGlobal("Notification", Notification);
  try {
    renderThreeStopSetup();
    fireEvent.click(await screen.findByDisplayValue("3"));
    const hint = /Notifications are blocked\. Allow them for this site/;
    const box = screen.getByRole("checkbox", { name: /Also show notifications/ });

    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    // Not yet asked: Start will ask, so there is nothing to warn about.
    Notification.permission = "default";
    fireEvent.click(box);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

// Trip details carry the route and its shape. Lost to one failed request on
// a weak connection, the ride went without "Press STOP" and without
// location tracking along the route.
test("a ride whose trip details fail once still gets its route and shape", async () => {
  mocks.fetchTripDetails
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ tripId: "trip-164-1", routeId: "1", shapeId: "shape-1" });
  mocks.fetchTripStopTimes.mockResolvedValue(threeStopTrip);
  const onStart = vi.fn();
  render(
    <RideSetup
      arrival={{ lineref: "1", tripref: "trip-164-1", expecteddeparturetime: 2_000_000_000 }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={tripStops}
      placesById={new Map()}
      routesById={new Map([["1", { id: "1", shortName: "1", type: 3 }]])}
      onStart={onStart}
      onCancel={() => {}}
    />
  );

  fireEvent.click(await screen.findByDisplayValue("3", {}, { timeout: 4_000 }));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(mocks.fetchTripDetails).toHaveBeenCalledTimes(2);
  expect(onStart.mock.calls[0][0]).toEqual(
    expect.objectContaining({ shapeId: "shape-1", routeType: 3 })
  );
});

test("a ride whose trip details never load knows its line is a bus", async () => {
  mocks.fetchTripDetails.mockRejectedValue(new Error("offline"));
  mocks.fetchTripStopTimes.mockResolvedValue(threeStopTrip);
  const onStart = vi.fn();
  render(
    <RideSetup
      arrival={{ lineref: "1", tripref: "trip-164-1", expecteddeparturetime: 2_000_000_000 }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={tripStops}
      placesById={new Map()}
      routesById={new Map()}
      routesByShortName={new Map([["1", { id: "1", shortName: "1", type: 3 }]])}
      onStart={onStart}
      onCancel={() => {}}
    />
  );

  fireEvent.click(await screen.findByDisplayValue("3", {}, { timeout: 4_000 }));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));

  expect(onStart.mock.calls[0][0].routeType).toBe(3);
  mocks.fetchTripDetails.mockReset();
});

test("mentions vibration only where the phone can vibrate", async () => {
  renderThreeStopSetup();
  await screen.findByDisplayValue("3");
  expect(
    screen.getByText(/check the sound now; this phone will not vibrate/)
  ).toBeInTheDocument();
  expect(screen.queryByText(/sound and vibration/i)).not.toBeInTheDocument();
});

test("promises only what a web page can keep", async () => {
  renderThreeStopSetup();
  await screen.findByDisplayValue("3");

  expect(screen.queryByText(/put your phone away/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/unless we are sure/i)).not.toBeInTheDocument();
  expect(screen.getByText(/keep this page open/i)).toBeInTheDocument();
});

test("sets up the ride in Finnish, with stop names as Föli publishes them", async () => {
  resetLanguageForTests("fi");
  const onStart = renderThreeStopSetup();

  expect(
    await screen.findByRole("heading", { name: "Millä pysäkillä jäät pois?" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Aseta pysäkkihälytys" })
  ).toBeInTheDocument();
  fireEvent.click(await screen.findByDisplayValue("3"));

  expect(screen.getByText(/pysäkin päässä/)).toHaveTextContent(
    "2 pysäkin päässä · noin klo 17:55 · pysäkin Puistokatu jälkeen"
  );
  expect(screen.getByText(/^Seuraava pysäkki · /)).toBeInTheDocument();
  expect(
    screen.getByText(/^Jäät pois: Turun linna · Linja 1 lähtee klo \d\d:\d\d$/)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Käynnistä pysäkkihälytys" }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

// Names are worked out where they are shown, and a start error is kept as a
// phrase, so a switch mid-choice reaches both.
test("follows a language switch while the stop is being chosen", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    { stopId: "77", departureTime: "17:44:00", stopSequence: 2, dropOffType: 0 },
    { stopId: "32", departureTime: "17:46:00", stopSequence: 3, dropOffType: 0 },
  ]);
  renderSetup({
    arrival: {
      expecteddeparturetime: null,
      aimeddeparturetime: null,
      expectedarrivaltime: null,
      aimedarrivaltime: null,
    },
  });

  // Stop 77 is not in the catalogue, so it goes by its number.
  expect(await screen.findByText("Stop 77")).toBeInTheDocument();
  fireEvent.click(screen.getByDisplayValue("3"));
  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /do not have a departure time/i
  );

  act(() => resetLanguageForTests("fi"));

  expect(screen.getByText("Pysäkki 77")).toBeInTheDocument();
  expect(screen.getByText(/pysäkin Pysäkki 77 jälkeen/)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Tälle bussille ei ole vielä lähtöaikaa. Odota, että lähtötaulu päivittyy, ja yritä uudelleen."
  );
  expect(screen.getByText(/^Jäät pois: Puistokatu · Linja 1$/)).toBeInTheDocument();
});

// Each exit stop's name is Föli's own and Finnish, so an English screen
// reader must be told to say it so; and the place badge ran on from the
// line before it, "…after PuistokatuHome".
test("reads each exit stop in Finnish, with its place badge set apart", async () => {
  renderThreeStopSetup({
    placesById: new Map([
      [
        "home",
        {
          id: "home",
          label: "Home",
          primaryStopId: "4",
          stops: [{ id: "4", name: "Turun linna" }],
        },
      ],
    ]),
  });

  const choice = await screen.findByRole("radio", { name: /Turun linna/ });
  const option = choice.closest("label");
  expect(option.querySelector('[lang="fi"]')).toHaveTextContent("Turun linna");
  expect(option.textContent).toMatch(/Puistokatu · Home$/);
  // Under the board's h1: the setup's question is the next level down.
  expect(
    screen.getByRole("heading", { level: 2, name: "Where do you want to get off?" })
  ).toBeInTheDocument();
});

// Greyed out with no word of why, the start button read as broken.
test("says what to do while there is no stop to start for", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue([
    { stopId: "164", departureTime: "17:41:00", stopSequence: 1, dropOffType: 0 },
    {
      stopId: "32",
      arrivalTime: "17:46:00",
      departureTime: "17:46:00",
      stopSequence: 2,
      dropOffType: 0,
    },
  ]);
  renderSetup();

  const start = await screen.findByRole("button", { name: "Start get-off alert" });
  expect(start).toBeDisabled();
  expect(screen.getByText(/^Choose your stop first · /)).toBeInTheDocument();

  fireEvent.click(screen.getByDisplayValue("2"));
  expect(start).toBeEnabled();
  expect(screen.queryByText(/Choose your stop first/)).not.toBeInTheDocument();
  expect(screen.getByText(/^Get off at Puistokatu · /)).toBeInTheDocument();
});


test("journey-driven setup confirms the preferred exit before exposing the full stop list", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue(threeStopTrip);
  const onStart = vi.fn();

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        destinationdisplay: "Satama",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={tripStops}
      placesById={new Map()}
      routesById={new Map()}
      preferredTargetStopId="4"
      journeyDriven
      onStart={onStart}
      onCancel={() => {}}
    />
  );

  expect(
    await screen.findByRole("heading", { name: "Get off at Turun linna" })
  ).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Change" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.getByDisplayValue("3")).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Start get-off alert" }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart.mock.calls[0][0].targetStop.id).toBe("4");
});

test("manual stop-first setup still exposes the stop list immediately", async () => {
  mocks.fetchTripDetails.mockResolvedValue(null);
  mocks.fetchTripStopTimes.mockResolvedValue(threeStopTrip);

  render(
    <RideSetup
      arrival={{
        lineref: "1",
        tripref: "trip-164-1",
        expecteddeparturetime: 2_000_000_000,
      }}
      currentStopId="164"
      currentStopName="Kauppatori"
      stopsById={tripStops}
      placesById={new Map()}
      routesById={new Map()}
      onStart={() => {}}
      onCancel={() => {}}
    />
  );

  expect(
    await screen.findByRole("heading", { name: "Where do you want to get off?" })
  ).toBeInTheDocument();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "Change" })
  ).not.toBeInTheDocument();
});
