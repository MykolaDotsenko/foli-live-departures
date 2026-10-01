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
      name: /Fastest.*Line 18.*Kauppatori D2/i,
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
  expect(
    screen.getByText(
      "Direct options use current Föli data and approximate straight-line distance to the boarding stop."
    )
  ).toBeInTheDocument();
});
