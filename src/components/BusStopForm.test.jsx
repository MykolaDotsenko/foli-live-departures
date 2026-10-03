import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BusStopForm from "./BusStopForm";
import { resetLanguageForTests, setLanguage } from "../i18n";

const stops = [
  { id: "164", name: "Kauppatori" },
  { id: "4", name: "Turun linna" },
  { id: "32", name: "Puistokatu" },
];


test("starts with an empty field when no stop is selected", () => {
  render(<BusStopForm activeStopId="" stops={stops} onSubmit={vi.fn()} />);

  expect(
    screen.getByRole("combobox", { name: "Find your stop" })
  ).toHaveValue("");
});

test("location button fills the nearest stop but waits for explicit submit", async () => {
  const originalGeolocation = navigator.geolocation;
  const onSubmit = vi.fn();
  const stopsWithCoordinates = [
    { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
    { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
  ];

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success) =>
        success({
          coords: {
            latitude: 60.45182,
            longitude: 22.26662,
            accuracy: 12,
          },
        }),
    },
  });

  try {
    render(
      <BusStopForm
        activeStopId="4"
        stops={stopsWithCoordinates}
        coordinatesStatus="ready"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Use my location",
      })
    );

    const input = screen.getByRole("combobox", { name: "Find your stop" });
    await waitFor(() => expect(input).toHaveValue("Kauppatori"));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Show departures" }));
    expect(onSubmit).toHaveBeenCalledWith("164");
  } finally {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  }
});

// A slow fix used to land after the passenger had started typing and
// replace their words with the nearest stop, marked as resolved.
test("a late location fix does not overwrite what was typed meanwhile", async () => {
  const originalGeolocation = navigator.geolocation;
  let deliverFix;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success) => {
        deliverFix = () =>
          success({
            coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 10 },
          });
      },
    },
  });

  try {
    const onSubmit = vi.fn();
    render(
      <BusStopForm
        activeStopId=""
        stops={[
          { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
          { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
        ]}
        coordinatesStatus="ready"
        onSubmit={onSubmit}
      />
    );

    const locate = screen.getByRole("button", { name: "Use my location" });
    fireEvent.click(locate);
    const input = screen.getByRole("combobox", { name: "Find your stop" });
    fireEvent.change(input, { target: { value: "Puistokatu" } });

    await act(async () => deliverFix());

    await waitFor(() => expect(locate).not.toHaveAttribute("aria-disabled"));
    expect(input).toHaveValue("Puistokatu");

    // The typed text is still looked up as typed, not as a resolved stop.
    fireEvent.click(screen.getByRole("button", { name: "Show departures" }));
    expect(onSubmit).toHaveBeenCalledWith("32");
  } finally {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  }
});

test("finds stops by name and submits a suggestion", () => {
  const onSubmit = vi.fn();

  render(
    <BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Turun" } });
  fireEvent.focus(input);

  fireEvent.click(screen.getByRole("option", { name: /Turun linna/i }));

  expect(onSubmit).toHaveBeenCalledWith("4");
});

test("supports arrow-key selection", () => {
  const onSubmit = vi.fn();

  render(
    <BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Puisto" } });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSubmit).toHaveBeenCalledWith("32");
});

test("accepts a numeric stop directly", () => {
  const onSubmit = vi.fn();

  render(
    <BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "32" } });
  fireEvent.click(screen.getByRole("button", { name: "Show departures" }));

  expect(onSubmit).toHaveBeenCalledWith("32");
});


test("accepts a unique partial name without forcing an extra tap", () => {
  const onSubmit = vi.fn();

  render(
    <BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Puisto" } });
  fireEvent.click(screen.getByRole("button", { name: "Show departures" }));

  expect(onSubmit).toHaveBeenCalledWith("32");
});

test("matches stop names without requiring Finnish diacritics", () => {
  const onSubmit = vi.fn();
  const localStops = [{ id: "9", name: "Mäntymäki" }];

  render(
    <BusStopForm activeStopId="164" stops={localStops} onSubmit={onSubmit} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Mantymaki" } });
  fireEvent.click(screen.getByRole("button", { name: "Show departures" }));

  expect(onSubmit).toHaveBeenCalledWith("9");
});


test("does not silently choose between stops with the same name", () => {
  const onSubmit = vi.fn();
  const duplicateStops = [
    { id: "100", name: "Market" },
    { id: "101", name: "Market" },
  ];

  render(
    <BusStopForm
      activeStopId="164"
      stops={duplicateStops}
      onSubmit={onSubmit}
    />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Market" } });
  fireEvent.click(screen.getByRole("button", { name: "Show departures" }));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(
    screen.getByText(/More than one stop has this name/i)
  ).toBeInTheDocument();
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

// The field takes a name or a number equally, so it should hand back
// whichever one the person thinks in. It used to answer every entry with the
// number: type "Kauppatori", get "164".
test("keeps the stop name in the field instead of swapping it for a number", () => {
  render(<BusStopForm activeStopId="164" stops={stops} onSubmit={vi.fn()} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  expect(input).toHaveValue("Kauppatori");

  fireEvent.change(input, { target: { value: "Turun" } });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: /Turun linna/i }));

  expect(input).toHaveValue("Turun linna");
});

test("a stop number typed in comes back as that stop's name", () => {
  const onSubmit = vi.fn();
  render(<BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "32" } });
  fireEvent.submit(input.closest("form"));

  expect(onSubmit).toHaveBeenCalledWith("32");
});

// With the name showing, pressing Show again has to mean the same stop —
// not send the text back through a name lookup that two stops could match.
test("re-submitting a resolved name reopens that exact stop", () => {
  const twins = [
    { id: "164", name: "Kauppatori" },
    { id: "999", name: "Kauppatori" },
  ];
  const onSubmit = vi.fn();

  render(<BusStopForm activeStopId="999" stops={twins} onSubmit={onSubmit} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  expect(input).toHaveValue("Kauppatori");

  fireEvent.submit(input.closest("form"));

  expect(onSubmit).toHaveBeenCalledWith("999");
  expect(screen.queryByText(/More than one stop/i)).not.toBeInTheDocument();
});

test("still refuses to guess when a freshly typed name is ambiguous", () => {
  const twins = [
    { id: "164", name: "Kauppatori" },
    { id: "999", name: "Kauppatori" },
  ];
  const onSubmit = vi.fn();

  render(<BusStopForm activeStopId="4" stops={[...twins, { id: "4", name: "Turun linna" }]} onSubmit={onSubmit} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Kauppatori" } });
  fireEvent.submit(input.closest("form"));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/More than one stop/i)).toBeInTheDocument();
});

// The catalogue loads after the first paint and again when coordinates
// merge, so `stops` changes identity mid-session. Resetting the field on
// each of those wiped whatever was being typed at that moment.
test("typing survives the stop catalogue arriving late", () => {
  const { rerender } = render(
    <BusStopForm activeStopId="164" stops={[]} onSubmit={vi.fn()} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "Runos" } });

  rerender(<BusStopForm activeStopId="164" stops={stops} onSubmit={vi.fn()} />);

  expect(input).toHaveValue("Runos");
});

test("a stop shown as a bare number gains its name once the catalogue lands", () => {
  const { rerender } = render(
    <BusStopForm activeStopId="164" stops={[]} onSubmit={vi.fn()} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  expect(input).toHaveValue("164");

  rerender(<BusStopForm activeStopId="164" stops={stops} onSubmit={vi.fn()} />);

  expect(input).toHaveValue("Kauppatori");
});

test("moving to another stop replaces the field whatever was in it", () => {
  const { rerender } = render(
    <BusStopForm activeStopId="164" stops={stops} onSubmit={vi.fn()} />
  );

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(input, { target: { value: "half typed" } });

  rerender(<BusStopForm activeStopId="4" stops={stops} onSubmit={vi.fn()} />);

  expect(input).toHaveValue("Turun linna");
});

async function locateWith(coords, extraProps = {}) {
  const originalGeolocation = navigator.geolocation;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (success) => success({ coords }) },
  });

  try {
    render(
      <BusStopForm
        activeStopId="4"
        stops={[
          { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
          { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
        ]}
        coordinatesStatus="ready"
        onSubmit={vi.fn()}
        {...extraProps}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
  } finally {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  }
}

// The locate button filled in whatever stop was nearest, however rough the
// fix and however far away the stop: ±3 km in Helsinki gave a stop in Salo.
test("does not fill in a stop from an approximate location", async () => {
  await locateWith({ latitude: 60.45182, longitude: 22.26662, accuracy: 3_000 });

  // Still the stop that is open.
  expect(screen.getByRole("combobox", { name: "Find your stop" })).toHaveValue("Turun linna");
  expect(screen.getByRole("alert")).toHaveTextContent(/approximate/i);
});

test("does not fill in a stop far from where the passenger is", async () => {
  await locateWith({ latitude: 60.1699, longitude: 24.9384, accuracy: 10 });

  expect(screen.getByRole("combobox", { name: "Find your stop" })).toHaveValue("Turun linna");
  expect(screen.getByRole("alert")).toHaveTextContent(/away/i);
});

// The distance is written when the message is shown, so a switch of
// language does not leave "1.4 km" in a Finnish sentence.
test("a location message on screen writes its distance in the new language", async () => {
  await locateWith({ latitude: 60.45182, longitude: 22.26662, accuracy: 1_420 });
  expect(screen.getByRole("alert")).toHaveTextContent("(1.4 km)");

  try {
    await act(async () => {
      await setLanguage("fi");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("(1,4 km)");
  } finally {
    resetLanguageForTests("en");
    localStorage.clear();
  }
});

// A hub where eight stops share one name: the form asks the passenger to
// pick the right stop number from the suggestions, so all eight must be
// there, not the first six.
test("lists every stop that shares the exact name typed", () => {
  const hub = Array.from({ length: 8 }, (_, index) => ({
    id: String(1 + index),
    name: "Kauppatori",
  }));

  render(<BusStopForm activeStopId="" stops={hub} onSubmit={vi.fn()} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kauppatori" } });

  expect(screen.getAllByRole("option")).toHaveLength(8);
});

// The compact one-tap location action stays beside search even before a
// board is open. "Near you" is the richer comparison view, not a substitute
// for the fast search-row action.
test("offers one-tap location before a stop is open", () => {
  render(<BusStopForm activeStopId="" stops={stops} onSubmit={vi.fn()} />);

  expect(
    screen.getByRole("button", { name: "Use my location" })
  ).toBeInTheDocument();
});

// Escape closed the list for good: typing on gave no suggestions until the
// field was left and focused again, which a keyboard user had no reason to
// guess.
test("typing after Escape brings the suggestions back", () => {
  render(<BusStopForm activeStopId="" stops={stops} onSubmit={vi.fn()} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kaup" } });
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(input).toHaveAttribute("aria-expanded", "false");

  fireEvent.change(input, { target: { value: "Kaupp" } });
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  expect(input).toHaveAttribute("aria-expanded", "true");
});

test("the down arrow reopens suggestions that Escape closed", () => {
  render(<BusStopForm activeStopId="" stops={stops} onSubmit={vi.fn()} />);

  const input = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kaup" } });
  fireEvent.keyDown(input, { key: "Escape" });

  fireEvent.keyDown(input, { key: "ArrowDown" });

  expect(screen.getByRole("listbox")).toBeInTheDocument();
});

// Disabled while it looked, the button dropped keyboard focus to the page.
test("the location button keeps focus while it looks and ignores a second press", () => {
  const originalGeolocation = navigator.geolocation;
  const getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  try {
    render(
      <BusStopForm
        activeStopId=""
        stops={[{ id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 }]}
        coordinatesStatus="ready"
        onSubmit={vi.fn()}
      />
    );

    const locate = screen.getByRole("button", { name: "Use my location" });
    locate.focus();
    fireEvent.click(locate);
    fireEvent.click(locate);

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(locate).toHaveAttribute("aria-disabled", "true");
    expect(locate).not.toBeDisabled();
    expect(locate).toHaveFocus();
  } finally {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  }
});

// Left open after a choice, the list went on offering the stop just
// picked, and a screen reader still heard the box as expanded.
test("the suggestion list closes once a stop is chosen", () => {
  const onSubmit = vi.fn();
  render(<BusStopForm activeStopId="" stops={stops} onSubmit={onSubmit} />);
  const input = screen.getByRole("combobox", { name: "Find your stop" });

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Kaup" } });
  expect(input).toHaveAttribute("aria-expanded", "true");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSubmit).toHaveBeenCalledWith("164");
  expect(input).toHaveAttribute("aria-expanded", "false");
});

// A number typed and submitted with the keyboard's Go key leaves focus in
// the field. Once the board opens, the field shows the stop's name, and a
// list still open on that name covered the board's own heading.
test("the suggestion list stays closed after a stop number is submitted", () => {
  const onSubmit = vi.fn();
  const { rerender } = render(
    <BusStopForm activeStopId="" stops={stops} onSubmit={onSubmit} />
  );
  const input = screen.getByRole("combobox", { name: "Find your stop" });

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "164" } });
  fireEvent.submit(input.closest("form"));
  expect(onSubmit).toHaveBeenCalledWith("164");

  rerender(<BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />);

  expect(input).toHaveValue("Kauppatori");
  expect(input).toHaveAttribute("aria-expanded", "false");
});

test("the suggestion list stays closed after re-submitting the stop on screen", () => {
  const onSubmit = vi.fn();
  render(<BusStopForm activeStopId="164" stops={stops} onSubmit={onSubmit} />);
  const input = screen.getByRole("combobox", { name: "Find your stop" });

  fireEvent.focus(input);
  fireEvent.submit(input.closest("form"));

  expect(onSubmit).toHaveBeenCalledWith("164");
  expect(input).toHaveAttribute("aria-expanded", "false");
});
