import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";
import { formatClock } from "../utils/time";
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
  expect(
    screen.getByText(/The app will not assume your physical location/i)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "I'm at the stop" }));
  expect(onConfirmAtStop).toHaveBeenCalledTimes(1);

  expect(screen.getByRole("link", { name: "Walk there" })).toHaveAttribute(
    "href",
    expect.stringContaining("travelmode=walking")
  );
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
    screen.getByText("Selected bus is pinned first below.")
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
    screen.getByText("Offline: selected plan may be stale.")
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
    screen.getByText(
      "Live monitoring paused while another stop is open. Return to resume."
    )
  ).toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "I'm at the stop" })
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Return to selected stop" })
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
      "Live monitoring unavailable. Selected time may be stale."
    )
  ).toBeInTheDocument();
});


test("shows door-to-door arrival and final walk for a geocoded place", () => {
  const base = journey();
  render(
    <ActiveJourney
      journey={{
        ...base,
        destinationKind: "geocoded-place",
        destinationLabel: "Prisma Itäharju",
        destinationArrivalAt: 2_000_001_000,
        finalWalkDistanceM: 320,
        finalWalkDurationSec: 330,
        finalArrivalAt: 2_000_001_330,
      }}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Final walk ≈ 320 m")).toBeInTheDocument();
  expect(
    screen.getByText(
      `Arrive about ${formatClock(2_000_001_330)}`
    )
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      `Arrive about ${formatClock(2_000_001_000)}`
    )
  ).not.toBeInTheDocument();
});


test("recovery hides stale departure and arrival timing", () => {
  const staleDeparture = 2_000_000_000;
  const staleArrival = 2_000_001_330;

  render(
    <ActiveJourney
      journey={journey({
        destinationKind: "geocoded-place",
        destinationLabel: "Prisma Itäharju",
        phase: "recovery",
        recoveryReason: "cancelled",
        departureAt: staleDeparture,
        destinationArrivalAt: 2_000_001_000,
        finalWalkDistanceM: 320,
        finalWalkDurationSec: 330,
        finalArrivalAt: staleArrival,
      })}
      stop={{ id: "100", lat: 60.4518, lon: 22.2666 }}
      online
      onConfirmAtStop={() => {}}
      onShowDeparture={() => {}}
      onChooseAnother={() => {}}
      onOpenStop={() => {}}
    />
  );

  expect(screen.getByText("Your selected bus was cancelled.")).toBeInTheDocument();
  expect(
    screen.queryByText(`Arrive about ${formatClock(staleArrival)}`)
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Final walk ≈ 320 m")).not.toBeInTheDocument();
});
