import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";

const placeSearch = vi.hoisted(() => ({
  hook: vi.fn(),
  search: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("../hooks/usePlaceSearch", () => ({
  default: placeSearch.hook,
}));

import JourneySearch from "./JourneySearch";

const stops = [
  { id: "4", name: "Turun linna", lat: 60.435, lon: 22.228 },
  { id: "164", name: "Kauppatori", lat: 60.451, lon: 22.267 },
  { id: "165", name: "Kauppatori", lat: 60.452, lon: 22.268 },
];

const home = {
  id: "home",
  label: "Home",
  stops: [{ id: "900", name: "Home stop" }],
  primaryStopId: "900",
};

const prisma = {
  id: "node:123",
  title: "Prisma Itäharju",
  subtitle: "Turku, Finland",
  lat: 60.45,
  lon: 22.30,
  category: "shop",
  type: "supermarket",
  provider: "nominatim",
  licence: "OpenStreetMap",
};

beforeEach(() => {
  resetLanguageForTests("en");
  placeSearch.search.mockReset().mockResolvedValue([]);
  placeSearch.clear.mockReset();
  placeSearch.hook.mockReturnValue({
    results: [],
    status: "idle",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
    directEnabled: true,
  });
});

afterEach(() => {
  resetLanguageForTests("en");
  vi.restoreAllMocks();
});

function renderSearch(overrides = {}) {
  const props = {
    stops,
    places: [home],
    destination: null,
    coordinatesStatus: "ready",
    online: true,
    onChoosePlace: vi.fn(),
    onChooseStop: vi.fn(),
    onChooseExternalPlace: vi.fn(() => ({
      ok: true,
      reason: "ready",
      destination: {},
    })),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<JourneySearch {...props} />);
  return props;
}

test("offers saved destinations as one-tap choices", () => {
  const props = renderSearch();
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(props.onChoosePlace).toHaveBeenCalledWith(home);
});

test("keeps local stop suggestions instant and makes no network request while typing", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Turun" } });

  const list = screen.getByRole("listbox", {
    name: "Destination stop suggestions",
  });
  fireEvent.click(
    within(list).getByRole("option", { name: /Turun linna.*Stop 4/i })
  );

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(placeSearch.search).not.toHaveBeenCalled();
});

test("exact stop submit stays local and never calls place search", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(placeSearch.search).not.toHaveBeenCalled();
});

test("explicit submit searches places only when local stop resolution is ambiguous or absent", async () => {
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  expect(placeSearch.search).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  await waitFor(() =>
    expect(placeSearch.search).toHaveBeenCalledWith(
      "Prisma Itäharju",
      "en"
    )
  );
});

test("does not guess between duplicate stop names and keeps both local choices visible", async () => {
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Kauppatori" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No matching place or address was found. You can still choose a Föli stop from the suggestions."
    )
  );
  expect(
    screen.getAllByRole("option", { name: /Kauppatori.*Stop 16/i })
  ).toHaveLength(2);
});

test("renders explicit place results and selects one only after the passenger taps it", () => {
  placeSearch.hook.mockReturnValue({
    results: [prisma],
    status: "ready",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
  });

  const props = renderSearch();

  expect(screen.getByText("Places & addresses")).toBeInTheDocument();
  expect(screen.getByText("Prisma Itäharju")).toBeInTheDocument();
  expect(screen.getByText("Turku, Finland")).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  );

  expect(props.onChooseExternalPlace).toHaveBeenCalledWith(prisma);
});

test("offline mode never calls external place search", async () => {
  renderSearch({ online: false });
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  expect(placeSearch.search).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Place search needs a connection"
  );
});

test("shows a truthful error when a place cannot map to nearby Föli stops", () => {
  placeSearch.hook.mockReturnValue({
    results: [prisma],
    status: "ready",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
  });

  renderSearch({
    onChooseExternalPlace: vi.fn(() => ({
      ok: false,
      reason: "no-nearby-stops",
      destination: null,
    })),
  });

  fireEvent.click(
    screen.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "No Föli stop close enough to this place could be resolved."
  );
});

test("shows a specific error for a place outside the Föli service area", () => {
  placeSearch.hook.mockReturnValue({
    results: [prisma],
    status: "ready",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
  });

  renderSearch({
    onChooseExternalPlace: vi.fn(() => ({
      ok: false,
      reason: "outside-service-area",
      destination: null,
    })),
  });

  fireEvent.click(
    screen.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "This place appears outside Föli’s service area."
  );
});

test("shows and clears the active destination", () => {
  const props = renderSearch({
    destination: {
      id: "place:home",
      kind: "saved-place",
      label: "Home",
      primaryStopId: "900",
      acceptableStopIds: ["900"],
    },
  });

  const activeDestination = screen.getByRole("status");
  expect(within(activeDestination).getByText("Going to")).toBeInTheDocument();
  expect(within(activeDestination).getByText("Home")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Clear destination" }));
  expect(props.onClear).toHaveBeenCalledTimes(1);
});

test("requires a destination value", () => {
  renderSearch();
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a stop, address or place."
  );
});

test("keeps an opened stop board compact until the passenger asks to change destination", () => {
  const props = renderSearch({
    compact: true,
    destination: {
      id: "place:home",
      kind: "saved-place",
      label: "Home",
      primaryStopId: "900",
      acceptableStopIds: ["900"],
    },
  });

  expect(
    screen.getByRole("region", { name: "Journey destination" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "Stop, address or place" })
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  expect(
    screen.getByRole("combobox", { name: "Stop, address or place" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Clear destination" }));
  expect(props.onClear).toHaveBeenCalledTimes(1);
});


test("packaged app keeps address text local and offers the official planner handoff", () => {
  placeSearch.hook.mockReturnValue({
    results: [],
    status: "idle",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
    directEnabled: false,
  });

  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });
  // The link is there from the start; the note waits for text to keep.
  expect(
    screen.getByRole("link", { name: "Open Turku journey planner" })
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/keeps address and place text on this device/i)
  ).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  expect(
    screen.getByText(/keeps address and place text on this device/i)
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  expect(placeSearch.search).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Direct address and place search is unavailable here"
  );
  expect(
    screen.getByRole("link", { name: "Open Turku journey planner" })
  ).toHaveAttribute("href", "https://turku.digitransit.fi/");
  expect(
    screen.getByText(/keeps address and place text on this device/i)
  ).toBeInTheDocument();
});

// A stop chosen from the list fills the field with its name, and the note
// about keeping address text then explained something nobody had typed.
test("a chosen stop does not bring up the address note", () => {
  placeSearch.hook.mockReturnValue({
    results: [],
    status: "idle",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
    directEnabled: false,
  });
  const props = { ...renderSearch() };
  const input = screen.getByRole("combobox", { name: "Stop, address or place" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Turun" } });
  expect(screen.getByText(/keeps address and place text on this device/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("option", { name: /Turun linna/ }));
  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  cleanup();
  render(
    <JourneySearch
      {...props}
      destination={{
        id: "stop:4",
        kind: "public-stop",
        label: "Turun linna",
        primaryStopId: "4",
        acceptableStopIds: ["4"],
      }}
    />
  );
  const reopened = screen.getByRole("combobox", { name: "Stop, address or place" });
  fireEvent.change(reopened, { target: { value: "Turun linna" } });
  expect(screen.queryByText(/keeps address and place text on this device/i)).not.toBeInTheDocument();
});

test("provider failure is not misreported as a valid zero-match result", async () => {
  placeSearch.search.mockResolvedValueOnce(null);
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Search destination" })
  );

  await waitFor(() => expect(placeSearch.search).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByText(/No matching stop, place or address was found/i)
  ).not.toBeInTheDocument();
});


test("journey planning controls expose every time mode and routing preference", () => {
  const onTimeModeChange = vi.fn();
  const onTimeLocalValueChange = vi.fn();
  const onPreferenceChange = vi.fn();

  renderSearch({
    timeConstraint: { mode: "leave-at", targetTimeSec: 1_800_000_000 },
    timeLocalValue: "2027-01-15T12:30",
    timeValid: false,
    routingPreference: "more-buffer",
    onTimeModeChange,
    onTimeLocalValueChange,
    onPreferenceChange,
  });

  const selects = screen.getAllByRole("combobox");
  const timeSelect = selects.find((element) => element.value === "leave-at");
  const preferenceSelect = selects.find(
    (element) => element.value === "more-buffer"
  );
  expect(timeSelect).toBeTruthy();
  expect(preferenceSelect).toBeTruthy();

  fireEvent.change(timeSelect, { target: { value: "arrive-by" } });
  expect(onTimeModeChange).toHaveBeenCalledWith("arrive-by");

  const clock = screen.getByLabelText("Turku local time");
  expect(clock).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(clock, { target: { value: "2027-01-15T13:00" } });
  expect(onTimeLocalValueChange).toHaveBeenCalledWith("2027-01-15T13:00");

  fireEvent.change(preferenceSelect, {
    target: { value: "fewer-transfers" },
  });
  fireEvent.change(preferenceSelect, {
    target: { value: "less-walking" },
  });
  fireEvent.change(preferenceSelect, {
    target: { value: "balanced" },
  });
  expect(onPreferenceChange.mock.calls.map(([value]) => value)).toEqual([
    "fewer-transfers",
    "less-walking",
    "balanced",
  ]);

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose a valid future Turku time"
  );
});

// When and how are refinements of where to. Open, they took a phone's
// first screen from everything below the planner before anything was asked.
test("timing and route stay one line until either is changed", () => {
  const props = {
    stops,
    places: [home],
    destination: null,
    onChoosePlace: vi.fn(),
    onChooseStop: vi.fn(),
    onClear: vi.fn(),
  };
  const { container, rerender } = render(<JourneySearch {...props} />);
  const fold = container.querySelector("details");

  expect(fold).not.toHaveAttribute("open");
  expect(within(fold.querySelector("summary")).getByText("Leave now · Balanced")).toBeInTheDocument();

  rerender(
    <JourneySearch
      {...props}
      timeConstraint={{ mode: "arrive-by", targetTimeSec: null }}
      timeValid={false}
    />
  );
  expect(container.querySelector("details")).toHaveAttribute("open");
  // Outside the fold, so it is seen even after the fold is closed again.
  fireEvent.click(container.querySelector("summary"));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Choose a valid future Turku time");
  expect(container.querySelector("details").contains(alert)).toBe(false);
});

test("a changed plan opens on its own when the planner appears", () => {
  renderSearch({ routingPreference: "less-walking" });

  expect(document.querySelector("details")).toHaveAttribute("open");
  expect(screen.getByText("Leave now · Less walking")).toBeInTheDocument();
});

test("leave-now hides the clock and normalizes an unknown preference to balanced", () => {
  renderSearch({
    timeConstraint: { mode: "unexpected", targetTimeSec: 123 },
    routingPreference: "teleport",
  });

  expect(screen.queryByLabelText("Turku local time")).not.toBeInTheDocument();
  const selects = screen.getAllByRole("combobox");
  expect(selects.some((element) => element.value === "leave-now")).toBe(true);
  expect(selects.some((element) => element.value === "balanced")).toBe(true);
});

test("compact destination summarizes arrive-by timing and preference", () => {
  renderSearch({
    compact: true,
    destination: {
      id: "external:osm:123",
      kind: "external-place",
      label: "Prisma Itäharju",
      primaryStopId: "164",
      acceptableStopIds: ["164"],
      source: "osm-nominatim",
    },
    timeConstraint: {
      mode: "arrive-by",
      targetTimeSec: Date.parse("2027-01-15T10:30:00Z") / 1000,
    },
    routingPreference: "less-walking",
  });

  expect(screen.getByText(/Arrive by .*Less walking/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "© OpenStreetMap contributors" })
  ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
});

test("place selection reports catalog loading and unavailable states distinctly", () => {
  placeSearch.hook.mockReturnValue({
    results: [prisma],
    status: "ready",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
  });

  const { unmount } = render(
    <JourneySearch
      stops={stops}
      places={[]}
      destination={null}
      coordinatesStatus="loading"
      online
      onChoosePlace={vi.fn()}
      onChooseStop={vi.fn()}
      onChooseExternalPlace={vi.fn(() => ({
        ok: false,
        reason: "no-nearby-stops",
        destination: null,
      }))}
      onClear={vi.fn()}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Stop locations are still loading"
  );
  unmount();

  renderSearch({
    coordinatesStatus: "error",
    onChooseExternalPlace: vi.fn(() => ({
      ok: false,
      reason: "no-nearby-stops",
      destination: null,
    })),
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Prisma Itäharju.*Turku, Finland/i })
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Stop locations are temporarily unavailable"
  );
});

// A returning passenger opens on their last stop. With no destination the
// planner used to be hidden there, out of reach for good.
test("an opened stop board keeps the planner one tap away", () => {
  renderSearch({ compact: true, destination: null });

  expect(
    screen.queryByRole("combobox", { name: "Stop, address or place" })
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Where do you want to go?" })
  );
  expect(
    screen.getByRole("combobox", { name: "Stop, address or place" })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(
    screen.queryByRole("combobox", { name: "Stop, address or place" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Where do you want to go?" })
  ).toBeInTheDocument();
});

test("opening a stop folds the full planner away", () => {
  const props = {
    stops,
    places: [home],
    destination: null,
    coordinatesStatus: "ready",
    online: true,
    onChoosePlace: vi.fn(),
    onChooseStop: vi.fn(),
    onClear: vi.fn(),
  };
  const view = render(<JourneySearch {...props} />);
  expect(
    screen.getByRole("combobox", { name: "Stop, address or place" })
  ).toBeInTheDocument();

  view.rerender(<JourneySearch {...props} compact />);
  expect(
    screen.queryByRole("combobox", { name: "Stop, address or place" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Where do you want to go?" })
  ).toBeInTheDocument();
});

test("a destination typed with a slip is offered its stop", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", { name: "Stop, address or place" });
  fireEvent.focus(input);
  const target = stops.find((stop) => stop.name.length >= 6);
  const slip = target.name.slice(0, 2) + target.name.slice(3);
  fireEvent.change(input, { target: { value: slip } });

  fireEvent.click(screen.getByRole("option", { name: new RegExp(target.name) }));
  expect(props.onChooseStop).toHaveBeenCalledWith(target);
});

// With address search off, the field's own example ("Prisma Itäharju")
// led straight to "Direct address and place search is unavailable here".
test("the example in the field is one the app can find", () => {
  placeSearch.hook.mockReturnValue({
    results: [],
    status: "idle",
    error: "",
    search: placeSearch.search,
    clear: placeSearch.clear,
    directEnabled: false,
  });
  renderSearch();
  expect(
    screen.getByRole("combobox", { name: "Stop, address or place" })
  ).toHaveAttribute("placeholder", "e.g. Kauppatori");
});

test("with address search on, the example still shows a place", () => {
  renderSearch();
  expect(
    screen.getByRole("combobox", { name: "Stop, address or place" })
  ).toHaveAttribute("placeholder", "e.g. Prisma Itäharju or Kauppatori");
});

// The destination field called itself a combobox, but its list answered
// only to touch: arrow keys did nothing, Escape left it open, and Tab
// moved focus onto an option that the list then removed, dropping a
// keyboard user to the top of the page. It now works like stop search.
test("the destination list works from the keyboard", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", { name: "Stop, address or place" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kauppatori" } });

  const list = screen.getByRole("listbox", { name: "Destination stop suggestions" });
  const options = within(list).getAllByRole("option");
  expect(options).toHaveLength(2);
  // Not Tab stops: focus stays in the field while the list is open.
  expect(within(list).queryAllByRole("button")).toHaveLength(0);

  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  expect(options[0]).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onChooseStop).toHaveBeenCalledWith(stops[2]);
});

test("Escape closes the destination list and typing opens it again", () => {
  renderSearch();
  const input = screen.getByRole("combobox", { name: "Stop, address or place" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kaup" } });
  expect(input).toHaveAttribute("aria-expanded", "true");

  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-expanded", "true");
  fireEvent.change(input, { target: { value: "Kaupp" } });
  expect(screen.getByRole("listbox")).toBeInTheDocument();
});
