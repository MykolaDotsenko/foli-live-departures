import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TransferJourneyOptions from "./TransferJourneyOptions";

const now = Math.floor(Date.now() / 1000);
const option = {
  id: "transfer-1",
  originStopId: "100",
  originStopName: "Origin",
  originDistanceMeters: 280,
  legs: [
    {
      tripRef: "first",
      lineRef: "1",
      departureAt: now + 600,
    },
    {
      tripRef: "second",
      lineRef: "8",
    },
  ],
  transfers: [
    {
      alightStopId: "200",
      boardStopId: "201",
      boardStopName: "Kauppatori platform B",
      walkingDistanceM: 120,
      feasibility: {
        state: "comfortable",
        slackSec: 360,
      },
    },
  ],
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
  expect(screen.getByText("Line 1 → Line 8")).toBeInTheDocument();
  expect(
    screen.getByText(/Change 1: Kauppatori platform B/)
  ).toHaveTextContent("walk");
  expect(screen.getByText(/Comfortable transfer/)).toHaveTextContent(
    "about 6 min transfer margin"
  );
  expect(
    screen.getByText(/Future buses are rechecked against fresh live data/)
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
          transfers: [{
            ...option.transfers[0],
            alightStopId: "200",
            boardStopId: "200",
            walkingDistanceM: 0,
            feasibility: { state: "tight", slackSec: 90 },
          }],
        },
      ]}
      destinationLabel="Home"
      onSelectJourney={() => {}}
    />
  );

  expect(screen.getByText(/Change 1: Kauppatori platform B · same stop/i)).toBeInTheDocument();
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
          transfers: [{
            ...option.transfers[0],
            feasibility: { state: "acceptable", slackSec: null },
          }],
        },
        {
          ...option,
          id: "fallbacks",
          legs: option.legs.map((leg) => ({ ...leg, lineRef: "" })),
          finalWalkDistanceM: undefined,
          totalWalkingDistanceM: 0,
          transfers: [{
            ...option.transfers[0],
            boardStopName: "",
            walkingDistanceM: 0,
            feasibility: { state: "unknown", slackSec: -1 },
          }],
        },
      ]}
      destinationLabel="Home"
    />
  );

  expect(screen.getByText("2 options")).toBeInTheDocument();
  expect(screen.getByText(/Reasonable transfer/)).toBeInTheDocument();
  expect(screen.getAllByText(/Arrive about/i)).toHaveLength(2);
  expect(screen.queryByText(/final walk ≈/i)).not.toBeInTheDocument();
  expect(screen.getByText("Line — → Line —")).toBeInTheDocument();
  expect(screen.getByText(/Tight transfer/)).toBeInTheDocument();
});

test("renders every leg and both changes for a bounded two-transfer option", () => {
  render(
    <TransferJourneyOptions
      options={[
        {
          ...option,
          id: "two-transfer",
          legs: [
            { ...option.first, lineRef: "1" },
            {
              tripRef: "middle",
              lineRef: "7",
              boardStopId: "201",
              exitStopId: "300",
              departureAt: now + 1500,
              arrivalAt: now + 1900,
            },
            {
              tripRef: "third",
              lineRef: "18",
              boardStopId: "301",
              exitStopId: "900",
              departureAt: now + 2200,
              arrivalAt: now + 2800,
            },
          ],
          transfers: [
            option.transfer,
            {
              alightStopId: "300",
              alightStopSequence: 8,
              boardStopId: "301",
              boardStopName: "Kauppatori C",
              walkingDistanceM: 85,
              feasibility: {
                state: "acceptable",
                slackSec: 240,
              },
            },
          ],
          journeyArrivalAt: now + 2800,
        },
      ]}
      destinationLabel="Home"
      onSelectJourney={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", {
      name: "Ways to Home with up to two changes",
    })
  ).toBeInTheDocument();
  expect(screen.getByText("2 transfers")).toBeInTheDocument();
  expect(screen.getByText("Line 1 → Line 7 → Line 18")).toBeInTheDocument();
  expect(screen.getByText(/Change 1:/)).toBeInTheDocument();
  expect(screen.getByText(/Change 2: Kauppatori C/)).toBeInTheDocument();
});
