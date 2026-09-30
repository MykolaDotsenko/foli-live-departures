import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
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

function renderSearch(overrides = {}) {
  const props = {
    stops,
    places: [home],
    destination: null,
    onChoosePlace: vi.fn(),
    onChooseStop: vi.fn(),
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

test("searches for a public destination stop and keeps manual choice explicit", () => {
  const props = renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Choose destination stop",
  });

  fireEvent.change(input, { target: { value: "Turun" } });

  const list = screen.getByRole("listbox", {
    name: "Destination stop suggestions",
  });
  fireEvent.click(
    within(list).getByRole("option", { name: /Turun linna.*Stop 4/i })
  );

  expect(props.onChooseStop).toHaveBeenCalledWith(stops[0]);
});

test("does not guess between duplicate stop names", () => {
  renderSearch();
  const input = screen.getByRole("combobox", {
    name: "Choose destination stop",
  });

  fireEvent.change(input, { target: { value: "Kauppatori" } });
  fireEvent.click(screen.getByRole("button", { name: "Use destination" }));

  expect(
    screen.getByRole("alert")
  ).toHaveTextContent(
    "More than one stop has this name. Choose one from the suggestions."
  );
  expect(
    screen.getAllByRole("option", { name: /Kauppatori.*Stop 16/i })
  ).toHaveLength(2);
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

  expect(screen.getByText("Going to")).toBeInTheDocument();
  expect(screen.getByText("Home")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Clear destination" }));
  expect(props.onClear).toHaveBeenCalledTimes(1);
});

test("requires a destination value", () => {
  renderSearch();
  fireEvent.click(screen.getByRole("button", { name: "Use destination" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a stop name or number."
  );
});
