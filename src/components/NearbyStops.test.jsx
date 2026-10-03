import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import NearbyStops from "./NearbyStops";

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
];

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

function setGeolocation(getCurrentPosition) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}

afterEach(() => {
  vi.restoreAllMocks();

  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }
});

test("requests location only after user action and selects a clear nearest stop", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 18,
      },
    })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  expect(getCurrentPosition).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith("164"));
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Nearest")).toBeInTheDocument();
  expect(screen.getByText(/Accuracy ±20 m/)).toBeInTheDocument();
  expect(
    screen.getByText(/external walking route in Google Maps/i)
  ).toBeInTheDocument();

  const walkLink = screen.getByRole("link", {
    name: "Walk there: Kauppatori, stop 164, in Google Maps",
  });
  expect(walkLink).toHaveAttribute("target", "_blank");
  expect(walkLink).toHaveAttribute("rel", "noreferrer");

  const url = new globalThis.URL(walkLink.href);
  expect(url.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(url.searchParams.get("travelmode")).toBe("walking");
  expect(url.searchParams.has("origin")).toBe(false);
});

test("shows the six closest stops in distance order", async () => {
  const expandedStops = [
    { id: "1", name: "Stop one", lat: 60.45181, lon: 22.2666 },
    { id: "2", name: "Stop two", lat: 60.4519, lon: 22.2666 },
    { id: "3", name: "Stop three", lat: 60.4520, lon: 22.2666 },
    { id: "4", name: "Stop four", lat: 60.4521, lon: 22.2666 },
    { id: "5", name: "Stop five", lat: 60.4522, lon: 22.2666 },
    { id: "6", name: "Stop six", lat: 60.4523, lon: 22.2666 },
    { id: "7", name: "Stop seven", lat: 60.4535, lon: 22.2666 },
  ];

  setGeolocation(
    vi.fn((success) =>
      success({
        coords: {
          latitude: 60.4518,
          longitude: 22.2666,
          accuracy: 500,
        },
      })
    )
  );

  render(
    <NearbyStops
      stops={expandedStops}
      coordinatesStatus="ready"
      activeStopId="999"
      onSelect={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  const group = await screen.findByRole("group", {
    name: "Nearest Föli stops",
  });
  const stopButtons = within(group).getAllByRole("button");

  expect(stopButtons).toHaveLength(6);
  expect(stopButtons[0]).toHaveAccessibleName(/Stop one, stop 1,/i);
  expect(stopButtons[5]).toHaveAccessibleName(/Stop six, stop 6,/i);
  expect(
    within(group).queryByRole("button", { name: /Stop seven, stop 7,/i })
  ).not.toBeInTheDocument();
});

test("explains denied permission without changing the active stop", async () => {
  const getCurrentPosition = vi.fn((success, error) =>
    error({ code: 1 })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  expect(
    await screen.findByText(/Location access is blocked/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

test("does not auto-select when reported location accuracy is poor", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 2_500,
      },
    })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  expect(
    await screen.findByText(/Your location is approximate/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByText("Nearest")).toBeInTheDocument();
});

test("does not auto-select when two opposite-direction candidates are similarly close", async () => {
  const closeStops = [
    {
      id: "100",
      name: "Market eastbound",
      lat: 60.4519,
      lon: 22.2666,
    },
    {
      id: "101",
      name: "Market westbound",
      lat: 60.4517,
      lon: 22.2666,
    },
    { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
  ];
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 20,
      },
    })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={closeStops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  expect(
    await screen.findByText(/Two stops are almost equally close/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button", { name: /Market/ })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: /Walk there: Market/ })).toHaveLength(
    2
  );
});

test("retries a timed-out high-accuracy request with fallback options", async () => {
  const getCurrentPosition = vi
    .fn()
    .mockImplementationOnce((success, error) => error({ code: 3 }))
    .mockImplementationOnce((success) =>
      success({
        coords: {
          latitude: 60.45182,
          longitude: 22.26662,
          accuracy: 120,
        },
      })
    );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith("164"));
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
    enableHighAccuracy: true,
    timeout: 8_000,
    maximumAge: 0,
  });
  expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({
    enableHighAccuracy: false,
    timeout: 5_000,
    maximumAge: 0,
  });
});


test("does not auto-select when the browser omits location accuracy", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
      },
    })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  expect(
    await screen.findByText(/Your location is approximate/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

test("does not auto-select a clearly nearest stop when it is still too far away", async () => {
  const remoteStops = [
    { id: "100", name: "Remote one", lat: 60.47, lon: 22.2666 },
    { id: "101", name: "Remote two", lat: 60.50, lon: 22.2666 },
  ];
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.4518,
        longitude: 22.2666,
        accuracy: 15,
      },
    })
  );
  const onSelect = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={remoteStops}
      coordinatesStatus="ready"
      activeStopId="999"
      onSelect={onSelect}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Find nearest stop" })
  );

  expect(
    await screen.findByText(/was not selected automatically/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

test("does not auto-select when the position is outside the published Föli boundary", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 15,
      },
    })
  );
  const onSelect = vi.fn();
  const outsideGeometry = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [24, 61],
          [25, 61],
          [25, 62],
          [24, 62],
          [24, 61],
        ],
      ],
    ],
  };

  setGeolocation(getCurrentPosition);

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      serviceBoundary={outsideGeometry}
      onSelect={onSelect}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));

  expect(
    await screen.findByText(/outside Föli’s published service area/i)
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

// A slow fix used to land after the passenger had already searched for
// another stop and jump the board away from it to the nearest one.
test("a late location fix does not replace a stop chosen while locating", async () => {
  let deliverFix;
  setGeolocation(
    vi.fn((success) => {
      deliverFix = () =>
        success({
          coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 10 },
        });
    })
  );
  const onSelect = vi.fn();

  const { rerender } = render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      onSelect={onSelect}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));

  // The passenger searches for stop 32 before the fix arrives.
  rerender(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="32"
      onSelect={onSelect}
    />
  );

  deliverFix();

  // The nearest stops are still offered, but none is chosen for them.
  await screen.findByRole("group", { name: "Nearest Föli stops" });
  expect(onSelect).not.toHaveBeenCalled();
});

// Typing a search is choosing a stop too, not yet finished. The jump made
// the search field put the nearest stop's name over the half-typed one.
test("a late location fix does not jump away from a search typed while locating", async () => {
  let deliverFix;
  setGeolocation(
    vi.fn((success) => {
      deliverFix = () =>
        success({
          coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 10 },
        });
    })
  );
  const onSelect = vi.fn();
  let searchEdits = 0;

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="4"
      searchEdits={() => searchEdits}
      onSelect={onSelect}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Find nearest stop" }));
  searchEdits += 1;
  deliverFix();

  const nearest = await screen.findByRole("group", { name: "Nearest Föli stops" });
  expect(within(nearest).getByText("Nearest")).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

// Disabled while it looked, the button dropped keyboard focus to the page.
test("Find nearest stop keeps focus while it looks and ignores a second press", () => {
  const getCurrentPosition = vi.fn();
  setGeolocation(getCurrentPosition);
  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId=""
      onSelect={vi.fn()}
    />
  );

  const locate = screen.getByRole("button", { name: "Find nearest stop" });
  locate.focus();
  fireEvent.click(locate);

  const busy = screen.getByRole("button", { name: "Locating…" });
  expect(busy).toBe(locate);
  expect(busy).toHaveAttribute("aria-disabled", "true");
  expect(busy).not.toBeDisabled();
  expect(busy).toHaveFocus();
  fireEvent.click(busy);
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test("stop radar seeds Nearby once instead of streaming every GPS fix into planning", async () => {
  let deliver;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success) => {
        deliver = success;
        return 70;
      }),
      clearWatch: vi.fn(),
    },
  });

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="32"
      onSelect={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Open stop radar" }));
  await screen.findByRole("heading", { name: "Stop radar" });

  act(() =>
    deliver({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 10,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
  );
  await screen.findByText(/Accuracy ±10/);

  act(() =>
    deliver({
      coords: {
        latitude: 60.453,
        longitude: 22.27,
        accuracy: 25,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
  );

  // StopRadar itself consumes the second fix, but the parent one-time Nearby
  // snapshot deliberately remains the first fix.
  expect(screen.getByText(/Accuracy ±10/)).toBeInTheDocument();
  expect(screen.queryByText(/^Accuracy ±25/)).not.toBeInTheDocument();
  expect(screen.getByText(/GPS accuracy ±25/)).toBeInTheDocument();
});

test("closing stop radar restores focus to its trigger without changing the board", async () => {
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 71),
      clearWatch,
    },
  });
  const onSelect = vi.fn();

  render(
    <NearbyStops
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="32"
      onSelect={onSelect}
    />
  );

  const open = screen.getByRole("button", { name: "Open stop radar" });
  expect(open).toHaveAttribute("aria-controls", "stop-radar-panel");
  fireEvent.click(open);

  await screen.findByRole("heading", { name: "Stop radar" });
  const close = screen.getByRole("button", { name: "Close radar" });
  close.focus();
  fireEvent.click(close);

  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Stop radar" })).not.toBeInTheDocument()
  );
  expect(screen.getByRole("button", { name: "Open stop radar" })).toHaveFocus();
  expect(onSelect).not.toHaveBeenCalled();
  expect(clearWatch).toHaveBeenCalledWith(71);
});

test("Find nearest stop does nothing until stop locations have loaded", () => {
  const getCurrentPosition = vi.fn();
  setGeolocation(getCurrentPosition);
  render(
    <NearbyStops
      stops={[{ id: "164", name: "Kauppatori" }]}
      coordinatesStatus="loading"
      activeStopId=""
      onSelect={vi.fn()}
    />
  );

  const locate = screen.getByRole("button", { name: "Find nearest stop" });
  expect(locate).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(locate);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});