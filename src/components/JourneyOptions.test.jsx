import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";
import JourneyOptions from "./JourneyOptions";

beforeEach(() => {
  resetLanguageForTests("en");
});

afterEach(() => {
  resetLanguageForTests("en");
});

const baseDeparture = {
  tripRef: "trip-18",
  lineRef: "18",
  destinationStopId: "900",
  departureAt: 2_000_000_000,
  destinationArrivalAt: 2_000_001_200,
  catchability: "comfortable",
  liveState: "live",
  rideDurationSec: 1_200,
};

test("shows conservative boarding guidance and categorical confidence", () => {
  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      options={[
        {
          id: "high",
          label: "fastest",
          stopId: "100",
          stopName: "Nearby",
          distanceMeters: 120,
          departure: {
            ...baseDeparture,
            lineRef: "18",
            liveState: "live",
            catchability: "comfortable",
          },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
        {
          id: "tight",
          label: "easier-to-catch",
          stopId: "200",
          stopName: "Other",
          distanceMeters: 80,
          departure: {
            ...baseDeparture,
            tripRef: "tight-trip",
            lineRef: "7",
            liveState: "live",
            catchability: "tight",
          },
          arrivalDeltaSec: 60,
          walkingDeltaMeters: -40,
        },
      ]}
    />
  );

  expect(screen.getByText("Line 18 · you should make it")).toBeInTheDocument();
  expect(screen.getByText("High confidence")).toHaveAttribute(
    "data-confidence",
    "high"
  );
  expect(screen.getByText("Line 7 · tight — move now")).toBeInTheDocument();
  expect(screen.getByText("Low confidence")).toHaveAttribute(
    "data-confidence",
    "low"
  );
});

test("renders only meaningful option cards and opens the chosen boarding stop", () => {
  const onOpenStop = vi.fn();

  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={onOpenStop}
      options={[
        {
          id: "fast",
          label: "fastest",
          stopId: "100",
          stopName: "Kauppatori D2",
          distanceMeters: 280,
          departure: baseDeparture,
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
        {
          id: "walk",
          label: "less-walking",
          stopId: "200",
          stopName: "Kauppatori A1",
          distanceMeters: 70,
          departure: {
            ...baseDeparture,
            tripRef: "trip-2",
            lineRef: "2",
            destinationArrivalAt: 2_000_001_500,
          },
          arrivalDeltaSec: 300,
          walkingDeltaMeters: -210,
        },
      ]}
    />
  );

  expect(screen.getByText("Best ways to Home")).toBeInTheDocument();
  expect(screen.getByText("Fastest")).toBeInTheDocument();
  expect(screen.getByText("Less walking")).toBeInTheDocument();
  expect(screen.getByText(/210 m less walking/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Live estimate/)).toHaveLength(2);

  fireEvent.click(
    screen.getByRole("button", {
      name: /Less walking.*Line 2.*Kauppatori A1.*210 m less walking/i,
    })
  );

  expect(onOpenStop).toHaveBeenCalledWith("200");
});

test("renders nothing when there are no trustworthy direct options", () => {
  const { container } = render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      options={[]}
    />
  );

  expect(container).toBeEmptyDOMElement();
});


test("selects the concrete journey when orchestration is available", () => {
  const onSelectJourney = vi.fn();
  const onOpenStop = vi.fn();
  const selected = {
    id: "fast",
    label: "fastest",
    stopId: "100",
    stopName: "Kauppatori D2",
    distanceMeters: 280,
    departure: baseDeparture,
    arrivalDeltaSec: 0,
    walkingDeltaMeters: 0,
  };

  render(
    <JourneyOptions
      destinationLabel="Home"
      onSelectJourney={onSelectJourney}
      onOpenStop={onOpenStop}
      options={[selected]}
    />
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: /Line 18.*Kauppatori D2/i,
    })
  );

  expect(onSelectJourney).toHaveBeenCalledWith(selected);
  expect(onOpenStop).not.toHaveBeenCalled();
});


test("shows final-walk distance and door-arrival wording for external places", () => {
  render(
    <JourneyOptions
      destinationLabel="Prisma Itäharju"
      onOpenStop={() => {}}
      options={[
        {
          id: "place-fast",
          label: "fastest",
          stopId: "100",
          stopName: "Itäharju",
          distanceMeters: 180,
          departure: {
            ...baseDeparture,
            finalWalkDistanceM: 240,
            finalWalkSecEstimate: 250,
            journeyArrivalAt: 2_000_001_450,
          },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  expect(
    screen.getByText(/Reach destination about/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/final walk ≈ 240 m/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Live transit \+ approximate walk/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/real walking route can be longer/i)
  ).toBeInTheDocument();
});

test("does not present a missing final walk as zero metres", () => {
  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      options={[
        {
          id: "normal",
          label: "fastest",
          stopId: "100",
          stopName: "Home stop",
          distanceMeters: 180,
          departure: {
            ...baseDeparture,
            finalWalkDistanceM: null,
            journeyArrivalAt: null,
          },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  expect(screen.queryByText(/final walk/i)).not.toBeInTheDocument();
  // No walk to explain, so no note: the stop list's own distance note
  // follows the options.
  expect(
    screen.queryByText(/real walking route can be longer/i)
  ).not.toBeInTheDocument();
});


test("one option says what to do with it, not that it is the fastest of one", () => {
  const now = Math.floor(Date.now() / 1000);

  render(
    <JourneyOptions
      destinationLabel="Home"
      stopsById={new Map([["900", { id: "900", name: "Puistokatu" }]])}
      onOpenStop={() => {}}
      options={[
        {
          id: "only",
          label: "fastest",
          stopId: "100",
          stopName: "Kauppatori",
          distanceMeters: 120,
          departure: {
            ...baseDeparture,
            headsign: "Runosmäki",
            departureAt: now + 300,
            destinationArrivalAt: now + 1_500,
          },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  // Nothing to compare with: no "Fastest", no "1 option", no "Earliest
  // arrival we found".
  expect(screen.queryByText("Fastest")).not.toBeInTheDocument();
  expect(screen.queryByText(/^\d+ options?$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Earliest arrival/)).not.toBeInTheDocument();

  // The bus by its sign, where to get off and for how long, when it leaves,
  // and that missing it means no other bus there.
  expect(screen.getByText("Line 18 → Runosmäki")).toBeInTheDocument();
  expect(
    screen.getByText("Get off at Puistokatu · about 20 min on the bus")
  ).toBeInTheDocument();
  expect(screen.getByText(/^Leaves in 5 min · 120 m to stop/)).toBeInTheDocument();
  expect(screen.getByText("The only bus there we found")).toBeInTheDocument();
});

test("the next bus is offered for missing the first one", () => {
  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      options={[
        {
          id: "first",
          label: "fastest",
          stopId: "100",
          stopName: "Kauppatori",
          distanceMeters: 120,
          departure: baseDeparture,
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
        {
          id: "next",
          label: "next-bus",
          stopId: "100",
          stopName: "Kauppatori",
          distanceMeters: 120,
          departure: {
            ...baseDeparture,
            tripRef: "trip-18-next",
            departureAt: baseDeparture.departureAt + 600,
            destinationArrivalAt: baseDeparture.destinationArrivalAt + 600,
          },
          arrivalDeltaSec: 600,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  expect(screen.getByText("2 options")).toBeInTheDocument();
  expect(screen.getByText("Fastest")).toBeInTheDocument();
  expect(screen.getByText("Next bus")).toBeInTheDocument();
  expect(
    screen.getByText("If you miss the first one · about 10 min later")
  ).toBeInTheDocument();
  expect(screen.queryByText("The only bus there we found")).not.toBeInTheDocument();
});

test("a selected origin stop does not pretend the passenger is physically there", () => {
  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      access={false}
      options={[
        {
          id: "chosen-origin",
          label: "fastest",
          stopId: "100",
          stopName: "Kauppatori",
          distanceMeters: 0,
          departure: { ...baseDeparture, catchability: "at-stop" },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  expect(screen.getByText(/Line 18/)).toBeInTheDocument();
  expect(screen.queryByText(/you’re at its stop/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/to stop/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
});

test("at the stop, the card says where the passenger is, not that the bus is there", () => {
  render(
    <JourneyOptions
      destinationLabel="Home"
      onOpenStop={() => {}}
      options={[
        {
          id: "here",
          label: "fastest",
          stopId: "100",
          stopName: "Kauppatori",
          distanceMeters: 8,
          departure: { ...baseDeparture, catchability: "at-stop" },
          arrivalDeltaSec: 0,
          walkingDeltaMeters: 0,
        },
      ]}
    />
  );

  // "Board line 18 now" stood over a bus still minutes away.
  expect(screen.getByText("Line 18 · you’re at its stop")).toBeInTheDocument();
  expect(screen.queryByText(/Board line/)).not.toBeInTheDocument();
});
