import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";

const placeSearch = vi.hoisted(() => ({
  state: "idle",
  results: [],
  searchedQuery: "",
  search: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("../hooks/usePlaceSearch", () => ({
  default: () => ({
    state: placeSearch.state,
    results: placeSearch.results,
    searchedQuery: placeSearch.searchedQuery,
    search: placeSearch.search,
    clear: placeSearch.clear,
  }),
}));

import JourneySearch from "./JourneySearch";

const stops = [
  { id: "4", name: "Turun linna" },
  { id: "164", name: "Kauppatori" },
  { id: "165", name: "Kauppatori" },
];

const home = {
  id: "home",
  label: "Home",
  stops: [{ id: "900", name: "Home stop" }],
  primaryStopId: "900",
};

const prisma = {
  id: "osm:node:123",
  label: "Prisma Itäharju",
  secondaryLabel: "Turku, Varsinais-Suomi, Suomi",
  lat: 60.4518,
  lon: 22.2666,
  category: "shop",
  provider: "nominatim",
};

beforeEach(() => {
  resetLanguageForTests("en");
  placeSearch.state = "idle";
  placeSearch.results = [];
  placeSearch.searchedQuery = "";
  placeSearch.search.mockReset().mockResolvedValue([]);
  placeSearch.clear.mockReset();
});

function renderSearch(overrides = {}) {
  const props = {
    stops,
    places: [home],
    destination: null,
    online: true,
    onChoosePlace: vi.fn(),
    onChooseStop: vi.fn(),
    onChooseGeocodedPlace: vi.fn(() => ({
      ok: true,
      reason: "ready",
      destination: {
        id: "geo:osm:node:123",
        kind: "geocoded-place",
        label: "Prisma Itäharju",
        primaryStopId: "164",
        acceptableStopIds: ["164"],
      },
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

test("typing shows local stop suggestions without calling the place provider", () => {
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Turun" } });

  expect(
    screen.getByRole("listbox", {
      name: "Destination stop suggestions",
    })
  ).toBeInTheDocument();
  expect(placeSearch.search).not.toHaveBeenCalled();
});

test("an exact public stop keeps the one-submit local fast path", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Turun linna" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(placeSearch.search).not.toHaveBeenCalled();
});

test("a non-exact address or place lookup runs only after explicit Search", async () => {
  placeSearch.search.mockResolvedValue([prisma]);
  renderSearch();

  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });
  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });

  expect(placeSearch.search).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() =>
    expect(placeSearch.search).toHaveBeenCalledWith("Prisma Itäharju")
  );
});

test("renders explicit place results and selects one as a geocoded destination", () => {
  placeSearch.state = "ready";
  placeSearch.results = [prisma];
  const props = renderSearch();

  const region = screen.getByRole("region", {
    name: "Places and addresses",
  });
  expect(within(region).getByText("Prisma Itäharju")).toBeInTheDocument();
  expect(
    within(region).getByText("Turku, Varsinais-Suomi, Suomi")
  ).toBeInTheDocument();

  fireEvent.click(
    within(region).getByRole("button", {
      name: /Prisma Itäharju.*Turku/i,
    })
  );

  expect(props.onChooseGeocodedPlace).toHaveBeenCalledWith(prisma);
});

test("does not call place search while offline", async () => {
  renderSearch({ online: false });
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(placeSearch.search).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Place search needs an internet connection. Stop search still works."
  );
});

test("does not guess between duplicate stop names", async () => {
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Kauppatori" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "More than one stop has this name. Choose one from the suggestions."
    )
  );
  expect(
    screen.getAllByRole("option", { name: /Kauppatori.*Stop 16/i })
  ).toHaveLength(2);
});

test("keeps the current UI open when a provider result cannot be used", () => {
  placeSearch.state = "ready";
  placeSearch.results = [prisma];

  renderSearch({
    onChooseGeocodedPlace: vi.fn(() => ({
      ok: false,
      reason: "outside-service-area",
      destination: null,
    })),
  });

  fireEvent.click(
    screen.getByRole("button", {
      name: /Prisma Itäharju.*Turku/i,
    })
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "That place is outside Föli’s service area."
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
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
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


test("waits for stop coordinates before external place search", async () => {
  renderSearch({ coordinatesStatus: "loading" });
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Prisma Itäharju" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(placeSearch.search).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Address and place search is waiting for stop locations. Try again in a moment."
  );
});

test("exact local stop still works while stop coordinates are unavailable", () => {
  const props = renderSearch({ coordinatesStatus: "unavailable" });
  const input = screen.getByRole("combobox", {
    name: "Stop, address or place",
  });

  fireEvent.change(input, { target: { value: "Turun linna" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(placeSearch.search).not.toHaveBeenCalled();
});
