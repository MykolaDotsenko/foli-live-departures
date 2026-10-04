import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import LanguageSwitch from "./LanguageSwitch";
import BusStopDisplay from "./BusStopDisplay";
import BusStopForm from "./BusStopForm";
import ServiceAlerts from "./ServiceAlerts";
import { resetLanguageForTests } from "../i18n";
import { LOCAL_STATE_IMPORTED_EVENT } from "../utils/localStateEvents";

afterEach(() => {
  resetLanguageForTests("en");
  localStorage.clear();
});

// A button naming only the next language made a Ukrainian on an English
// phone go through Finnish, and never said which languages there were.
test("lists every language in its own name and switches to any in one step", async () => {
  render(<LanguageSwitch />);

  const picker = screen.getByRole("combobox", { name: "Language" });
  expect(picker).toHaveValue("en");
  const options = within(picker).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual([
    "English",
    "Suomi",
    "Українська",
    "Svenska",
  ]);
  expect(options.map((option) => option.getAttribute("lang"))).toEqual([
    "en",
    "fi",
    "uk",
    "sv",
  ]);

  // Straight to Ukrainian, not through Finnish.
  fireEvent.change(picker, { target: { value: "uk" } });
  await waitFor(() => {
    expect(document.documentElement.lang).toBe("uk");
    expect(localStorage.getItem("foli-language-v1")).toBe("uk");
  });
  expect(screen.getByRole("combobox", { name: "Мова" })).toHaveValue("uk");

  fireEvent.change(screen.getByRole("combobox", { name: "Мова" }), {
    target: { value: "sv" },
  });
  await waitFor(() => {
    expect(document.documentElement.lang).toBe("sv");
    expect(localStorage.getItem("foli-language-v1")).toBe("sv");
  });

  fireEvent.change(screen.getByRole("combobox", { name: "Språk" }), {
    target: { value: "fi" },
  });
  await waitFor(() => {
    expect(document.documentElement.lang).toBe("fi");
    expect(localStorage.getItem("foli-language-v1")).toBe("fi");
  });
  expect(screen.getByRole("combobox", { name: "Kieli" })).toHaveValue("fi");

  fireEvent.change(screen.getByRole("combobox", { name: "Kieli" }), {
    target: { value: "en" },
  });
  await waitFor(() => {
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("foli-language-v1")).toBe("en");
  });
});

// The pill shows the language in use in its own name; the select over it
// is what a screen reader and the phone's picker use.
test("shows the language in use on the pill", async () => {
  resetLanguageForTests("fi");
  const { container } = render(<LanguageSwitch />);

  const label = container.querySelector('.language-switch > span[lang="fi"]');
  expect(label).toHaveTextContent("Suomi");
  expect(label).toHaveAttribute("aria-hidden", "true");
});

const NOW = Math.floor(Date.now() / 1000);

test("the departure board reads in Finnish, names left as the sign says", () => {
  resetLanguageForTests("fi");
  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      stop={{ id: "164", name: "Kauppatori" }}
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          destinationdisplay_en: "Harbour",
          monitored: true,
          recordedattime: NOW - 5,
          delay: 90,
          expecteddeparturetime: NOW + 240,
          aimeddeparturetime: NOW + 150,
        },
      ]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
    />
  );

  expect(screen.getByRole("columnheader", { name: "Lähtee" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Päivitä" })).toBeInTheDocument();
  expect(screen.getByText("Satama")).toBeInTheDocument();
  expect(screen.queryByText("Harbour")).not.toBeInTheDocument();
  expect(screen.getByText("Reaaliaika · 2 min myöhässä")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: /^4 min \d\d:\d\d$/ })).toBeInTheDocument();
});

test("a board already on screen follows a switch of language", () => {
  const { rerender } = render(<LanguageSwitch />);
  render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      arrivals={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
    />
  );
  expect(screen.getByText("No upcoming departures.")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "fi" },
  });
  rerender(<LanguageSwitch />);

  expect(screen.getByText("Ei tulevia lähtöjä.")).toBeInTheDocument();
});

test("the search form, and an error already shown in it, follow the language", () => {
  render(<LanguageSwitch />);
  render(
    <BusStopForm
      activeStopId=""
      stops={[{ id: "164", name: "Kauppatori" }]}
      onSubmit={() => {}}
    />
  );
  const search = screen.getByRole("combobox", { name: "Find your stop" });
  fireEvent.change(search, { target: { value: "zzz" } });
  fireEvent.submit(search.closest("form"));
  expect(
    screen.getByText("Choose a stop from the suggestions or enter its stop number.")
  ).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "fi" },
  });

  expect(screen.getByLabelText("Etsi pysäkki")).toHaveAttribute(
    "placeholder",
    "esim. Kauppatori"
  );
  expect(
    screen.getByText("Valitse pysäkki ehdotuksista tai kirjoita sen numero.")
  ).toBeInTheDocument();
});

test("service updates speak Finnish, with Föli's cause codes in words", () => {
  resetLanguageForTests("fi");
  render(
    <ServiceAlerts
      alerts={[
        {
          id: "cancellation-1",
          type: "cancellation",
          title: "Peruttu lähtö",
          line: "32",
          cause: "TECHNICAL_PROBLEM",
          scheduledTime: null,
          routeNames: ["32"],
          effect: "NO_SERVICE",
          effectLabel: "Ei liikennettä",
        },
      ]}
      receivedAtMs={Date.now()}
    />
  );

  expect(screen.getByRole("heading", { name: "Liikennetiedotteet" })).toBeInTheDocument();
  expect(screen.getByText("1 liikennetiedote")).toBeInTheDocument();
  expect(screen.getByText("Linja 32 · Tekninen vika")).toBeInTheDocument();
});

// The live feed often leaves the stop's name out. The board called it
// "Stop 164" in the Finnish interface until the catalogue arrived, and for
// good if it never did.
test("a stop with no name yet is called by its number in Finnish", () => {
  resetLanguageForTests("fi");
  render(
    <BusStopDisplay
      stopId="164"
      stopName=""
      arrivals={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
    />
  );

  expect(screen.getByRole("heading", { name: "Pysäkki 164" })).toBeInTheDocument();
});

// An English screen reader says "Kauppatori" and "Satama" as a Finn would
// only when they are marked Finnish; a translation beside the sign is
// marked in its own language, and a stand-in number is not a Finnish name.
test("names are marked with the language they are written in", () => {
  const { unmount } = render(
    <BusStopDisplay
      stopId="164"
      stopName="Kauppatori"
      arrivals={[
        {
          lineref: "1",
          destinationdisplay: "Satama",
          destinationdisplay_en: "Harbour",
          monitored: true,
          recordedattime: NOW - 5,
          expecteddeparturetime: NOW + 240,
        },
      ]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
    />
  );

  expect(screen.getByText("Kauppatori")).toHaveAttribute("lang", "fi");
  expect(screen.getByText("Satama")).toHaveAttribute("lang", "fi");
  expect(screen.getByText("Harbour")).toHaveAttribute("lang", "en");
  unmount();

  render(
    <BusStopDisplay
      stopId="164"
      stopName=""
      arrivals={[]}
      routesById={new Map()}
      routesByShortName={new Map()}
      serverTime={NOW}
      receivedAtMs={Date.now()}
      loading={false}
      refreshing={false}
      error={false}
      onRefresh={() => {}}
    />
  );
  const heading = screen.getByRole("heading", { name: "Stop 164" });
  expect(heading.querySelector("[lang]")).toBeNull();
});


test("follows a language change made in another tab without rewriting storage", async () => {
  resetLanguageForTests("en");
  render(<LanguageSwitch />);

  localStorage.setItem("foli-language-v1", "fi");
  act(() => {
    window.dispatchEvent(
      new globalThis.StorageEvent("storage", {
        key: "foli-language-v1",
        oldValue: "en",
        newValue: "fi",
      })
    );
  });

  await waitFor(() => {
    expect(document.documentElement.lang).toBe("fi");
    expect(screen.getByRole("combobox", { name: "Kieli" })).toHaveValue("fi");
  });
  expect(localStorage.getItem("foli-language-v1")).toBe("fi");
});

test("applies an imported language immediately when this origin had no explicit choice", () => {
  resetLanguageForTests("en");
  render(<LanguageSwitch />);

  localStorage.setItem("foli-language-v1", "fi");
  act(() => {
    window.dispatchEvent(new Event(LOCAL_STATE_IMPORTED_EVENT));
  });

  expect(document.documentElement.lang).toBe("fi");
  expect(screen.getByRole("combobox", { name: "Kieli" })).toHaveValue("fi");
});
