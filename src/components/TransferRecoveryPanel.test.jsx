import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TransferRecoveryPanel from "./TransferRecoveryPanel";\nimport { resetLanguageForTests } from "../i18n";

const destination = {
  id: "stop:900",
  kind: "public-stop",
  label: "Destination",
};

const option = {
  id: "replacement",
  label: "fastest",
  stopId: "500",
  stopName: "Hub A",
  distanceMeters: 0,
  departure: {
    tripRef: "replacement-run",
    lineRef: "7",
    destinationStopId: "900",
    departureAt: Math.floor(Date.now() / 1000) + 600,
    destinationArrivalAt: Math.floor(Date.now() / 1000) + 1_200,
    journeyArrivalAt: Math.floor(Date.now() / 1000) + 1_200,
    catchability: "at-stop",
    liveState: "live",
  },
  arrivalDeltaSec: 0,
  walkingDeltaMeters: 0,
};

test("shows automatic recovery progress without pretending a route was selected", () => {
  render(
    <TransferRecoveryPanel
      state="loading"
      options={[]}
      destination={destination}
      onSelectJourney={() => {}}
    />
  );

  expect(
    screen.getByText("Checking fresh buses from this transfer area…")
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Nothing changes until you choose a new option/)
  ).toBeInTheDocument();
});

test("shows a fresh replacement and commits it only after an explicit tap", () => {
  const onSelect = vi.fn();
  render(
    <TransferRecoveryPanel
      state="ready"
      options={[option]}
      destination={destination}
      onSelectJourney={onSelect}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Continue to Destination" })
  ).toBeInTheDocument();
  expect(screen.getByText("Fresh transfer options")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Line 7/i }));
  expect(onSelect).toHaveBeenCalledWith(option);
});


test("shows a one-transfer recovery choice and commits it only after an explicit tap", () => {
  const onSelectTransferJourney = vi.fn();
  const transferOption = {
    id: "replacement-transfer",
    originStopId: "500",
    originStopName: "Hub A",
    originDistanceMeters: 0,
    legs: [
      {
        tripRef: "replacement-first",
        lineRef: "7",
        boardStopId: "500",
        exitStopId: "700",
        departureAt: Math.floor(Date.now() / 1000) + 600,
        arrivalAt: Math.floor(Date.now() / 1000) + 1_000,
      },
      {
        tripRef: "replacement-second",
        lineRef: "18",
        boardStopId: "701",
        exitStopId: "900",
        departureAt: Math.floor(Date.now() / 1000) + 1_300,
        arrivalAt: Math.floor(Date.now() / 1000) + 1_900,
      },
    ],
    transfers: [
      {
        alightStopId: "700",
        boardStopId: "701",
        boardStopName: "Hub C",
        walkingDistanceM: 30,
        feasibility: { state: "comfortable", slackSec: 240 },
      },
    ],
    destinationStopId: "900",
    destinationArrivalAt: Math.floor(Date.now() / 1000) + 1_900,
    journeyArrivalAt: Math.floor(Date.now() / 1000) + 1_900,
    totalWalkingDistanceM: 30,
    finalWalkDistanceM: null,
  };

  render(
    <TransferRecoveryPanel
      state="ready"
      directOptions={[]}
      transferOptions={[transferOption]}
      destination={destination}
      onSelectJourney={() => {}}
      onSelectTransferJourney={onSelectTransferJourney}
    />
  );

  expect(
    screen.getByRole("heading", {
      name: "Continue to Destination with a new connection",
    })
  ).toBeInTheDocument();
  expect(screen.getByText("Line 7 → Line 18")).toBeInTheDocument();
  expect(onSelectTransferJourney).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /Line 7 → line 18/i }));
  expect(onSelectTransferJourney).toHaveBeenCalledWith(transferOption);
});

test.each([
  ["offline", "Recovery search will resume when you’re online."],
  [
    "error",
    "Recovery search is temporarily unavailable. Your destination is kept.",
  ],
  [
    "ready",
    "No reliable replacement with at most one new transfer is available from this transfer area right now.",
  ],
])("renders %s recovery state truthfully", (state, message) => {
  render(
    <TransferRecoveryPanel
      state={state}
      options={[]}
      destination={destination}
      onSelectJourney={() => {}}
    />
  );

  expect(screen.getByText(message)).toBeInTheDocument();
});


test("renders nothing without an active destination or while recovery search is idle", () => {
  const { container, rerender } = render(
    <TransferRecoveryPanel
      state="loading"
      options={[]}
      destination={null}
      onSelectJourney={() => {}}
    />
  );

  expect(container).toBeEmptyDOMElement();

  rerender(
    <TransferRecoveryPanel
      state="idle"
      options={[]}
      destination={destination}
      onSelectJourney={() => {}}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

test("localizes a saved-place recovery destination and ignores unknown transient states", () => {
  const { rerender, container } = render(
    <TransferRecoveryPanel
      state="loading"
      options={[]}
      destination={{
        id: "place:home",
        kind: "saved-place",
        label: "Home",
      }}
      onSelectJourney={() => {}}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Continue to Home" })
  ).toBeInTheDocument();

  rerender(
    <TransferRecoveryPanel
      state="refreshing"
      options={[]}
      destination={destination}
      onSelectJourney={() => {}}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

test("renders recovery fail-closed states in Ukrainian without silently choosing a replacement", () => {
  resetLanguageForTests("uk");
  const onSelect = vi.fn();

  render(
    <TransferRecoveryPanel
      state="loading"
      options={[]}
      destination={{
        id: "place:home",
        kind: "saved-place",
        label: "Home",
      }}
      onSelectJourney={onSelect}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Продовжити до Дім" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("Перевіряємо свіжі автобуси з цієї зони пересадки…")
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Проблемний автобус виключено. Нічого не зміниться, доки ви не виберете новий варіант."
    )
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

test("shows a Ukrainian recovery option and commits it only after an explicit tap", () => {
  resetLanguageForTests("uk");
  const onSelect = vi.fn();

  render(
    <TransferRecoveryPanel
      state="ready"
      options={[option]}
      destination={{
        id: "place:home",
        kind: "saved-place",
        label: "Home",
      }}
      onSelectJourney={onSelect}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Продовжити до Дім" })
  ).toBeInTheDocument();
  expect(screen.getByText("Свіжі варіанти пересадки")).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /Маршрут 7/i }));
  expect(onSelect).toHaveBeenCalledWith(option);
});
