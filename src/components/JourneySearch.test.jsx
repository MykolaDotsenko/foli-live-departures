import {
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
