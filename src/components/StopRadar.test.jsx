import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  loadAddressPack,
  resetAddressPackForTests,
} from "../api/addressPack";
import StopRadar from "./StopRadar";

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
  { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
];

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

const radarAddressPack = {
  addressFields: ["street", "house", "lat", "lon", "city"],
  streetFields: ["street", "lat", "lon", "city"],
  addresses: [
    ["Aurakatu", "1", 60.4513, 22.2664, "Turku"],
    ["Aurakatu", "3", 60.4517, 22.2664, "Turku"],
    ["Aurakatu", "5", 60.4521, 22.2664, "Turku"],
    ["Eerikinkatu", "10", 60.4518, 22.2659, "Turku"],
    ["Eerikinkatu", "12", 60.4518, 22.267, "Turku"],
  ],
  streets: [["Aurakatu", 60.4518, 22.26645, "Turku"]],
};

function mockAddressPack(raw = radarAddressPack) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => raw,
  });
}

beforeEach(() => {
  resetAddressPackForTests();
  mockAddressPack();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

function installLiveLocation() {
  let deliver;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 44;
      }),
      clearWatch,
    },
  });
  return {
    deliver(fix = {}) {
      act(() =>
        deliver({
          coords: {
            latitude: 60.45182,
            longitude: 22.26662,
            accuracy: 12,
            heading: null,
            speed: null,
            ...fix,
          },
          timestamp: Date.now(),
        })
      );
    },
    clearWatch,
  };
}

test("locks the initial target and changing radar target does not open a stop", async () => {
  const live = installLiveLocation();
  const onOpenStop = vi.fn();
  const onPosition = vi.fn();

  render(
    <StopRadar
      stops={stops}
      initialTargetStopId="32"
      recommendedTargetStopId="164"
      activeStopId="32"
      compassPermission="unavailable"
      onPosition={onPosition}
      onOpenStop={onOpenStop}
      onClose={vi.fn()}
    />
  );

  live.deliver();

  expect((await screen.findAllByText("Puistokatu")).length).toBeGreaterThan(0);
  expect(screen.getByText("North-up")).toBeInTheDocument();

  const radar = screen.getByRole("group", {
    name: /Radar showing nearby stops\. Target Puistokatu, stop 32/i,
  });
  expect(
    within(radar).getByRole("button", {
      name: /Guide to Puistokatu, stop 32/i,
    })
  ).toBeInTheDocument();

  expect(onPosition).toHaveBeenCalledTimes(1);
  expect(onOpenStop).not.toHaveBeenCalled();

  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  fireEvent.click(within(chooser).getByRole("button", { name: /Kauppatori/ }));

  await waitFor(() =>
    expect(screen.getAllByText("Kauppatori").length).toBeGreaterThan(0)
  );
  expect(onOpenStop).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Open target stop" }));
  expect(onOpenStop).toHaveBeenCalledWith("164");
});

test("shows a conservative arrival state and compass fallback notice", async () => {
  const live = installLiveLocation();

  render(
    <StopRadar
      stops={stops}
      initialTargetStopId="164"
      compassPermission="denied"
      onClose={vi.fn()}
    />
  );

  live.deliver({
    latitude: 60.4518,
    longitude: 22.2666,
    accuracy: 8,
  });

  const targetCard = (await screen.findByText("Target stop")).closest("div");
  expect(targetCard).not.toBeNull();
  expect(
    within(targetCard).getByText(/You are at the stop area/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Compass data is unavailable/i)
  ).toBeInTheDocument();
  expect(within(targetCard).getByText("<10 m")).toBeInTheDocument();
  // Said once, for a screen reader, with the distance.
  expect(screen.getByRole("status")).toHaveTextContent(
    "<10 m. You are at the stop area. Look for the stop pole and route number."
  );
});

// Two platforms of one stop: the radar used a 2 km scale for a target 50 m
// away, and neither dots nor list said which Kauppatori was which.
test("adds offline street/building context without stealing stop interaction", async () => {
  const live = installLiveLocation();
  const loadedPack = await loadAddressPack();
  expect(loadedPack.addresses).toHaveLength(5);
  expect(loadedPack.streets).toHaveLength(1);

  render(
    <StopRadar
      stops={stops}
      initialTargetStopId="164"
      compassPermission="unavailable"
      onClose={vi.fn()}
    />
  );

  live.deliver({
    latitude: 60.45125,
    longitude: 22.2662,
    accuracy: 8,
  });

  expect(await screen.findByText(/OpenStreetMap contributors/i)).toBeInTheDocument();

  const radar = screen.getByRole("group", {
    name: /Radar showing nearby stops/,
  });
  const paths = radar.querySelectorAll("svg path");
  expect(paths).toHaveLength(2);
  await waitFor(() => expect(paths[0].getAttribute("d")).toMatch(/^M.+L/));
  expect(paths[1].getAttribute("d")).toMatch(/^(M\d+ \d+h0)+$/);
  // The arrow points at the target; a line to it looked like one more street.
  expect(radar.querySelectorAll("svg line")).toHaveLength(0);
  // Context is aria-hidden and non-interactive: only stop markers are buttons.
  expect(within(radar).getAllByRole("button").length).toBeGreaterThan(0);
});

test("draws building cues apart from streets when no street is near", async () => {
  mockAddressPack({
    ...radarAddressPack,
    addresses: [["Aurakatu", "1", 60.4513, 22.2664, "Turku"]],
  });
  const live = installLiveLocation();
  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  live.deliver({ latitude: 60.45125, longitude: 22.2662, accuracy: 8 });

  const radar = await screen.findByRole("group", { name: /Radar showing nearby stops/ });
  // Building cues stay the second path, styled as cues, with no street at
  // all: as the only path they took the streets' look and a black fill.
  const [streets, buildings] = radar.querySelectorAll("svg path");
  await waitFor(() => expect(buildings.getAttribute("d")).toMatch(/^M\d+ \d+h0$/));
  expect(streets.getAttribute("d")).toBe("");
});

test("tells two stops of one name apart and scales to the walk", async () => {
  const live = installLiveLocation();
  const platforms = [
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
    { id: "166", name: "Kauppatori", lat: 60.4512, lon: 22.2678 },
    { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
  ];

  render(
    <StopRadar
      stops={platforms}
      initialTargetStopId="166"
      compassPermission="unavailable"
      onClose={vi.fn()}
    />
  );

  live.deliver({ latitude: 60.4515, longitude: 22.2672, accuracy: 8 });

  expect(await screen.findByText(/Radar range 100 m/)).toBeInTheDocument();
  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  expect(within(chooser).getByText(/Stop 164/)).toBeInTheDocument();
  expect(within(chooser).getByText(/Stop 166/)).toBeInTheDocument();

  const radar = screen.getByRole("group", { name: /Radar showing nearby stops/ });
  expect(within(radar).getByRole("button", { name: /Guide to Kauppatori, stop 166/ })).toHaveTextContent("166");
  expect(within(radar).getByRole("button", { name: /Guide to Kauppatori, stop 164/ })).toHaveTextContent("164");
  // Turun linna, 2 km off, is not squeezed onto a 100 m radar.
  expect(within(radar).queryByRole("button", { name: /Turun linna/ })).not.toBeInTheDocument();
  expect(within(chooser).getByRole("button", { name: /Turun linna/ })).toBeInTheDocument();
});

test("says which way to walk in words when there is no compass", async () => {
  const live = installLiveLocation();

  render(
    <StopRadar stops={stops} initialTargetStopId="4" compassPermission="unavailable" onClose={vi.fn()} />
  );
  // Turun linna lies south-west of Kauppatori.
  live.deliver({ latitude: 60.4518, longitude: 22.2666, accuracy: 8 });

  expect(await screen.findByText(/^Head south-west \(\d+°\)$/)).toBeInTheDocument();
  expect(screen.queryByText(/from north/)).not.toBeInTheDocument();
});

test("markers on top of each other leave one tap target", async () => {
  const live = installLiveLocation();
  const twins = [
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
    { id: "165", name: "Kauppatori", lat: 60.45181, lon: 22.26661 },
  ];

  render(
    <StopRadar stops={twins} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  live.deliver({ latitude: 60.4522, longitude: 22.2666, accuracy: 8 });

  const radar = await screen.findByRole("group", { name: /Radar showing nearby stops/ });
  expect(within(radar).getAllByRole("button")).toHaveLength(1);
  expect(within(radar).getByRole("button", { name: /stop 164/ })).toBeInTheDocument();
  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  expect(within(chooser).getAllByRole("button")).toHaveLength(2);
});

test("a gap in location keeps the radar on screen and says it is waiting", async () => {
  let deliver;
  let fail;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, error) => {
        deliver = success;
        fail = error;
        return 9;
      }),
      clearWatch: vi.fn(),
    },
  });

  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  act(() =>
    deliver({ coords: { latitude: 60.4522, longitude: 22.2666, accuracy: 8 }, timestamp: Date.now() })
  );
  act(() => fail({ code: 3 }));

  expect(await screen.findByText("Waiting for a new GPS fix…")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: /Radar showing nearby stops/ })).toBeInTheDocument();
});

test("at the stop it stops giving a direction a few metres of GPS noise would invent", async () => {
  const live = installLiveLocation();
  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  live.deliver({ latitude: 60.45182, longitude: 22.26662, accuracy: 6 });

  const targetCard = (await screen.findByText("Target stop")).closest("div");
  expect(within(targetCard).getByText(/You are at the stop area/)).toBeInTheDocument();
  expect(screen.queryByText(/^Head /)).not.toBeInTheDocument();
});

// About 30 m from the stop, a few metres of GPS noise made "You are at the
// stop area" come and go on every other fix, and a screen reader said it
// each time.
test("holds the arrival through GPS noise at its threshold", async () => {
  const live = installLiveLocation();
  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  const arrival = () => screen.queryByText(/^You are at the stop area/);
  // 0.0001° of latitude is about 11 m.
  live.deliver({ latitude: 60.4518 - 0.00031, longitude: 22.2666, accuracy: 8 });
  expect(await screen.findByText(/^Head north/)).toBeInTheDocument();
  expect(arrival()).toBeNull();

  live.deliver({ latitude: 60.4518 - 0.00025, longitude: 22.2666, accuracy: 8 });
  await waitFor(() => expect(arrival()).toBeInTheDocument());

  // Noise back out to about 34 m keeps it; walking off to 45 m ends it.
  live.deliver({ latitude: 60.4518 - 0.00031, longitude: 22.2666, accuracy: 8 });
  expect(arrival()).toBeInTheDocument();
  live.deliver({ latitude: 60.4518 - 0.0004, longitude: 22.2666, accuracy: 8 });
  await waitFor(() => expect(arrival()).toBeNull());
});

test("announces the walk when it changes enough, not every fix", async () => {
  const live = installLiveLocation();
  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  const status = () => screen.getByRole("status").textContent;

  // 0.0001° of latitude is about 11 m: start about 220 m south.
  live.deliver({ latitude: 60.4518 - 0.002, longitude: 22.2666, accuracy: 8 });
  await waitFor(() => expect(status()).toBe("220 m. Head north (0°)"));

  // A few metres on, and the accuracy and scale line changing, say nothing.
  live.deliver({ latitude: 60.4518 - 0.00195, longitude: 22.2666, accuracy: 9 });
  live.deliver({ latitude: 60.4518 - 0.0019, longitude: 22.2666, accuracy: 7 });
  expect(status()).toBe("220 m. Head north (0°)");

  // A quarter of the way closer is worth saying, with the direction of
  // travel the walk has given the radar since.
  live.deliver({ latitude: 60.4518 - 0.0014, longitude: 22.2666, accuracy: 8 });
  await waitFor(() => expect(status()).toBe("160 m. Straight ahead"));
});

test("the arrow ends at the target marker's edge", async () => {
  const live = installLiveLocation();
  render(
    <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  // About 75 m south of the stop: a 100 m scale from the first fix (the
  // 200 m shown before it no longer holds), the target 31.5% out.
  live.deliver({ latitude: 60.4518 - 0.000675, longitude: 22.2666, accuracy: 8 });

  const radar = await screen.findByRole("group", { name: /Radar showing nearby stops/ });
  const marker = within(radar).getByRole("button", { name: /stop 164/ });
  const needle = [...radar.querySelectorAll("span")].find((span) =>
    span.style.transform.startsWith("rotate")
  );
  const markerOut = 50 - parseFloat(marker.style.top);
  expect(markerOut).toBeGreaterThan(30);
  expect(parseFloat(needle.style.height)).toBeCloseTo(markerOut - 7, 5);
  expect(parseFloat(needle.style.top)).toBeCloseTo(50 - (markerOut - 7), 5);
});

test("keeps stop numbers clear of the passenger's dot", async () => {
  const live = installLiveLocation();
  const here = [
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
    { id: "170", name: "Here", lat: 60.4507, lon: 22.2666 },
  ];
  render(
    <StopRadar stops={here} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
  );
  // Standing at stop 170, guided to 164 about 120 m north.
  live.deliver({ latitude: 60.4507, longitude: 22.2666, accuracy: 8 });

  const radar = await screen.findByRole("group", { name: /Radar showing nearby stops/ });
  expect(within(radar).getAllByRole("button")).toHaveLength(1);
  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  expect(within(chooser).getByRole("button", { name: /Here/ })).toBeInTheDocument();
});

test("brings the radar into view and its heading into focus when it opens", async () => {
  installLiveLocation();
  const scrollIntoView = vi.fn();
  const original = globalThis.Element.prototype.scrollIntoView;
  globalThis.Element.prototype.scrollIntoView = scrollIntoView;
  try {
    render(
      <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
    );
    expect(screen.getByRole("heading", { name: "Stop radar" })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  } finally {
    globalThis.Element.prototype.scrollIntoView = original;
  }
});

test("leaves focus where the passenger went while the radar loaded", () => {
  installLiveLocation();
  const elsewhere = document.createElement("button");
  document.body.append(elsewhere);
  elsewhere.focus();
  try {
    render(
      <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
    );
    expect(elsewhere).toHaveFocus();
  } finally {
    elsewhere.remove();
  }
});

test("keeps the screen awake while it guides, and lets go on close", async () => {
  const release = vi.fn(async () => {});
  const request = vi.fn(async () => ({ release, addEventListener: vi.fn() }));
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  const live = installLiveLocation();
  try {
    const { unmount } = render(
      <StopRadar stops={stops} initialTargetStopId="164" compassPermission="unavailable" onClose={vi.fn()} />
    );
    // Nothing to guide from yet: the screen may sleep while GPS answers.
    expect(request).not.toHaveBeenCalled();
    live.deliver();
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    unmount();
    await waitFor(() => expect(release).toHaveBeenCalled());
  } finally {
    delete navigator.wakeLock;
  }
});

// Switching from a far target to a near one kept the far target's 2 km
// scale: hysteresis belongs to one target's fixes, not to a new choice.
test("choosing a nearer target sets the scale for it at once", async () => {
  const live = installLiveLocation();
  const far = [
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
    { id: "166", name: "Kauppatori", lat: 60.4512, lon: 22.2678 },
    { id: "500", name: "Varissuo", lat: 60.443, lon: 22.338 },
  ];

  render(
    <StopRadar stops={far} initialTargetStopId="500" compassPermission="unavailable" onClose={vi.fn()} />
  );
  live.deliver({ latitude: 60.4532, longitude: 22.2666, accuracy: 8 });
  expect(await screen.findByText(/Radar range 2(\.0)? km|Radar range 2,0 km/)).toBeInTheDocument();

  const chooser = screen.getByRole("group", { name: "Choose radar target" });
  fireEvent.click(within(chooser).getByRole("button", { name: /Kauppatori.*Stop 164/s }));

  // About 155 m away: a 200 m scale, not the 2 km one Varissuo needed.
  expect(await screen.findByText(/Radar range 200 m/)).toBeInTheDocument();
});
