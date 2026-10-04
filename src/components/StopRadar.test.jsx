import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const addressPack = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../api/addressPack", async (importOriginal) => ({
  ...(await importOriginal()),
  loadAddressPack: addressPack.load,
}));

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

beforeEach(() => {
  addressPack.load.mockReset().mockResolvedValue({
    addresses: [],
    streets: [],
  });
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

  expect(
    await screen.findByText(/You are at the stop area/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Compass data is unavailable/i)
  ).toBeInTheDocument();
  const targetCard = screen.getByText("Target stop").closest("div");
  expect(targetCard).not.toBeNull();
  expect(within(targetCard).getByText("<10 m")).toBeInTheDocument();
});

// Two platforms of one stop: the radar used a 2 km scale for a target 50 m
// away, and neither dots nor list said which Kauppatori was which.
test("adds offline street/building context without stealing stop interaction", async () => {
  const live = installLiveLocation();
  addressPack.load.mockResolvedValue({
    addresses: [
      {
        id: "a1",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "1",
        lat: 60.4513,
        lon: 22.2664,
      },
      {
        id: "a2",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "3",
        lat: 60.4517,
        lon: 22.2664,
      },
      {
        id: "a3",
        street: "Aurakatu",
        streetKey: "aurakatu",
        house: "5",
        lat: 60.4521,
        lon: 22.2664,
      },
      {
        id: "b1",
        street: "Eerikinkatu",
        streetKey: "eerikinkatu",
        house: "10",
        lat: 60.4518,
        lon: 22.2659,
      },
      {
        id: "b2",
        street: "Eerikinkatu",
        streetKey: "eerikinkatu",
        house: "12",
        lat: 60.4518,
        lon: 22.267,
      },
    ],
    streets: [
      {
        id: "street:aurakatu",
        street: "Aurakatu",
        streetKey: "aurakatu",
        lat: 60.4518,
        lon: 22.26645,
      },
    ],
  });

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

  expect(await screen.findByText("Offline street context")).toBeInTheDocument();
  expect(screen.getByText("Near Aurakatu")).toBeInTheDocument();
  expect(
    screen.getByText(/Street lines and building cues are approximate/i)
  ).toBeInTheDocument();

  const radar = screen.getByRole("group", {
    name: /Radar showing nearby stops/,
  });
  expect(radar.querySelectorAll("svg rect").length).toBeGreaterThan(0);
  expect(radar.querySelectorAll("svg line").length).toBeGreaterThan(1);
  expect(
    radar.querySelector('[data-target-street="true"]')
  ).not.toBeNull();

  // Context is aria-hidden and non-interactive: only stop markers are buttons.
  expect(within(radar).getAllByRole("button").length).toBeGreaterThan(0);
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
  expect(
    screen.getByText(/Another stop named Kauppatori .* stop 164/i)
  ).toBeInTheDocument();

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

  expect(await screen.findByText(/You are at the stop area/)).toBeInTheDocument();
  expect(screen.queryByText(/^Head /)).not.toBeInTheDocument();
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
