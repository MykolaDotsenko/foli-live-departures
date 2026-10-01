import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";

const api = vi.hoisted(() => ({
  searchPlaces: vi.fn(),
  placeSearchViewbox: vi.fn(() => "22,61,23,60"),
}));

vi.mock("../api/placeSearch", () => ({
  searchPlaces: api.searchPlaces,
  placeSearchViewbox: api.placeSearchViewbox,
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
};

beforeEach(() => {
  resetLanguageForTests("en");
  api.searchPlaces.mockReset().mockResolvedValue([]);
  api.placeSearchViewbox.mockReset().mockReturnValue("22,61,23,60");
});

function renderSearch(overrides = {}) {
  const props = {
    stops,
    places: [home],
    destination: null,
    online: true,
    coordinatesStatus: "ready",
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

function destinationInput() {
  return screen.getByRole("combobox", {
    name: "Stop, address or place",
  });
}

async function searchFor(query) {
  fireEvent.change(destinationInput(), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

test("offers saved destinations as one-tap choices", () => {
  const props = renderSearch();
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(props.onChoosePlace).toHaveBeenCalledWith(home);
});

test("typing shows local stop suggestions without calling the external provider", () => {
  renderSearch();
  fireEvent.change(destinationInput(), { target: { value: "Turun" } });

  expect(
    screen.getByRole("listbox", {
      name: "Destination stop suggestions",
    })
  ).toBeInTheDocument();
  expect(api.searchPlaces).not.toHaveBeenCalled();
});

test("exact public stop keeps the local one-submit fast path", () => {
  const props = renderSearch();
  fireEvent.change(destinationInput(), { target: { value: "Turun linna" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(api.searchPlaces).not.toHaveBeenCalled();
});

test("unique partial stop match stays on-device", () => {
  const props = renderSearch();
  fireEvent.change(destinationInput(), { target: { value: "Turun" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(api.searchPlaces).not.toHaveBeenCalled();
});

test("address or POI lookup runs only after explicit Search", async () => {
  api.searchPlaces.mockResolvedValue([prisma]);
  renderSearch();

  fireEvent.change(destinationInput(), {
    target: { value: "Prisma Itäharju" },
  });
  expect(api.searchPlaces).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() =>
    expect(api.searchPlaces).toHaveBeenCalledWith(
      "Prisma Itäharju",
      expect.objectContaining({
        language: "en",
        viewbox: "22,61,23,60",
        signal: expect.any(globalThis.AbortSignal),
      })
    )
  );
});

test("renders provider results and selects one as a geocoded destination", async () => {
  api.searchPlaces.mockResolvedValue([prisma]);
  const props = renderSearch();

  await searchFor("Prisma Itäharju");

  const listbox = await screen.findByRole("listbox", {
    name: "Places and addresses",
  });
  expect(within(listbox).getByText("Prisma Itäharju")).toBeInTheDocument();
  expect(
    within(listbox).getByText("Turku, Varsinais-Suomi, Suomi")
  ).toBeInTheDocument();

  fireEvent.click(
    within(listbox).getByRole("option", {
      name: /Prisma Itäharju.*Turku/i,
    })
  );

  expect(props.onChooseGeocodedPlace).toHaveBeenCalledWith(prisma);
});

test("provider failure is explicit and local stop search remains available", async () => {
  api.searchPlaces.mockRejectedValue(new Error("provider down"));
  renderSearch();

  await searchFor("Prisma Itäharju");

  expect(
    await screen.findByRole("alert")
  ).toHaveTextContent(
    "Place search is temporarily unavailable. Stop search still works."
  );
});

test("does not call external place search while offline", () => {
  renderSearch({ online: false });
  fireEvent.change(destinationInput(), {
    target: { value: "Prisma Itäharju" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(api.searchPlaces).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Place search needs an internet connection. Stop search still works."
  );
});

test("does not guess between duplicate stop names", async () => {
  renderSearch();
  fireEvent.change(destinationInput(), { target: { value: "Kauppatori" } });
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

test("keeps current UI open when a provider result cannot be used", async () => {
  api.searchPlaces.mockResolvedValue([prisma]);
  renderSearch({
    onChooseGeocodedPlace: vi.fn(() => ({
      ok: false,
      reason: "outside-service-area",
      destination: null,
    })),
  });

  await searchFor("Prisma Itäharju");
  const listbox = await screen.findByRole("listbox", {
    name: "Places and addresses",
  });
  fireEvent.click(
    within(listbox).getByRole("option", {
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

  const status = screen.getByRole("status");
  expect(within(status).getByText("Going to")).toBeInTheDocument();
  expect(within(status).getByText("Home")).toBeInTheDocument();

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

test("keeps an opened stop board compact until change is requested", () => {
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
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  expect(destinationInput()).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Clear destination" }));
  expect(props.onClear).toHaveBeenCalledTimes(1);
});

test("waits for stop coordinates before external place search", () => {
  renderSearch({ coordinatesStatus: "loading" });
  fireEvent.change(destinationInput(), {
    target: { value: "Prisma Itäharju" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(api.searchPlaces).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Address and place search is waiting for stop locations. Try again in a moment."
  );
});

test("exact local stop still works while coordinates are unavailable", () => {
  const props = renderSearch({ coordinatesStatus: "unavailable" });
  fireEvent.change(destinationInput(), { target: { value: "Turun linna" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
  expect(api.searchPlaces).not.toHaveBeenCalled();
});
