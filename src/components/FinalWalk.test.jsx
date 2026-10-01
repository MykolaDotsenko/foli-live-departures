import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";
import FinalWalk from "./FinalWalk";

afterEach(() => resetLanguageForTests("en"));

const walk = {
  destinationId: "geo:osm:node:123",
  destinationLabel: "Prisma Itäharju",
  lat: 60.4518,
  lon: 22.2666,
  fromStopId: "900",
  fromStopName: "Prisma stop",
  distanceMeters: 140,
};

test("shows destination, exit context and walking handoff", () => {
  render(<FinalWalk walk={walk} online onDone={() => {}} />);

  expect(
    screen.getByRole("heading", { name: "Walk to Prisma Itäharju" })
  ).toBeInTheDocument();
  expect(screen.getByText("Prisma stop · 140 m")).toBeInTheDocument();

  const link = screen.getByRole("link", { name: "Walk there" });
  expect(link).toHaveAttribute("href", expect.stringContaining("travelmode=walking"));
  expect(link).toHaveAttribute("href", expect.stringContaining("60.4518"));
});

test("stays useful offline without a dead map link", () => {
  render(<FinalWalk walk={walk} online={false} onDone={() => {}} />);

  expect(
    screen.getByText("Walking link unavailable offline.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Walk there" })
  ).not.toBeInTheDocument();
});

test("lets the passenger finish the journey explicitly", () => {
  const onDone = vi.fn();
  render(<FinalWalk walk={walk} online onDone={onDone} />);

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onDone).toHaveBeenCalledTimes(1);
});
