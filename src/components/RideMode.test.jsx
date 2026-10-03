import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import RideMode from "./RideMode";
import { resetLanguageForTests } from "../i18n";

// The instruction's urgent region is always in the panel, so an alert of
// another kind (the off-route question) is found by what it says.
function alertSaying(text) {
  return screen.getAllByRole("alert").find((node) => node.textContent.includes(text));
}

afterEach(() => {
  resetLanguageForTests("en");
});

function session(stage = "next") {
  return {
    id: "ride-1",
    lineRef: "1",
    tripRef: "trip-1",
    routeType: 3,
    destination: "Satama",
    stage,
    targetStop: { id: "32", name: "Puistokatu" },
    previousStop: { id: "164", name: "Kauppatori" },
    nextStop: { id: "4", name: "Turun linna" },
    boardingStop: { id: "164", name: "Kauppatori" },
    options: { locationBackup: true, notifications: true },
  };
}

test("shows the action the passenger needs instead of a map", () => {
  render(
    <RideMode
      session={{ ...session("next"), previousLeft: true }}
      runtime={{
        trackingHealth: "live",
        liveEtaSec: 70,
        scheduleEtaSec: 80,
        remainingStops: 1,
        targetMatchBy: "trip",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: 420,
        routeEtaSec: 55,
        distanceM: 300,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Your stop is next" })
  ).toBeInTheDocument();
  expect(screen.getByText("Press the STOP button now.")).toBeInTheDocument();
  expect(screen.getByText("Puistokatu")).toBeInTheDocument();
  expect(screen.getByText("after Kauppatori", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(/map/i)).not.toBeInTheDocument();
});

test("uses generic NEXT wording for non-bus modes", () => {
  render(
    <RideMode
      session={{ ...session("next"), routeType: 4 }}
      runtime={{
        trackingHealth: "live",
        liveEtaSec: 70,
        scheduleEtaSec: 80,
        remainingStops: 1,
        targetMatchBy: "trip",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: 480,
        routeEtaSec: 60,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText("Get ready to exit at the next stop.")
  ).toBeInTheDocument();
  expect(screen.queryByText("Press the STOP button now.")).not.toBeInTheDocument();
  expect(screen.getByText(/about 480 m to go/i)).toBeInTheDocument();
});

// The hook already decides which source is fresh enough to trust. If the
// panel re-derives that order it can show a confident estimate from a stale
// GPS fix while the badge next to it says tracking has degraded.
test("shows the estimate the hook resolved rather than re-deriving one", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{
        trackingHealth: "schedule",
        liveEtaSec: 70,
        scheduleEtaSec: 200,
        etaSec: 200,
        remainingStops: 2,
        targetMatchBy: "",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: 900,
        routeEtaSec: 55,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("~4 min")).toBeInTheDocument();
  expect(screen.queryByText("~1 min")).not.toBeInTheDocument();
});

// A distance reads as harder fact than an estimate, so a fix frozen by a
// tunnel is the number a passenger will trust over the alert badge.
test("stops presenting a stale fix as where the passenger is now", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{
        trackingHealth: "delayed",
        etaSec: 240,
        remainingStops: 2,
        gpsAgeSec: 300,
        targetMatchBy: "trip",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: 420,
        distanceM: 380,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Lost track of your location")).toBeInTheDocument();
  expect(screen.getByText("last seen 5 min ago")).toBeInTheDocument();
  expect(screen.queryByText(/about 420 m to go/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Following you along the route")).not.toBeInTheDocument();
});

test("says the stop is behind you instead of showing zero metres", () => {
  render(
    <RideMode
      session={session("missed")}
      runtime={{
        trackingHealth: "live",
        etaSec: -120,
        remainingStops: 0,
        gpsAgeSec: 4,
        targetMatchBy: "trip",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: -180,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("about 180 m past your stop")).toBeInTheDocument();
  expect(screen.queryByText("about 0 m to go")).not.toBeInTheDocument();
});

// The stage is the app's conclusion from every source it has. Tiles that
// keep counting past it leave "1 stop · ~2 min" beside a headline saying to
// get off, and the passenger cannot tell which half to believe.
test("stops counting down once it is telling the passenger to get off", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{
        trackingHealth: "live",
        // The timetable still believes the stop is two minutes out; the
        // vehicle is already standing at it.
        etaSec: 120,
        remainingStops: 1,
        targetMatchBy: "trip",
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  // The orange block says it; tiles beside it only repeated it, or worse.
  expect(screen.queryByLabelText("Ride progress")).not.toBeInTheDocument();
  expect(screen.queryByText("1 stop")).not.toBeInTheDocument();
  expect(screen.queryByText("~2 min")).not.toBeInTheDocument();
});

// At the one moment that matters the panel used to explain its own repeat
// behaviour instead of saying what to do with your body.
test("tells the passenger what to do at the moment of getting off", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  const instruction = screen.getByRole("alert");
  expect(instruction).toHaveTextContent("Move to the doors and step off here.");
  expect(instruction).not.toHaveTextContent(/alert repeats/i);
});

test("says the stop is behind you rather than counting stops to it", () => {
  render(
    <RideMode
      session={session("missed")}
      runtime={{ trackingHealth: "live", etaSec: 90, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("behind you")).toBeInTheDocument();
  expect(screen.queryByText("2 stops")).not.toBeInTheDocument();
  expect(screen.queryByText("~2 min")).not.toBeInTheDocument();
});

// Nothing in a web page can see a silent switch or a muted volume, so the
// only honest check on "you will hear me" is to ask.
test("asks whether the test alert was actually heard, and helps when it was not", () => {
  const onTestAlert = vi.fn();
  render(
    <RideMode
      session={session("boarded")}
      runtime={{ trackingHealth: "live", etaSec: 900, remainingStops: 5 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={onTestAlert}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Did you hear the test alert?")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "No" }));
  expect(screen.getByText(/Turn the media volume up/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Play it again" }));
  expect(onTestAlert).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "I can hear it now" }));
  expect(screen.queryByText(/Turn the media volume up/)).not.toBeInTheDocument();
});

test("resets sound confirmation when a new ride replaces the current session", () => {
  const props = {
    runtime: { trackingHealth: "live", etaSec: 900, remainingStops: 5 },
    gps: { status: "off", distanceM: null, error: "" },
    wakeLockState: "active",
    onTestAlert: () => {},
    onEndRide: () => {},
    onOpenStop: () => {},
  };

  const { rerender } = render(
    <RideMode session={session("boarded")} {...props} />
  );

  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  expect(screen.queryByText("Did you hear the test alert?")).not.toBeInTheDocument();

  rerender(
    <RideMode
      session={{ ...session("boarded"), id: "ride-2", tripRef: "trip-2" }}
      {...props}
    />
  );

  expect(screen.getByText("Did you hear the test alert?")).toBeInTheDocument();
});

// An iPhone has no vibration for a web page, and a notification needs both
// the passenger's choice and the browser's permission. The fallback promised
// both to everyone.
test("promises only the backup alerts this phone can give", () => {
  const renderSoundHelp = (options) => {
    const view = render(
      <RideMode
        session={{ ...session("boarded"), options }}
        runtime={{ trackingHealth: "live", etaSec: 600, remainingStops: 5 }}
        gps={{ status: "off", distanceM: null, error: "" }}
        wakeLockState="active"
        onTestAlert={() => {}}
        onEndRide={() => {}}
        onOpenStop={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    return view;
  };

  const withoutVibration = renderSoundHelp({ notifications: false });
  expect(
    screen.getByText(
      "Tracking is already running. Keep the sound on: this phone will not vibrate for these alerts."
    )
  ).toBeInTheDocument();
  withoutVibration.unmount();

  vi.stubGlobal("navigator", { ...globalThis.navigator, vibrate: () => true });
  vi.stubGlobal("Notification", { permission: "granted" });
  try {
    const withBoth = renderSoundHelp({ notifications: true });
    expect(
      screen.getByText(
        "Tracking is already running. Your phone will also vibrate and show a notification."
      )
    ).toBeInTheDocument();
    withBoth.unmount();

    renderSoundHelp({ notifications: false });
    expect(
      screen.getByText("Tracking is already running. Your phone will also vibrate.")
    ).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});


// A short hop reaches SOON within a stop or two, and that is exactly the
// ride where there is least time to discover a muted phone.
test("still offers the sound check on a short ride", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Did you hear the test alert?")).toBeInTheDocument();
});

test("does not interrupt the approach with a sound check", () => {
  render(
    <RideMode
      session={session("next")}
      runtime={{ trackingHealth: "live", etaSec: 70, remainingStops: 1 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.queryByText("Did you hear the test alert?")).not.toBeInTheDocument();
});

// A warning that only states a fact leaves the passenger with no move.
test("turns the wrong-bus warning into the two answers it is asking for", () => {
  const onEndRide = vi.fn();
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{ status: "off-route", distanceM: 900, offRouteSuspected: true, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={onEndRide}
      onOpenStop={() => {}}
    />
  );

  const warning = alertSaying("Check your bus");
  expect(warning).toHaveTextContent("Check your bus");
  expect(warning).toHaveTextContent("line 1");
  expect(warning).toHaveTextContent("Satama");

  fireEvent.click(screen.getByRole("button", { name: "Yes, keep tracking" }));
  expect(screen.queryByText("Check your bus")).not.toBeInTheDocument();
  expect(onEndRide).not.toHaveBeenCalled();
});

test("a test alert is preparation, so it is gone once it is time to leave", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.queryByRole("button", { name: "Test alert" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I'm getting off" })).toBeInTheDocument();
});

test("offers recovery at the next stop after a missed-stop signal", () => {
  const onEndRide = vi.fn();
  const onOpenStop = vi.fn();

  render(
    <RideMode
      session={session("missed")}
      runtime={{
        trackingHealth: "delayed",
        liveEtaSec: -90,
        scheduleEtaSec: -120,
        remainingStops: 0,
        targetMatchBy: "",
      }}
      gps={{ status: "error", distanceM: null, error: "" }}
      wakeLockState="inactive"
      onTestAlert={() => {}}
      onEndRide={onEndRide}
      onOpenStop={onOpenStop}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Open next stop" }));

  expect(onEndRide).toHaveBeenCalledTimes(1);
  expect(onOpenStop).toHaveBeenCalledWith("4");
});

function renderPanel(runtime, stage = "soon") {
  return render(
    <RideMode
      session={session(stage)}
      runtime={{
        trackingHealth: "schedule",
        remainingStops: 2,
        targetMatchBy: "",
        ...runtime,
      }}
      gps={{ status: "off", error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );
}

// Asked for at Start and not allowed: the passenger waited for a
// notification that would not come, with nothing on screen to say so.
test("says when notifications were not allowed, and how to allow them", () => {
  const blocked =
    "Notifications are blocked. Allow them for this site in your browser settings.";

  const notAllowed = renderPanel({ notificationPermission: "unavailable" });
  expect(screen.getByText(blocked)).toBeInTheDocument();
  notAllowed.unmount();

  const granted = renderPanel({ notificationPermission: "granted" });
  expect(screen.queryByText(blocked)).not.toBeInTheDocument();
  granted.unmount();

  // Allowed in the browser's settings mid-ride: the next alert notifies.
  vi.stubGlobal("Notification", { permission: "granted" });
  try {
    const allowedLater = renderPanel({ notificationPermission: "unavailable" });
    expect(screen.queryByText(blocked)).not.toBeInTheDocument();
    allowedLater.unmount();
  } finally {
    vi.unstubAllGlobals();
  }

  // Not asked for: nothing to report.
  const notAsked = renderPanel({ notificationPermission: "unknown" });
  expect(screen.queryByText(blocked)).not.toBeInTheDocument();
  notAsked.unmount();

  // A ride restored after a reload starts with no recorded answer and is
  // never asked again: a site the browser has blocked still says so.
  vi.stubGlobal("Notification", { permission: "denied" });
  try {
    const restored = renderPanel({ notificationPermission: "unknown" });
    expect(screen.getByText(blocked)).toBeInTheDocument();
    restored.unmount();

    const declined = render(
      <RideMode
        session={{
          ...session("soon"),
          options: { locationBackup: true, notifications: false },
        }}
        runtime={{ trackingHealth: "schedule", remainingStops: 2 }}
        gps={{ status: "off", error: "" }}
        wakeLockState="active"
        onTestAlert={() => {}}
        onEndRide={() => {}}
        onOpenStop={() => {}}
      />
    );
    expect(screen.queryByText(blocked)).not.toBeInTheDocument();
    declined.unmount();
  } finally {
    vi.unstubAllGlobals();
  }

  // "Get off now" keeps the screen to itself.
  renderPanel({ notificationPermission: "unavailable" }, "now");
  expect(screen.queryByText(blocked)).not.toBeInTheDocument();
});

test("never calls the bus confirmed once live tracking has been lost", () => {
  // The last match survives failed polls. Beside "Going by the timetable"
  // and the degraded banner, "Your bus is confirmed" said the opposite.
  renderPanel({ trackingHealth: "schedule", targetMatchBy: "dated-journey" });

  expect(screen.getByText("Going by the timetable")).toBeInTheDocument();
  expect(screen.getByText("Looking for your bus")).toBeInTheDocument();
  expect(screen.queryByText("Your bus is confirmed")).not.toBeInTheDocument();
});

test("agrees with its own badge when the bus is seen at the stop before", () => {
  // Live at the stop before, not yet listed at the exit stop: the badge said
  // "Following your bus" while the row beneath it said "Looking for it".
  renderPanel({
    trackingHealth: "live",
    previousSeen: true,
    targetLive: false,
  });

  expect(screen.getByText("Following your bus")).toBeInTheDocument();
  expect(screen.getByText("Your bus is confirmed")).toBeInTheDocument();
  expect(screen.getByText("on its way to Kauppatori")).toBeInTheDocument();
  expect(screen.queryByText("Looking for your bus")).not.toBeInTheDocument();
});

test("says the live data is catching up, not that the bus is late", () => {
  renderPanel({ trackingHealth: "delayed" });

  expect(screen.getByText("Live tracking is catching up")).toBeInTheDocument();
  expect(screen.queryByText(/lagging/i)).not.toBeInTheDocument();
});

// The timetable's count of stops left runs on the timetable's own clock, so
// it cannot say the bus is late: with the stop before sharing the exit stop's
// minute, it read "running late" on time and "about now" two minutes late.
test("going by the timetable, its own time coming is about now, not late", () => {
  renderPanel({ etaSec: 10, etaSource: "schedule", remainingStops: 2 });

  expect(screen.getByText("about now")).toBeInTheDocument();
  expect(screen.queryByText("running late")).not.toBeInTheDocument();
});

test("going by the timetable, a time well past with the stop still ahead is running late", () => {
  renderPanel({ etaSec: -120, etaSource: "schedule", remainingStops: 0 });

  expect(screen.getByText("running late")).toBeInTheDocument();
  expect(screen.queryByText("about now")).not.toBeInTheDocument();
});

test("a live estimate that is overdue is still about now, not late", () => {
  renderPanel({
    trackingHealth: "live",
    targetLive: true,
    etaSec: -120,
    etaSource: "live",
    remainingStops: 0,
  });

  expect(screen.getByText("about now")).toBeInTheDocument();
  expect(screen.queryByText("running late")).not.toBeInTheDocument();
});

test("trusts a live estimate of about now even when the timetable counts more stops", () => {
  renderPanel({
    trackingHealth: "live",
    targetLive: true,
    etaSec: 20,
    etaSource: "live",
    remainingStops: 2,
  });

  expect(screen.getByText("about now")).toBeInTheDocument();
  expect(screen.getByText("Your bus is confirmed")).toBeInTheDocument();
});

function panelAt(stage) {
  return (
    <RideMode
      session={session(stage)}
      runtime={{ trackingHealth: "live", targetLive: true, remainingStops: 1 }}
      gps={{ status: "off", error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );
}

test("promises nothing about a map at the start of the ride", () => {
  render(panelAt("boarded"));

  expect(screen.queryByText(/map/i)).not.toBeInTheDocument();
});

test("offers a single way out once it is time to get off", () => {
  // "I'm getting off" and "End ride" did exactly the same thing, side by
  // side, at the one moment there is no time to work out the difference.
  render(panelAt("now"));

  expect(
    screen.getByRole("button", { name: "I'm getting off" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Turn off alert" })
  ).not.toBeInTheDocument();
});

test("brings itself back into view when the stop is next", () => {
  // On a phone the panel scrolls with the page, so a passenger reading the
  // board below it would otherwise miss the one screen that matters.
  const scrollIntoView = vi.fn();
  const originalScroll = globalThis.HTMLElement.prototype.scrollIntoView;
  const originalRect = globalThis.HTMLElement.prototype.getBoundingClientRect;
  globalThis.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  globalThis.HTMLElement.prototype.getBoundingClientRect = () => ({
    top: -500,
    bottom: -20,
    left: 0,
    right: 360,
    width: 360,
    height: 480,
  });

  try {
    const { rerender } = render(panelAt("boarded"));
    rerender(panelAt("soon"));
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(panelAt("next"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(panelAt("now"));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  } finally {
    globalThis.HTMLElement.prototype.scrollIntoView = originalScroll;
    globalThis.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

// The words that get a passenger off the bus are the ones that must be in
// their language. The stop's own name stays as the pole and the bus say it.
test("tells a Finnish reader to get off now, in Finnish", () => {
  resetLanguageForTests("fi");
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByRole("heading", { name: "Jää pois nyt" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Siirry ovelle ja jää pois."
  );
  expect(screen.getByRole("button", { name: "Jään pois" })).toBeInTheDocument();
  expect(screen.getByText("Puistokatu")).toBeInTheDocument();
});

test("asks a Finnish bus passenger to press STOP without inflecting a stop name", () => {
  resetLanguageForTests("fi");
  render(
    <RideMode
      session={{ ...session("next"), previousLeft: true }}
      runtime={{
        trackingHealth: "live",
        targetLive: true,
        etaSec: 200,
        remainingStops: 2,
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Pysäkkisi on seuraavana" })
  ).toBeInTheDocument();
  expect(screen.getByText("Paina STOP-nappia nyt.")).toBeInTheDocument();
  // "pysäkin Kauppatori jälkeen", never "Kauppatorin jälkeen".
  expect(
    screen.getByText("Pysäkki 32 · pysäkin Kauppatori jälkeen")
  ).toBeInTheDocument();
  expect(screen.getByText("2 pysäkkiä")).toBeInTheDocument();
  expect(screen.getByText("~4 min")).toBeInTheDocument();
  expect(screen.getByText("Bussi löytyi")).toBeInTheDocument();
  expect(screen.getByLabelText("Matkan eteneminen")).toBeInTheDocument();
});

test("counts one stop left in the Finnish singular", () => {
  resetLanguageForTests("fi");
  render(panelAt("soon"));

  expect(screen.getByText("1 pysäkki")).toBeInTheDocument();
});

test("follows a language switch in the middle of a ride", () => {
  render(panelAt("soon"));
  expect(
    screen.getByRole("heading", { name: "Your stop is coming up" })
  ).toBeInTheDocument();

  act(() => resetLanguageForTests("fi"));

  expect(
    screen.getByRole("heading", { name: "Pysäkkisi lähestyy" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Hälytysäänen tarkistus" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lopeta hälytys" })).toBeInTheDocument();
});

test("gives a location problem in Finnish, and the destination as its sign says it", () => {
  resetLanguageForTests("fi");
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{
        status: "error",
        offRouteSuspected: true,
        error: "Location wasn’t allowed.",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Sijainnin käyttöä ei sallittu. Hälytys toimii ilman sijaintiasi."
    )
  ).toBeInTheDocument();
  expect(alertSaying("Oletko yhä tässä bussissa?")).toHaveTextContent(
    "Et ole kahteen minuuttiin liikkunut linjan 1 reittiä suuntaan Satama. Oletko yhä tässä bussissa?"
  );
  expect(
    screen.getByRole("button", { name: "Kyllä, jatka seurantaa" })
  ).toBeInTheDocument();
});

// Going by the timetable, "~18 min" looked like any live estimate.
test("marks a time that comes from the timetable", () => {
  const { rerender } = render(
    <RideMode
      session={session("boarded")}
      runtime={{
        trackingHealth: "live",
        previousSeen: true,
        etaSec: 1080,
        etaSource: "schedule",
        remainingStops: 4,
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("By timetable")).toBeInTheDocument();
  expect(screen.getByText("~18 min")).toBeInTheDocument();
  // Beside "Following your bus", not "until Föli's live data shows your bus".
  expect(
    screen.getByText(/Your bus is live, but Föli has no time for .+ yet, so this time is from the timetable/)
  ).toBeInTheDocument();

  rerender(
    <RideMode
      session={session("boarded")}
      runtime={{
        trackingHealth: "delayed",
        etaSec: 1080,
        etaSource: "schedule",
        remainingStops: 4,
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );
  expect(screen.getByText(/from the timetable until Föli’s live data shows your bus/)).toBeInTheDocument();
});

test("gets a bus passenger ready without sending them to the doors early", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 600, etaSource: "live", remainingStops: 3 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText("Get your things together. We will tell you when to press STOP.")
  ).toBeInTheDocument();
  expect(screen.getByText("Estimate")).toBeInTheDocument();
  expect(screen.queryByText(/toward the doors/)).not.toBeInTheDocument();
});

// STOP asks for the next stop. Said before the bus has left the stop before
// the exit, "Press STOP now" stopped it there, and the request was spent.
test("names the stop before the exit until the bus has left it", () => {
  render(
    <RideMode
      session={session("next")}
      runtime={{ trackingHealth: "live", etaSec: 70, remainingStops: 1 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Get ready to press STOP" })
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Press STOP when the bus leaves Kauppatori."
  );
  expect(screen.queryByText("Press the STOP button now.")).not.toBeInTheDocument();
  // Named once, where it matters: not again under the stop's name.
  expect(screen.getAllByText(/Kauppatori/)).toHaveLength(1);
});

test("names the stop before the exit in Finnish without inflecting it", () => {
  resetLanguageForTests("fi");
  render(
    <RideMode
      session={session("next")}
      runtime={{ trackingHealth: "live", etaSec: 70, remainingStops: 1 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Valmistaudu painamaan STOP-nappia" })
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Paina STOP-nappia, kun bussi lähtee pysäkiltä Kauppatori."
  );
});

test("keeps the plain wording on a waterbus, where there is no STOP to press early", () => {
  render(
    <RideMode
      session={{ ...session("next"), routeType: 4 }}
      runtime={{ trackingHealth: "live", etaSec: 70, remainingStops: 1 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByRole("heading", { name: "Your stop is next" })).toBeInTheDocument();
  expect(screen.getByText("Get ready to exit at the next stop.")).toBeInTheDocument();
});

// Kept awake in a pocket, the screen took one stray touch as "End ride" and
// the alert the passenger counted on was gone.
test("ends a ride only on a second tap, and forgets the first after a moment", () => {
  vi.useFakeTimers();
  try {
    const onEndRide = vi.fn();
    render(
      <RideMode
        session={session("boarded")}
        runtime={{ trackingHealth: "live", etaSec: 600, remainingStops: 5 }}
        gps={{ status: "off", distanceM: null, error: "" }}
        wakeLockState="active"
        onTestAlert={() => {}}
        onEndRide={onEndRide}
        onOpenStop={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Turn off alert" }));
    expect(onEndRide).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Tap again to turn it off" })
    ).toBeInTheDocument();

    act(() => {
      // Ten seconds: time for a screen reader to say "Tap again" first.
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("button", { name: "Turn off alert" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn off alert" }));
    fireEvent.click(screen.getByRole("button", { name: "Tap again to turn it off" }));
    expect(onEndRide).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

// "Remaining: tracking" answered nothing on every ride started at the stop.
test("shows a dash, never a word, when there is no count of stops", () => {
  render(
    <RideMode
      session={session("boarded")}
      runtime={{ trackingHealth: "schedule", etaSec: null, remainingStops: null }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  const tile = screen.getByText("Remaining").parentElement;
  expect(tile).toHaveTextContent("Remaining—");
});

// On a screen kept awake in a pocket, "Check your bus" took one stray touch
// as the end of the ride.
test("the off-route question also asks for a second tap to turn off the alert", () => {
  const onEndRide = vi.fn();
  render(
    <RideMode
      session={session("boarded")}
      runtime={{ trackingHealth: "live", etaSec: 600, remainingStops: 4 }}
      gps={{ status: "off-route", distanceM: 400, error: "", offRouteSuspected: true }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={onEndRide}
      onOpenStop={() => {}}
    />
  );

  const question = alertSaying("Are you still on this bus?");
  fireEvent.click(within(question).getByRole("button", { name: "Turn off alert" }));
  expect(onEndRide).not.toHaveBeenCalled();
  fireEvent.click(within(question).getByRole("button", { name: "Tap again to turn it off" }));
  expect(onEndRide).toHaveBeenCalledTimes(1);
});

// One node that turned from status into alert as the stop came up was, to
// some screen readers, a new region with nothing new in it. Both regions
// are there from the start; the words move from the polite one to the
// urgent one.
test("the instruction moves between two lasting live regions as the stop nears", () => {
  const panel = (stage) => (
    <RideMode
      session={{ ...session(stage), previousLeft: true }}
      runtime={{ trackingHealth: "live", etaSec: 200, remainingStops: 3 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );
  const { rerender } = render(panel("boarded"));
  // The instruction's region comes first; after it sits the one that says
  // "Tap again to turn it off" while turning off waits for a second tap.
  const polite = screen.getAllByRole("status")[0];
  const urgent = alertSaying("");
  expect(polite).toHaveTextContent("We will warn you as your stop gets closer.");
  expect(urgent).toBeEmptyDOMElement();

  rerender(panel("now"));

  expect(screen.getAllByRole("status")).toContain(polite);
  expect(polite).toBeEmptyDOMElement();
  expect(alertSaying("Move to the doors and step off here.")).toBe(urgent);
});

// "~2 min" was read "tilde 2 min", and the label on the plain div around
// the numbers was not read at all.
test("the estimate is read as about so many minutes, in a named group", () => {
  const panel = (
    <RideMode
      session={session("boarded")}
      runtime={{ trackingHealth: "live", etaSec: 200, remainingStops: 3 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );
  const { rerender } = render(panel);

  const progress = screen.getByRole("group", { name: "Ride progress" });
  expect(within(progress).getByText("~4 min")).toHaveAttribute("aria-hidden", "true");
  expect(within(progress).getByText("about 4 min")).toBeInTheDocument();

  resetLanguageForTests("fi");
  rerender(panel);
  expect(screen.getByText("noin 4 min")).toBeInTheDocument();
});


function transferJourney(overrides = {}) {
  return {
    id: "transfer-journey",
    phase: "waiting",
    transferLeg: 1,
    transferPlan: {
      transfer: {
        alightStopId: "32",
        boardStopId: "501",
        boardStopName: "Kauppatori D4",
        walkingDistanceM: 90,
      },
      second: {
        tripRef: "trip-2",
        lineRef: "7",
      },
    },
    ...overrides,
  };
}

test("shows the next committed transfer while leg 1 is still in progress", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney()}
      transferRevalidation={{
        providerState: "live",
        decision: "good",
        feasibility: { slackSec: 310 },
      }}
    />
  );

  const status = screen.getByText("Next after this bus").closest("[role='status']");
  expect(status).toHaveTextContent("Change at Puistokatu to line 7.");
  expect(status).toHaveTextContent("Live transfer margin: about 5 min.");
});

test("keeps Get off now primary and gives a compact cross-platform next action", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney()}
      transferRevalidation={{
        providerState: "live",
        decision: "good",
        feasibility: { slackSec: 240 },
      }}
    />
  );

  expect(screen.getByRole("heading", { name: "Get off now" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Move to the doors and step off here."
  );
  expect(
    screen.getByText("Walk ≈90 m to Kauppatori D4 for line 7.")
  ).toBeInTheDocument();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

test("same-stop transfer tells the passenger to wait here after getting off", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney({
        transferPlan: {
          transfer: {
            alightStopId: "32",
            boardStopId: "32",
            boardStopName: "Puistokatu",
            walkingDistanceM: 0,
          },
          second: {
            tripRef: "trip-2",
            lineRef: "7",
          },
        },
      })}
      transferRevalidation={{ providerState: "live", decision: "good" }}
    />
  );

  expect(screen.getByText("Wait here for line 7.")).toBeInTheDocument();
});

test("failed committed connection never promises the old second line", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney({ phase: "recovery" })}
      transferRevalidation={{
        providerState: "cancelled",
        decision: "cancelled",
      }}
    />
  );

  expect(
    screen.getByText(
      "Journey Assistant will check fresh options from this transfer area."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/line 7/i)).not.toBeInTheDocument();
});

test("sub-minute live transfer margin is never rounded up", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 180, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney()}
      transferRevalidation={{
        providerState: "live",
        decision: "tight",
        feasibility: { slackSec: 40 },
      }}
    />
  );

  expect(
    screen.getByText("Live transfer margin: less than 1 min.")
  ).toBeInTheDocument();
});


test("missing cross-platform stop identity fails closed instead of inventing directions", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney({
        transferPlan: {
          transfer: {
            alightStopId: "32",
            boardStopId: "",
            boardStopName: "",
            walkingDistanceM: 90,
          },
          second: {
            tripRef: "trip-2",
            lineRef: "7",
            boardStopId: "",
          },
        },
      })}
      transferRevalidation={{ providerState: "live", decision: "good" }}
    />
  );

  expect(
    screen.getByText(
      "Journey Assistant will check fresh options from this transfer area."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Walk ≈/i)).not.toBeInTheDocument();
});


test("shows committed transfer next-action guidance in Finnish", () => {
  resetLanguageForTests("fi");
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney()}
      transferRevalidation={{
        providerState: "live",
        decision: "good",
        feasibility: { slackSec: 310 },
      }}
    />
  );

  expect(
    screen.getByText("Seuraavaksi tämän bussin jälkeen")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Vaihda pysäkillä Puistokatu linjalle 7.")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Reaaliaikaista vaihtoaikaa: noin 5 min.")
  ).toBeInTheDocument();
});

test("missing cross-platform identity fails closed before the transfer stop too", () => {
  render(
    <RideMode
      session={session("soon")}
      runtime={{ trackingHealth: "live", etaSec: 240, remainingStops: 2 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney({
        transferPlan: {
          transfer: {
            alightStopId: "32",
            boardStopId: "",
            boardStopName: "",
            walkingDistanceM: 90,
          },
          second: {
            tripRef: "trip-2",
            lineRef: "7",
            boardStopId: "",
          },
        },
      })}
      transferRevalidation={{ providerState: "live", decision: "good" }}
    />
  );

  expect(screen.getByText("Connection needs a new plan")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Get off at Puistokatu; Journey Assistant will check fresh options there."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Change at .* line 7/i)).not.toBeInTheDocument();
});


test("unknown cross-platform walking distance names the concrete stop without inventing metres", () => {
  render(
    <RideMode
      session={session("now")}
      runtime={{ trackingHealth: "live", etaSec: 0, remainingStops: 0 }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
      transferJourney={transferJourney({
        transferPlan: {
          transfer: {
            alightStopId: "32",
            boardStopId: "501",
            boardStopName: "Kauppatori D4",
            walkingDistanceM: null,
          },
          second: {
            tripRef: "trip-2",
            lineRef: "7",
            boardStopId: "501",
          },
        },
      })}
      transferRevalidation={{ providerState: "live", decision: "good" }}
    />
  );

  expect(
    screen.getByText("Go to Kauppatori D4 for line 7.")
  ).toBeInTheDocument();
  expect(screen.queryByText(/Walk ≈/i)).not.toBeInTheDocument();
});

test("renders the safety-critical NEXT state in Ukrainian without weakening provider labels", () => {
  resetLanguageForTests("uk");

  render(
    <RideMode
      session={{ ...session("next"), previousLeft: true }}
      runtime={{
        trackingHealth: "live",
        etaSec: 70,
        remainingStops: 1,
        targetMatchBy: "trip",
      }}
      gps={{
        status: "active",
        shapeUsable: true,
        onRoute: true,
        routeDistanceM: 420,
        distanceM: 300,
        error: "",
      }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(document.documentElement.lang).toBe("uk");
  expect(
    screen.getByRole("heading", { name: "Ваша зупинка наступна" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("Натисніть кнопку STOP зараз.")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Стежимо за вашим автобусом")
  ).toBeInTheDocument();
  expect(screen.queryByText("Press the STOP button now.")).not.toBeInTheDocument();

  const providerStop = screen.getAllByText("Puistokatu")[0];
  expect(providerStop).toHaveAttribute("lang", "fi");
});

test("keeps the Ukrainian NOW state authoritative and removes contradictory countdown copy", () => {
  resetLanguageForTests("uk");

  render(
    <RideMode
      session={session("now")}
      runtime={{
        trackingHealth: "live",
        etaSec: 120,
        remainingStops: 1,
        targetMatchBy: "trip",
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Виходьте зараз" })
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Підійдіть до дверей і виходьте тут."
  );
  expect(screen.queryByLabelText("Хід поїздки")).not.toBeInTheDocument();
  expect(screen.queryByText("1 зупинка")).not.toBeInTheDocument();
  expect(screen.queryByText("~2 хв")).not.toBeInTheDocument();
});

test("renders the safety-critical NEXT state in Swedish without strengthening uncertainty", () => {
  resetLanguageForTests("sv");

  render(
    <RideMode
      session={{ ...session("next"), previousLeft: true }}
      runtime={{
        trackingHealth: "schedule",
        etaSec: 70,
        remainingStops: 1,
        targetMatchBy: "",
      }}
      gps={{ status: "off", distanceM: null, error: "" }}
      wakeLockState="active"
      onTestAlert={() => {}}
      onEndRide={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(document.documentElement.lang).toBe("sv");
  expect(
    screen.getByRole("heading", { name: "Din hållplats är nästa" })
  ).toBeInTheDocument();
  expect(screen.getByText("Tryck på STOP-knappen nu.")).toBeInTheDocument();
  expect(screen.getByText("Följer tidtabellen")).toBeInTheDocument();
  expect(
    screen.getByText(
      /vi säger inte ”stig av nu” enbart utifrån tidtabellen/i
    )
  ).toBeInTheDocument();
  expect(screen.queryByText("Stig av nu")).not.toBeInTheDocument();

  const providerStop = screen.getAllByText("Puistokatu")[0];
  expect(providerStop).toHaveAttribute("lang", "fi");
});
