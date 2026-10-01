import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import MyPlaces from "./MyPlaces";
import { resetLanguageForTests } from "../i18n";

const stops = [
  { id: "164", name: "Kauppatori", lat: 60.4518, lon: 22.2666 },
  { id: "32", name: "Puistokatu", lat: 60.4488, lon: 22.255 },
  { id: "4", name: "Turun linna", lat: 60.4355, lon: 22.2345 },
];

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

function setGeolocation(getCurrentPosition) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  resetLanguageForTests("en");

  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    delete navigator.geolocation;
  }

  if (originalShare) {
    Object.defineProperty(navigator, "share", originalShare);
  } else {
    delete navigator.share;
  }
});

test("sets up Home from one-time location and saves only public safe stops", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 18,
      },
    })
  );
  const onSavePlace = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  expect(getCurrentPosition).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Use my location to set up Home" }));

  expect(
    await screen.findByRole("heading", {
      name: "Choose stops for Home",
    })
  ).toBeInTheDocument();
  expect(screen.getByText(/Location accuracy ±20 m/)).toBeInTheDocument();
  expect(
    screen.getByText(/Add backup stops only if you know they are suitable and familiar/i)
  ).toBeInTheDocument();

  const safeStopChoices = screen.getAllByRole("checkbox");
  expect(safeStopChoices[0]).toBeChecked();
  expect(safeStopChoices[1]).not.toBeChecked();
  expect(safeStopChoices[2]).not.toBeChecked();

  const saveHome = screen.getByRole("button", { name: "Save Home" });
  expect(saveHome).toBeEnabled();
  expect(
    screen.getByText("Yes, this is the right stop for Home.")
  ).toBeInTheDocument();
  fireEvent.click(saveHome);

  await waitFor(() => expect(onSavePlace).toHaveBeenCalledTimes(1));

  const saved = onSavePlace.mock.calls[0][0];
  expect(saved.id).toBe("home");
  expect(saved.primaryStopId).toBe("164");
  expect(saved.stops).toEqual([
    expect.objectContaining({ id: "164", name: "Kauppatori" }),
  ]);
  expect(saved.stops[0]).not.toHaveProperty("lat");
  expect(saved.stops[0]).not.toHaveProperty("lon");
  expect(saved.stops[0]).not.toHaveProperty("distanceMeters");
});

test("Go Home creates a transit handoff with no stored or shared origin", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              icon: "⌂",
              primaryStopId: "164",
              stops: [
                { id: "164", name: "Kauppatori" },
                { id: "32", name: "Puistokatu" },
              ],
            },
          ],
        ])
      }
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  const goHome = screen.getByRole("link", {
    name: "Get me Home by public transit",
  });
  const url = new globalThis.URL(goHome.href);

  expect(url.searchParams.get("destination")).toBe("60.4518,22.2666");
  expect(url.searchParams.get("travelmode")).toBe("transit");
  expect(url.searchParams.has("origin")).toBe(false);
});

test("shows a simple driver card without exposing a private address", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={
        new Map([
          [
            "school",
            {
              id: "school",
              label: "School",
              icon: "▣",
              primaryStopId: "32",
              stops: [{ id: "32", name: "Puistokatu" }],
            },
          ],
        ])
      }
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Show to driver" }));

  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: /Puistokatu/ })
  ).toBeInTheDocument();
  expect(within(dialog).getByText(/Stop 32/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Voitteko auttaa minua jäämään pois oikealla pysäkillä?"
    )
  ).toBeInTheDocument();
});


test("reviews and confirms the selected public stop when location is unavailable", () => {
  const onSavePlace = vi.fn();

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="unavailable"
      activeStopId="32"
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Use Puistokatu for Home" })
  );

  expect(
    screen.getByRole("heading", { name: "Choose stops for Home" })
  ).toBeInTheDocument();
  expect(screen.getByText("Using the stop you selected manually")).toBeInTheDocument();

  const saveHome = screen.getByRole("button", { name: "Save Home" });
  expect(saveHome).toBeEnabled();
  fireEvent.click(saveHome);

  expect(onSavePlace).toHaveBeenCalledWith({
    id: "home",
    stops: [{ id: "32", name: "Puistokatu" }],
    primaryStopId: "32",
  });
});


test("requires explicit confirmation before importing a shared Home", () => {
  const onImportSharedPlace = vi.fn();
  const onDismissSharedPlace = vi.fn();

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="164"
      placesById={new Map()}
      sharedPlace={{
        id: "home",
        primaryStopId: "164",
        stops: [
          { id: "164", name: "Kauppatori" },
          { id: "32", name: "Puistokatu" },
        ],
      }}
      onSavePlace={vi.fn()}
      onImportSharedPlace={onImportSharedPlace}
      onDismissSharedPlace={onDismissSharedPlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Add Home?" })
  ).toBeInTheDocument();
  expect(
    screen.getByText(/The stops show roughly where this place is/i)
  ).toBeInTheDocument();
  expect(onImportSharedPlace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Add Home" }));
  expect(onImportSharedPlace).toHaveBeenCalledTimes(1);
});

test("labels a shared place as replacement when that preset already exists", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="164"
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              icon: "⌂",
              primaryStopId: "32",
              stops: [{ id: "32", name: "Puistokatu" }],
            },
          ],
        ])
      }
      sharedPlace={{
        id: "home",
        primaryStopId: "164",
        stops: [{ id: "164", name: "Kauppatori" }],
      }}
      onSavePlace={vi.fn()}
      onImportSharedPlace={vi.fn()}
      onDismissSharedPlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Replace Home?" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Replace Home" })
  ).toBeInTheDocument();
});

test("shares a configured place through the native share sheet when available", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="164"
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              icon: "⌂",
              primaryStopId: "164",
              stops: [
                { id: "164", name: "Kauppatori" },
                { id: "32", name: "Puistokatu" },
              ],
            },
          ],
        ])
      }
      sharedPlace={null}
      onSavePlace={vi.fn()}
      onImportSharedPlace={vi.fn()}
      onDismissSharedPlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByText("Manage Home"));
  fireEvent.click(screen.getByRole("button", { name: "Share this place" }));

  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));

  const shareData = share.mock.calls[0][0];
  const url = new globalThis.URL(shareData.url);

  expect(url.search).toBe("");
  expect(url.hash).toMatch(/^#place=/);
  expect(shareData.text).toBe("Add Home to My Places");
});


test("adds backup stops to a place only after explicit opt-in", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 18,
      },
    })
  );
  const onSavePlace = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Use my location to set up Home" })
  );

  await screen.findByRole("heading", {
    name: "Choose stops for Home",
  });

  const choices = screen.getAllByRole("checkbox");
  const saveHome = screen.getByRole("button", { name: "Save Home" });
  expect(saveHome).toBeEnabled();

  fireEvent.click(choices[1]);
  expect(saveHome).toBeEnabled();
  expect(
    screen.getByText("Yes, these are the right stops for Home.")
  ).toBeInTheDocument();
  expect(screen.getAllByRole("radio", { name: /Main stop/i })).toHaveLength(2);
  fireEvent.click(saveHome);

  await waitFor(() => expect(onSavePlace).toHaveBeenCalledTimes(1));
  expect(onSavePlace.mock.calls[0][0].stops).toEqual([
    { id: "164", name: "Kauppatori" },
    { id: "32", name: "Puistokatu" },
  ]);
});


test("warns that sharing a place can reveal its general area", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="164"
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              icon: "⌂",
              primaryStopId: "164",
              stops: [{ id: "164", name: "Kauppatori" }],
            },
          ],
        ])
      }
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByText("Manage Home"));
  expect(
    screen.getByText(/Sharing Home reveals its saved public stop names and numbers/i)
  ).toBeInTheDocument();
});


test("does not preselect a place's stop when location accuracy is poor", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 2_500,
      },
    })
  );
  const onSavePlace = vi.fn();

  setGeolocation(getCurrentPosition);

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Use my location to set up Home" })
  );

  await screen.findByRole("heading", {
    name: "Choose stops for Home",
  });

  expect(
    screen.getByText(/no stop was preselected/i)
  ).toBeInTheDocument();

  const stopChoices = screen.getAllByRole("checkbox");

  expect(stopChoices[0]).not.toBeChecked();
  expect(stopChoices[1]).not.toBeChecked();
  expect(stopChoices[2]).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Save Home" })).toBeDisabled();
  expect(onSavePlace).not.toHaveBeenCalled();
});

test("does not create a location-based place outside the Föli boundary", async () => {
  const getCurrentPosition = vi.fn((success) =>
    success({
      coords: {
        latitude: 60.45182,
        longitude: 22.26662,
        accuracy: 15,
      },
    })
  );
  const onSavePlace = vi.fn();
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
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      serviceBoundary={outsideGeometry}
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Use my location to set up Home" })
  );

  expect(
    await screen.findByText(/outside Föli’s published service area/i)
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Choose stops for Home" })
  ).not.toBeInTheDocument();
  expect(onSavePlace).not.toHaveBeenCalled();
});
// Saved places keep the English label they were stored with ("Home"); the
// screen names each by its id, so a place saved in one language reads
// correctly in the other.
const savedHome = {
  id: "home",
  label: "Home",
  icon: "⌂",
  primaryStopId: "164",
  stops: [
    { id: "164", name: "Kauppatori" },
    { id: "32", name: "Puistokatu" },
  ],
};

function renderSavedHome() {
  return render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map([["home", savedHome]])}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );
}

test("names a place saved as \"Home\" in Finnish, by what it is", () => {
  resetLanguageForTests("fi");
  renderSavedHome();

  expect(screen.getByRole("heading", { name: "Omat paikat" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Koti" })).toBeInTheDocument();
  expect(
    screen.getByText("Pääpysäkki: Kauppatori · pysäkki 164")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Vie minut kotiin joukkoliikenteellä" })
  ).toHaveTextContent("Vie minut kotiin");
  expect(screen.getByRole("button", { name: "Avaa kotipysäkki" })).toBeInTheDocument();
  expect(screen.getByText("1 varapysäkki")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Koulu" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Käytä sijaintiani työpaikan asettamiseen",
    })
  ).toHaveTextContent("Käytä sijaintiani");
  expect(document.body).not.toHaveTextContent(/Home|School|Work/);
});

test("sets up a place in Finnish, confirming it in the place's own words", () => {
  resetLanguageForTests("fi");
  const onSavePlace = vi.fn();

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="unavailable"
      activeStopId="32"
      placesById={new Map()}
      onSavePlace={onSavePlace}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Käytä pysäkkiä Puistokatu koulun pysäkkinä",
    })
  );

  expect(
    screen.getByRole("heading", { name: "Valitse koulun pysäkit" })
  ).toBeInTheDocument();
  const save = screen.getByRole("button", { name: "Tallenna koulu" });
  expect(save).toBeEnabled();
  expect(
    screen.getByText("Kyllä, tämä on oikea pysäkki kouluun.")
  ).toBeInTheDocument();
  fireEvent.click(save);

  // What is saved is the place's id and its public stops, never words.
  expect(onSavePlace).toHaveBeenCalledWith({
    id: "school",
    stops: [{ id: "32", name: "Puistokatu" }],
    primaryStopId: "32",
  });
});

test("shares and removes in Finnish, with the same link as in English", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  const english = renderSavedHome();
  fireEvent.click(screen.getByRole("button", { name: "Share this place" }));
  await screen.findByText("Link shared.");
  english.unmount();

  resetLanguageForTests("fi");
  renderSavedHome();
  fireEvent.click(screen.getByRole("button", { name: "Jaa tämä paikka" }));
  expect(await screen.findByText("Linkki jaettu.")).toBeInTheDocument();

  const [englishShare, finnishShare] = share.mock.calls.map(([data]) => data);
  expect(finnishShare.title).toBe("Koti · Omat paikat");
  expect(finnishShare.text).toBe("Lisää koti Omiin paikkoihin");
  expect(finnishShare.url).toBe(englishShare.url);

  // The button says "this place"; which place is read after it.
  expect(
    screen.getByRole("button", { name: "Jaa tämä paikka" })
  ).toHaveAccessibleDescription("Koti");
  expect(
    screen.getByRole("button", { name: "Poista tämä paikka" })
  ).toHaveAccessibleDescription("Koti");

  fireEvent.click(screen.getByRole("button", { name: "Poista tämä paikka" }));
  expect(confirm).toHaveBeenCalledWith("Poistetaanko paikka Koti Omista paikoista?");
});

test("rewords a message already on screen when the language changes", () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Use my location to set up Home" })
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This browser does not support location access."
  );

  act(() => resetLanguageForTests("fi"));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Tämä selain ei tue sijainnin käyttöä."
  );
  expect(
    screen.getByRole("heading", { name: "Omat paikat" })
  ).toBeInTheDocument();
});

// Near you said this in Finnish; My Places, with the same browser answer,
// said it in English.
test("a blocked location is explained in Finnish in the Finnish interface", async () => {
  resetLanguageForTests("fi");
  setGeolocation(vi.fn((success, failure) => failure({ code: 1 })));

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: /Käytä sijaintiani kodin asettamiseen/ })
  );

  expect(
    await screen.findByText(/^Sijainnin käyttö on estetty\./)
  ).toBeInTheDocument();
  expect(screen.queryByText(/Location access is blocked/)).not.toBeInTheDocument();
});

// A double tap on "Replace using where I am now" started two location
// lookups, and whichever answered last reopened the setup.
test("a double tap on replace starts one location lookup, and keeps focus", async () => {
  let deliverFix;
  const getCurrentPosition = vi.fn((success) => {
    deliverFix = () =>
      success({
        coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 18 },
      });
  });
  setGeolocation(getCurrentPosition);

  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={
        new Map([
          [
            "home",
            {
              id: "home",
              label: "Home",
              icon: "⌂",
              primaryStopId: "164",
              stops: [{ id: "164", name: "Kauppatori" }],
            },
          ],
        ])
      }
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByText("Manage Home"));
  const replace = screen.getByRole("button", {
    name: "Replace using where I am now",
  });
  replace.focus();
  fireEvent.click(replace);
  fireEvent.click(replace);

  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(replace).toHaveAttribute("aria-disabled", "true");
  expect(replace).not.toBeDisabled();
  expect(replace).toHaveFocus();

  await act(async () => deliverFix());

  expect(
    await screen.findByRole("heading", { name: "Choose stops for Home" })
  ).toBeInTheDocument();
  expect(replace).toHaveAttribute("aria-disabled", "false");
});

// A place without a stop read the id of its missing main stop and crashed,
// taking the rest of My Places, and the page, down with it.
test("a saved place with no stops is left out instead of crashing the page", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={
        new Map([
          ["home", { id: "home", label: "Home", icon: "⌂", primaryStopId: "", stops: [] }],
          [
            "work",
            {
              id: "work",
              label: "Work",
              icon: "▣",
              primaryStopId: "32",
              stops: [{ id: "32", name: "Puistokatu" }],
            },
          ],
        ])
      }
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  expect(screen.queryByRole("heading", { name: "Home" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Work" })).toBeInTheDocument();
});

// "Use Puistokatu for School" is on the card the setup replaces, and Cancel
// is on the setup the card comes back in place of. Both times focus fell to
// the top of the page.
test("the place setup takes focus as it opens and hands it back to its card", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="32"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  const useStop = screen.getByRole("button", { name: "Use Puistokatu for School" });
  useStop.focus();
  fireEvent.click(useStop);

  expect(
    screen.getByRole("heading", { name: "Choose stops for School" })
  ).toHaveFocus();

  const cancel = screen.getByRole("button", { name: "Cancel" });
  cancel.focus();
  fireEvent.click(cancel);

  const card = document.querySelector('[data-place="school"]');
  expect(card).not.toBeNull();
  expect(within(card).getAllByRole("button")[0]).toHaveFocus();
});

test("a replaced place's setup hands focus back to the button that opened it", async () => {
  setGeolocation((success) =>
    success({
      coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 18 },
    })
  );
  renderSavedHome();

  fireEvent.click(screen.getByText("Manage Home"));
  const replace = screen.getByRole("button", {
    name: "Replace using where I am now",
  });
  replace.focus();
  fireEvent.click(replace);

  const heading = await screen.findByRole("heading", {
    name: "Choose stops for Home",
  });
  await waitFor(() => expect(heading).toHaveFocus());

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(replace).toHaveFocus();
});

// Busy rather than disabled, so the button pressed keeps focus while the
// location is looked up.
test("Use my location keeps focus while it looks, and a second press does nothing", () => {
  const getCurrentPosition = vi.fn();
  setGeolocation(getCurrentPosition);
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );

  const locate = screen.getByRole("button", {
    name: "Use my location to set up Home",
  });
  locate.focus();
  fireEvent.click(locate);
  fireEvent.click(locate);

  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(locate).toHaveAttribute("aria-disabled", "true");
  expect(locate).not.toBeDisabled();
  expect(locate).toHaveFocus();
});

// Every radio was called "Main stop", so going through them a screen reader
// could not say which stop each would make the main one.
test("each main-stop choice is named for its stop", async () => {
  setGeolocation((success) =>
    success({
      coords: { latitude: 60.45182, longitude: 22.26662, accuracy: 18 },
    })
  );
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use my location to set up Home" })
  );
  await screen.findByRole("heading", { name: "Choose stops for Home" });

  const names = screen
    .getAllByRole("radio")
    .map((radio) => radio.labels[0].textContent);
  expect(names).toEqual([
    "Main stop: Kauppatori",
    "Main stop: Puistokatu",
    "Main stop: Turun linna",
  ]);
  expect(
    screen.getByRole("radio", { name: "Main stop: Puistokatu" })
  ).toBeInTheDocument();
});

// A stop chosen by hand has no distance, and its line ended "Stop 32 ·".
test("a stop chosen by hand is not followed by a dangling separator", () => {
  render(
    <MyPlaces
      stops={stops}
      coordinatesStatus="ready"
      activeStopId="32"
      placesById={new Map()}
      onSavePlace={vi.fn()}
      onRemovePlace={vi.fn()}
      onSetPrimaryStop={vi.fn()}
      onOpenStop={vi.fn()}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use Puistokatu for Home" })
  );

  expect(screen.getByText("Stop 32", { exact: true })).toBeInTheDocument();
});
