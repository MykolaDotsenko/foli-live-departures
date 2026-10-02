import { act, fireEvent, render, screen } from "@testing-library/react";
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

test("offers the other language in its own words, and switches the page to it", () => {
  render(<LanguageSwitch />);

  const toFinnish = screen.getByRole("button", { name: "Suomeksi" });
  expect(toFinnish).toHaveAttribute("lang", "fi");

  fireEvent.click(toFinnish);

  expect(document.documentElement.lang).toBe("fi");
  expect(localStorage.getItem("foli-language-v1")).toBe("fi");
  const toEnglish = screen.getByRole("button", { name: "In English" });
  expect(toEnglish).toHaveAttribute("lang", "en");

  fireEvent.click(toEnglish);
  expect(document.documentElement.lang).toBe("en");
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

  fireEvent.click(screen.getByRole("button", { name: "Suomeksi" }));
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
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
  fireEvent.submit(screen.getByRole("combobox").closest("form"));
  expect(
    screen.getByText("Choose a stop from the suggestions or enter its stop number.")
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Suomeksi" }));

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


test("applies an imported language immediately when this origin had no explicit choice", () => {
  resetLanguageForTests("en");
  render(<LanguageSwitch />);

  localStorage.setItem("foli-language-v1", "fi");
  act(() => {
    window.dispatchEvent(new Event(LOCAL_STATE_IMPORTED_EVENT));
  });

  expect(document.documentElement.lang).toBe("fi");
  expect(
    screen.getByRole("button", { name: "In English" })
  ).toBeInTheDocument();
});
