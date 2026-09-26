import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import HomeRecovery from "./HomeRecovery";
import { resetLanguageForTests } from "../i18n";

const home = {
  id: "home",
  label: "Home",
  icon: "⌂",
  primaryStopId: "164",
  stops: [
    { id: "164", name: "Kauppatori" },
    { id: "32", name: "Puistokatu" },
  ],
};

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
];

const originalPrint = Object.getOwnPropertyDescriptor(globalThis, "print");

afterEach(() => {
  vi.restoreAllMocks();
  resetLanguageForTests("en");

  if (originalPrint) {
    Object.defineProperty(globalThis, "print", originalPrint);
  } else {
    delete globalThis.print;
  }
});

test("does not render recovery before Home has been configured", () => {
  const { container } = render(
    <HomeRecovery home={null} stops={stops} onOpenStop={vi.fn()} />
  );

  expect(container).toBeEmptyDOMElement();
});

test("offers one-tap transit recovery without embedding the current origin", () => {
  render(<HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />);

  expect(
    screen.getByRole("heading", {
      name: "Need help getting home?",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByText(/In an emergency, call 112/)
  ).toBeInTheDocument();

  const getHome = screen.getByRole("link", {
    name: "Get me Home by public transit",
  });
  const url = new globalThis.URL(getHome.href);

  expect(url.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(url.searchParams.get("travelmode")).toBe("transit");
  expect(url.searchParams.has("origin")).toBe(false);
  expect(
    screen.getByText("Get me Home opens a route in Google Maps. Check it before you travel.")
  ).toBeInTheDocument();
});

test("keeps useful fallbacks when route coordinates are unavailable", () => {
  const onOpenStop = vi.fn();

  render(
    <HomeRecovery
      home={home}
      stops={[
        { id: "164", name: "Kauppatori" },
        { id: "32", name: "Puistokatu" },
      ]}
      onOpenStop={onOpenStop}
    />
  );

  expect(
    screen.getByRole("button", { name: "Get me Home" })
  ).toBeDisabled();
  expect(
    screen.getByText(/Directions will work once stop locations load/i)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Open Home stop" }));
  expect(onOpenStop).toHaveBeenCalledWith("164");

  fireEvent.click(screen.getByRole("button", { name: "Show to driver" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: /Kauppatori/ })
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("heading", { name: /Stop 164/ })).toBeInTheDocument();
});

test("exposes saved backup stops only on demand", () => {
  const onOpenStop = vi.fn();

  render(<HomeRecovery home={home} stops={stops} onOpenStop={onOpenStop} />);

  fireEvent.click(
    screen.getByText("Backup Home stop")
  );

  const backupRoute = screen.getByRole("link", {
    name: "Route there: backup Home stop Puistokatu, stop 32, by public transit",
  });
  const backupUrl = new globalThis.URL(backupRoute.href);
  expect(backupUrl.searchParams.get("destination")).toBe("60.4488,22.255");
  expect(backupUrl.searchParams.has("origin")).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Open stop" }));
  expect(onOpenStop).toHaveBeenCalledWith("32");
});


test("does not send a stressed user into external routing while offline", () => {
  const onOpenStop = vi.fn();

  render(
    <HomeRecovery
      home={home}
      stops={stops}
      online={false}
      onOpenStop={onOpenStop}
    />
  );

  expect(
    screen.getByRole("button", { name: "Get me Home" })
  ).toBeDisabled();
  expect(
    screen.getByText("Directions need an internet connection.")
  ).toBeInTheDocument();
  // The action that still works offline leads.
  expect(
    screen.getAllByRole("button").find((button) => !button.disabled)
  ).toHaveTextContent("Show to driver");

  fireEvent.click(screen.getByRole("button", { name: "Open Home stop" }));
  expect(onOpenStop).toHaveBeenCalledWith("164");

  fireEvent.click(screen.getByRole("button", { name: "Show to driver" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});


test("can print a public-stop-only Home backup card before the phone dies", () => {
  const print = vi.fn();
  Object.defineProperty(globalThis, "print", {
    configurable: true,
    value: print,
  });

  render(<HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />);

  fireEvent.click(screen.getByText("Print a backup card"));
  expect(
    screen.getByText(/A web app cannot help after the phone powers off/i)
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Print / save Home backup card" })
  );

  expect(print).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Home backup card")).toBeInTheDocument();
  expect(screen.getAllByText("Kauppatori").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Stop 164/).length).toBeGreaterThan(0);
  expect(screen.queryByText("60.4518")).not.toBeInTheDocument();
  expect(screen.queryByText("22.2666")).not.toBeInTheDocument();
});

test("offers Get me Home in Finnish for a Home saved with its English label", () => {
  resetLanguageForTests("fi");

  render(<HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />);

  expect(
    screen.getByRole("heading", { name: "Tarvitsetko apua kotimatkalla?" })
  ).toBeInTheDocument();
  const getHome = screen.getByRole("link", {
    name: "Vie minut kotiin joukkoliikenteellä",
  });
  expect(getHome).toHaveTextContent("Vie minut kotiin");
  expect(new globalThis.URL(getHome.href).searchParams.get("destination")).toBe(
    "60.4518,22.2666"
  );
  expect(screen.getAllByText("Koti").length).toBeGreaterThan(0);
  // The name is Föli's, marked Finnish; the rest is the interface's.
  const primary = screen.getAllByText("Kauppatori")[0];
  expect(primary).toHaveAttribute("lang", "fi");
  expect(primary.parentElement).toHaveTextContent("Kauppatori · pysäkki 164");
  expect(
    screen.getByRole("button", { name: "Avaa kotipysäkki" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "Reitti sinne: kodin varapysäkki Puistokatu, pysäkki 32, joukkoliikenteellä",
    })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Näytä kuljettajalle" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Sulje" })
  ).toBeInTheDocument();
});

// The card's request is for the driver, so the Finnish interface prints it
// exactly as the English one does; the rest follows the passenger's language.
test("prints the Home card in Finnish with the driver's request unchanged", () => {
  const { container, unmount } = render(
    <HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />
  );
  const englishRequest = container.querySelector('[lang="fi"]').outerHTML;
  unmount();

  resetLanguageForTests("fi");
  const finnish = render(
    <HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />
  );

  expect(finnish.container.querySelector('[lang="fi"]').outerHTML).toBe(
    englishRequest
  );
  expect(
    screen.getByText("Voitteko auttaa minua jäämään pois oikealla pysäkillä?")
  ).toHaveAttribute("lang", "fi");
  expect(
    screen.getByText("Could you help me get off at the right stop?")
  ).toHaveAttribute("lang", "en");
  expect(screen.getByText("Kodin varakortti")).toBeInTheDocument();
  expect(screen.getByText("Varapysäkit")).toBeInTheDocument();
  // Stop numbers are printed for the driver, as the driver card shows them.
  expect(
    screen.getAllByText("Stop 164").some(
      (number) => number.parentElement.textContent === "Pysäkki / Stop 164"
    )
  ).toBe(true);
  expect(
    screen
      .getAllByText("Puistokatu")
      .some(
        (name) => name.parentElement.textContent === "Puistokatu · Pysäkki / Stop 32"
      )
  ).toBe(true);
});

// The biggest word on the card was "Home", which tells a driver nothing.
test("leads the printed card with the stop, not the place", () => {
  const { container } = render(
    <HomeRecovery home={home} stops={stops} onOpenStop={vi.fn()} />
  );

  const printed = container.querySelector('section[aria-hidden="true"]');
  expect(printed.querySelector("h2")).toHaveTextContent("Kauppatori");
});
