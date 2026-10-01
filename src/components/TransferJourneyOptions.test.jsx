import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TransferJourneyOptions from "./TransferJourneyOptions";

const now = Math.floor(Date.now() / 1000);
const option = {
  id: "transfer-1",
  originStopId: "100",
  originStopName: "Origin",
  originDistanceMeters: 280,
  first: {
    tripRef: "first",
    lineRef: "1",
    departureAt: now + 600,
  },
  transfer: {
    alightStopId: "200",
    boardStopId: "201",
    boardStopName: "Kauppatori platform B",
    walkingDistanceM: 120,
    feasibility: {
      state: "comfortable",
      slackSec: 360,
    },
  },
  second: {
    tripRef: "second",
    lineRef: "8",
  },
  finalWalkDistanceM: 180,
  journeyArrivalAt: now + 2400,
  totalWalkingDistanceM: 580,
};

test("renders a truthful one-transfer card and selects the concrete option", () => {
  const onSelect = vi.fn();
  render(
    <TransferJourneyOptions
      options={[option]}
      destinationLabel="Turun linna"
      onSelectJourney={onSelect}
    />
  );

  expect(
    screen.getByRole("heading", {
      name: "Ways to Turun linna with one change",
    })
  ).toBeInTheDocument();
  expect(screen.getByText("Line 1 → line 8")).toBeInTheDocument();
  expect(
    screen.getByText(/Change at Kauppatori platform B/)
  ).toHaveTextContent("transfer walk");
  expect(screen.getByText(/Comfortable transfer/)).toHaveTextContent(
    "about 6 min transfer margin"
  );
  expect(
    screen.getByText(/The second bus is based on timetable data/)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Line 1 → line 8/i }));
  expect(onSelect).toHaveBeenCalledWith(option);
});

test("labels a same-stop tight connection without inventing a transfer walk", () => {
  render(
    <TransferJourneyOptions
      options={[
        {
          ...option,
          id: "same-stop",
          transfer: {
            ...option.transfer,
            alightStopId: "200",
            boardStopId: "200",
            walkingDistanceM: 0,
            feasibility: { state: "tight", slackSec: 90 },
          },
        },
      ]}
      destinationLabel="Home"
      onSelectJourney={() => {}}
    />
  );

  expect(screen.getByText(/same stop/i)).toBeInTheDocument();
  expect(screen.getByText(/Tight transfer/)).toBeInTheDocument();
});


test("returns no UI for empty or invalid options", () => {
  const { container, rerender } = render(
    <TransferJourneyOptions
      options={[]}
      destinationLabel="Home"
      onSelectJourney={() => {}}
    />
  );
  expect(container).toBeEmptyDOMElement();

  rerender(
    <TransferJourneyOptions
      options={null}
      destinationLabel="Home"
      onSelectJourney={() => {}}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

test("covers plural cards, acceptable risk, missing margin and no final walk", () => {
  render(
    <TransferJourneyOptions
      options={[
        {
          ...option,
          id: "acceptable",
          finalWalkDistanceM: null,
          transfer: {
            ...option.transfer,
            feasibility: { state: "acceptable", slackSec: null },
          },
        },
        {
          ...option,
          id: "fallbacks",
          first: { ...option.first, lineRef: "" },
          second: { ...option.second, lineRef: "" },
          finalWalkDistanceM: undefined,
          totalWalkingDistanceM: 0,
          transfer: {
            ...option.transfer,
            boardStopName: "",
            walkingDistanceM: 0,
            feasibility: { state: "unknown", slackSec: -1 },
          },
        },
      ]}
      destinationLabel="Home"
    />
  );

  expect(screen.getByText("2 options")).toBeInTheDocument();
  expect(screen.getByText(/Reasonable transfer/)).toBeInTheDocument();
  expect(screen.getAllByText(/Arrive about/i)).toHaveLength(2);
  expect(screen.queryByText(/final walk ≈/i)).not.toBeInTheDocument();
  expect(screen.getByText("Line — → line —")).toBeInTheDocument();
  expect(screen.getByText(/Tight transfer/)).toBeInTheDocument();
});
