import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DirectJourneyOptions from "./DirectJourneyOptions";

const options = [
  {
    id: "fast",
    kind: "fastest",
    stopId: "200",
    stopName: "Kauppatori D2",
    distanceMeters: 280,
    tripRef: "trip-fast",
    lineRef: "18",
    destinationStopId: "900",
    departureAt: Math.floor(Date.now() / 1000) + 600,
    destinationArrivalAt: Math.floor(Date.now() / 1000) + 1_800,
    catchability: "comfortable",
    liveState: "live",
    catchMarginSec: 250,
  },
  {
    id: "walk",
    kind: "less-walking",
    stopId: "100",
    stopName: "Kauppatori A1",
    distanceMeters: 70,
    tripRef: "trip-walk",
    lineRef: "2",
    destinationStopId: "900",
    departureAt: Math.floor(Date.now() / 1000) + 780,
    destinationArrivalAt: Math.floor(Date.now() / 1000) + 2_100,
    catchability: "comfortable",
    liveState: "schedule",
    catchMarginSec: 300,
  },
];

test("renders compact meaningful alternatives and opens the chosen stop", () => {
  const onChoose = vi.fn();

  render(
    <DirectJourneyOptions
      destinationLabel="Home"
      options={options}
      onChoose={onChoose}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Best ways to Home" })
  ).toBeInTheDocument();

  const fastest = screen.getByRole("button", {
    name: /Fastest: line 18, stop Kauppatori D2/i,
  });
  expect(within(fastest).getByText("Fastest")).toBeInTheDocument();
  expect(within(fastest).getByText("Live")).toBeInTheDocument();

  const lessWalking = screen.getByRole("button", {
    name: /Less walking: line 2, stop Kauppatori A1/i,
  });
  expect(
    within(lessWalking).getByText(/less walking/i)
  ).toBeInTheDocument();
  expect(within(lessWalking).getByText("Schedule")).toBeInTheDocument();

  fireEvent.click(lessWalking);
  expect(onChoose).toHaveBeenCalledWith(options[1]);
});

test("renders nothing when no actionable options exist", () => {
  const { container } = render(
    <DirectJourneyOptions
      destinationLabel="Home"
      options={[]}
      onChoose={() => {}}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
