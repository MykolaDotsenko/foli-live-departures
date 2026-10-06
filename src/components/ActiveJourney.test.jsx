import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";
import ActiveJourney from "./ActiveJourney";

function journey(overrides = {}) {
  return {
    id: "journey-1",
    destinationId: "stop:900",
    destinationLabel: "Home stop",
    optionLabel: "fastest",
    stopId: "100",
    stopName: "Kauppatori D2",
    distanceMeters: 240,
    tripRef: "trip-1",
    lineRef: "18",
    destinationStopId: "900",
    departureAt: 2_000_000_000,
    aimedDepartureAt: 1_999_999_980,
    destinationArrivalAt: 2_000_001_200,
    liveState: "live",
    phase: "walking-to-stop",
    recoveryReason: null,
    selectedAt: 1_900_000_000_000,
    atStopConfirmedAt: null,
    lastSeenAt: 1_900_000_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  resetLanguageForTests("en");
});

afterEach(() => {
  resetLanguageForTests("en");
  vi.restoreAllMocks();
});

test("walking state asks for explicit at-stop confirmation", () => {
  const onConfirmAtStop = vi.fn();
  const onChooseAnother = vi.fn();

  render(
    <ActiveJourney
      journey={journey()}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={onConfirmAtStop}
      onShowDeparture={() => {}}
      onChooseAnother={onChooseAnother}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Walk to Kauppatori D2" })
  ).toBeInTheDocument();
  // It names the button that confirms arrival instead of explaining that
  // the app will not assume it.
  expect(
    screen.getByText("When you get to the stop, tap “I'm at the stop”.")
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "I'm at the stop" }));
  expect(onConfirmAtStop).toHaveBeenCalledTimes(1);

  expect(screen.getByRole("link", { name: "Walk there" })).toHaveAttribute(
    "href",
    expect.stringContaining("travelmode=walking")
  );
});

// Chosen beside the stop, "Walk to Kauppatori" and a walking route read as
// if the passenger were somewhere else. Arrival is still theirs to confirm.
test("a passenger already beside the stop is not told to walk there", () => {
  const onConfirmAtStop = vi.fn();

  render(
    <ActiveJourney
      journey={journey({ distanceMeters: 8, nearStopAtSelection: true })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={onConfirmAtStop}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "You’re near Kauppatori D2" })
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Walk there" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "I'm at the stop" }));
  expect(onConfirmAtStop).toHaveBeenCalledTimes(1);
});

// A short distance alone is no evidence: from a coarse fix the passenger
// may be anywhere near.
test("a short distance without an accurate fix still says to walk there", () => {
  render(
    <ActiveJourney
      journey={journey({ distanceMeters: 8 })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Walk to Kauppatori D2" })
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Walk there" })).toBeInTheDocument();
});

test("a selected-origin journey with no physical distance omits invented zero metres", () => {
  render(
    <ActiveJourney
      journey={journey({ distanceMeters: 0, nearStopAtSelection: false })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Walk to Kauppatori D2" })
  ).toBeInTheDocument();
  expect(screen.queryByText(/About 0 m to the boarding stop/i)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Walk there" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I'm at the stop" })).toBeInTheDocument();
});

test("an unknown distance to the stop still says to walk there", () => {
  render(
    <ActiveJourney
      journey={journey({ distanceMeters: null })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Walk to Kauppatori D2" })
  ).toBeInTheDocument();
});

// "Leaves 5 min", and a minute before the bus "Leaves Due", put a board cell
// into a sentence.
test("says when the bus leaves in a sentence", () => {
  const now = 1_900_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  const props = {
    stop: { id: "100", lat: 60.4518, lon: 22.2666 },
    online: true,
    onConfirmAtStop: () => {},
    onShowDeparture: () => {},
    onChooseAnother: () => {},
    onOpenStop: () => {},
  };

  const { rerender } = render(
    <ActiveJourney
      {...props}
      journey={journey({ departureAt: now / 1000 + 5 * 60 })}
    />
  );
  expect(screen.getByText("Leaves in 5 min")).toBeInTheDocument();

  rerender(
    <ActiveJourney {...props} journey={journey({ departureAt: now / 1000 + 30 })} />
  );
  expect(screen.getByText("Leaves now")).toBeInTheDocument();
  expect(screen.queryByText(/Due/)).not.toBeInTheDocument();
});

test("waiting state points to the pinned selected departure", () => {
  const onShowDeparture = vi.fn();

  render(
    <ActiveJourney
      journey={journey({
        phase: "waiting",
        atStopConfirmedAt: 1_900_000_010_000,
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={onShowDeparture}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Wait for line 18" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("Your selected bus is pinned first in the departure board.")
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Show selected departure" })
  );
  expect(onShowDeparture).toHaveBeenCalledTimes(1);
});

test("recovery clearly explains cancellation and preserves explicit choice", () => {
  const onChooseAnother = vi.fn();
  const onOpenStop = vi.fn();

  render(
    <ActiveJourney
      journey={journey({
        phase: "recovery",
        recoveryReason: "cancelled",
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={onChooseAnother}
      onOpenStop={onOpenStop}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Choose another route" })
  ).toBeInTheDocument();
  expect(screen.getByText("Your selected bus was cancelled.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Find another option" }));
  expect(onChooseAnother).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "View selected stop" }));
  expect(onOpenStop).toHaveBeenCalledTimes(1);
});

test("offline state does not pretend the selected plan is current", () => {
  render(
    <ActiveJourney
      journey={journey()}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online={false}
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText("Offline: this selected plan may be out of date.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Walk there" })).not.toBeInTheDocument();
});


test("paused monitoring makes returning to the selected stop the primary action", () => {
  const onOpenStop = vi.fn();
  const onConfirmAtStop = vi.fn();

  render(
    <ActiveJourney
      journey={journey()}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      monitoringState="paused"
      onConfirmAtStop={onConfirmAtStop}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={onOpenStop}
    />
  );

  expect(
    screen.getByText("Your bus isn’t updated while another stop is open.")
  ).toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "I'm at the stop" })
  ).not.toBeInTheDocument();

  // The button names the stop it returns to.
  fireEvent.click(
    screen.getByRole("button", { name: "Back to Kauppatori D2" })
  );
  expect(onOpenStop).toHaveBeenCalledTimes(1);
  expect(onConfirmAtStop).not.toHaveBeenCalled();
});

test("degraded monitoring never implies the live departure is current", () => {
  render(
    <ActiveJourney
      journey={journey({ phase: "waiting", atStopConfirmedAt: 1_900_000_010_000 })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      monitoringState="degraded"
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Can’t update your bus right now. Its time may be out of date."
    )
  ).toBeInTheDocument();
});


test("shows door arrival instead of alighting-stop arrival for an external place", () => {
  render(
    <ActiveJourney
      journey={journey({
        destinationKind: "external-place",
        destinationLabel: "Prisma Itäharju",
        destinationArrivalAt: 2_000_001_200,
        journeyArrivalAt: 2_000_001_500,
        finalWalkDistanceM: 240,
        finalWalkSecEstimate: 250,
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText(/Reach destination about/i)).toBeInTheDocument();
  expect(screen.getByText(/final walk ≈ 240 m/i)).toBeInTheDocument();
  expect(
    screen.getByText(/real walking route can be longer/i)
  ).toBeInTheDocument();
});


test("renders transfer leg 1 handoff and does not use the direct-journey Ride Mode copy", () => {
  render(
    <ActiveJourney
      journey={journey({
        phase: "waiting",
        transferLeg: 1,
        transferPlan: {
          transfer: {
            boardStopId: "501",
            boardStopName: "Kauppatori platform B",
          },
          second: { lineRef: "7" },
        },
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText("Leg 1 of 2 · change at Kauppatori platform B to line 7")
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Journey Assistant resumes with leg 2/i)
  ).toBeInTheDocument();
});

test("renders transfer leg 2 and both transfer recovery reasons truthfully", () => {
  const common = {
    stop: { id: "501", lat: 60.4518, lon: 22.2666 },
    online: true,
    onConfirmAtStop: () => {},
    onShowDeparture: () => {},
    onChooseAnother: () => {},
    onOpenStop: () => {},
  };

  const { rerender } = render(
    <ActiveJourney
      {...common}
      journey={journey({
        transferLeg: 2,
        lineRef: "7",
        transferPlan: {
          transfer: { boardStopId: "501" },
          second: { lineRef: "7" },
        },
      })}
    />
  );
  expect(
    screen.getByText("Leg 2 of 2 · continue on line 7")
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      {...common}
      journey={journey({
        phase: "recovery",
        recoveryReason: "transfer-missed",
        transferLeg: 2,
        lineRef: "7",
        transferPlan: {
          transfer: { boardStopId: "501" },
          second: { lineRef: "7" },
        },
      })}
    />
  );
  expect(
    screen.getByText("The second bus has probably been missed. Choose a fresh option.")
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      {...common}
      journey={journey({
        phase: "recovery",
        recoveryReason: "transfer-risk",
        transferLeg: 1,
        transferPlan: {
          transfer: { boardStopId: "501" },
          second: {},
        },
      })}
    />
  );
  expect(
    screen.getByText(
      "The selected transfer can no longer be continued safely. Choose a fresh option."
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText("Leg 1 of 2 · change at 501 to line —")
  ).toBeInTheDocument();
});

test("returns nothing without an active journey", () => {
  const { container } = render(
    <ActiveJourney
      journey={null}
      stop={null}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );
  expect(container).toBeEmptyDOMElement();
});


test("explains a cancelled second transfer leg explicitly", () => {
  render(
    <ActiveJourney
      journey={journey({
        optionLabel: "transfer",
        transferLeg: 1,
        transferPlan: {
          transfer: {
            boardStopId: "500",
            boardStopName: "Kauppatori platform B",
          },
          second: { lineRef: "7" },
        },
        phase: "recovery",
        recoveryReason: "transfer-cancelled",
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText("Your second bus was cancelled. Choose a fresh option.")
  ).toBeInTheDocument();
});


test("shows live second-leg transfer evidence without changing the selected route", () => {
  const common = {
    optionLabel: "transfer",
    transferLeg: 1,
    transferPlan: {
      transfer: {
        boardStopId: "501",
        boardStopName: "Kauppatori platform B",
      },
      second: { lineRef: "7" },
    },
    phase: "waiting",
    atStopConfirmedAt: 1_900_000_010_000,
  };

  const { rerender } = render(
    <ActiveJourney
      journey={journey({
        ...common,
        transferRevalidation: {
          providerState: "live",
          decision: "good",
          feasibility: { slackSec: 310 },
        },
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Live check: line 7 still looks catchable · about 5 min transfer margin."
    )
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      journey={journey({
        ...common,
        transferRevalidation: {
          providerState: "live",
          decision: "tight",
          feasibility: { slackSec: 95 },
        },
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Live check: the transfer to line 7 is tight · about 1 min margin."
    )
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      journey={journey({
        ...common,
        transferRevalidation: {
          providerState: "stale",
          decision: "unknown",
          feasibility: null,
        },
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Live check for line 7 is uncertain. Keeping the selected connection until stronger evidence."
    )
  ).toBeInTheDocument();
});


test("does not round a sub-minute tight transfer margin up to one minute", () => {
  render(
    <ActiveJourney
      journey={journey({
        optionLabel: "transfer",
        transferLeg: 1,
        transferPlan: {
          transfer: {
            boardStopId: "501",
            boardStopName: "Kauppatori platform B",
          },
          second: { lineRef: "7" },
        },
        phase: "waiting",
        transferRevalidation: {
          providerState: "live",
          decision: "tight",
          feasibility: { slackSec: 40 },
        },
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByText(
      "Live check: the transfer to line 7 is tight · less than 1 min margin."
    )
  ).toBeInTheDocument();
});


test("gives explicit cross-platform next actions on transfer leg 2", () => {
  const onShowDeparture = vi.fn();
  const common = {
    transferLeg: 2,
    lineRef: "7",
    stopId: "501",
    stopName: "Kauppatori D4",
    distanceMeters: 90,
    transferPlan: {
      transfer: {
        alightStopId: "500",
        boardStopId: "501",
        boardStopName: "Kauppatori D4",
        walkingDistanceM: 90,
      },
      second: { lineRef: "7" },
    },
  };

  const { rerender } = render(
    <ActiveJourney
      journey={journey(common)}
      stop={{ id: "501", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={onShowDeparture}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Walk to Kauppatori D4" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("Walk about 90 m to Kauppatori D4 for line 7.")
  ).toBeInTheDocument();
  expect(
    screen.getByText("When you get to the transfer stop, tap “I'm at the stop”.")
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      journey={journey({
        ...common,
        phase: "waiting",
        atStopConfirmedAt: 1_900_000_010_000,
      })}
      stop={{ id: "501", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={onShowDeparture}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Wait here for line 7.")).toBeInTheDocument();
  expect(
    screen.getByText(
      "When line 7 arrives, open the selected departure and start the Get-off alert."
    )
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Show line 7 departure" })
  );
  expect(onShowDeparture).toHaveBeenCalledTimes(1);
});

test("same-stop transfer leg 2 says stay instead of pretending there is a walk", () => {
  render(
    <ActiveJourney
      journey={journey({
        transferLeg: 2,
        lineRef: "7",
        stopId: "500",
        stopName: "Kauppatori",
        distanceMeters: 0,
        transferPlan: {
          transfer: {
            alightStopId: "500",
            boardStopId: "500",
            boardStopName: "Kauppatori",
            walkingDistanceM: 0,
          },
          second: { lineRef: "7" },
        },
      })}
      stop={{ id: "500", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Stay at Kauppatori" })
  ).toBeInTheDocument();
  expect(screen.getByText("Stay here for line 7.")).toBeInTheDocument();
  expect(
    screen.getByText(/You are at the transfer stop/i)
  ).toBeInTheDocument();
  expect(screen.queryByText(/About 0 m to the boarding stop/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Walk there" })).not.toBeInTheDocument();
});

test("renders second and final legs of a three-leg itinerary without legacy aliases", () => {
  const base = {
    itinerary: {
      legs: [
        {
          tripRef: "first",
          lineRef: "1",
          boardStopId: "100",
          exitStopId: "500",
          departureAt: 2_000_000_000,
          arrivalAt: 2_000_000_300,
        },
        {
          tripRef: "second",
          lineRef: "7",
          boardStopId: "500",
          exitStopId: "700",
          departureAt: 2_000_000_600,
          arrivalAt: 2_000_000_900,
        },
        {
          tripRef: "third",
          lineRef: "18",
          boardStopId: "700",
          exitStopId: "900",
          departureAt: 2_000_001_200,
          arrivalAt: 2_000_001_500,
        },
      ],
      transfers: [
        {
          alightStopId: "500",
          boardStopId: "500",
          boardStopName: "Hub A",
          walkingDistanceM: 0,
        },
        {
          alightStopId: "700",
          boardStopId: "700",
          boardStopName: "Hub B",
          walkingDistanceM: 0,
        },
      ],
    },
    transferPlan: null,
    transferLeg: null,
  };

  const common = {
    stop: { id: "500", lat: 60.4518, lon: 22.2666 },
    online: true,
    onConfirmAtStop: () => {},
    onShowDeparture: () => {},
    onChooseAnother: () => {},
    onOpenStop: () => {},
  };

  const { rerender } = render(
    <ActiveJourney
      {...common}
      journey={journey({
        ...base,
        activeLegIndex: 1,
        lineRef: "7",
        stopId: "500",
        stopName: "Hub A",
        phase: "waiting",
        atStopConfirmedAt: 1_900_000_010_000,
      })}
    />
  );

  expect(
    screen.getByText("Leg 2 of 3 · change at Hub B to line 18")
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Journey Assistant resumes with the next leg/i)
  ).toBeInTheDocument();

  rerender(
    <ActiveJourney
      {...common}
      journey={journey({
        ...base,
        activeLegIndex: 2,
        lineRef: "18",
        stopId: "700",
        stopName: "Hub B",
        phase: "waiting",
        atStopConfirmedAt: 1_900_000_020_000,
      })}
    />
  );

  expect(
    screen.getByText("Leg 3 of 3 · continue on line 18")
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "When line 18 arrives, open the selected departure and start the Get-off alert."
    )
  ).toBeInTheDocument();
});

