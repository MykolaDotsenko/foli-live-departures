import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { resetLanguageForTests } from "../i18n";
import FinalWalk from "./FinalWalk";

const walk = {
  destinationId: "external:nominatim:node:123",
  destinationLabel: "Prisma Itäharju",
  lat: 60.45,
  lon: 22.30,
  fromStopId: "900",
  fromStopName: "Itäharju",
  fromLat: 60.45,
  fromLon: 22.29,
  distanceMeters: 180,
};

beforeEach(() => resetLanguageForTests("en"));

test("shows approximate final walk and external walking action", () => {
  const onDone = vi.fn();

  render(<FinalWalk walk={walk} online onDone={onDone} />);

  expect(
    screen.getByRole("region", { name: "Walk to Prisma Itäharju" })
  ).toBeInTheDocument();
  expect(screen.getByText(/Itäharju.*≈180 m/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Destination is roughly east from this stop/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Walking distance is approximate straight-line guidance. The real walking route can be longer."
    )
  ).toBeInTheDocument();

  const link = screen.getByRole("link", { name: "Walk there" });
  expect(link).toHaveAttribute("href", expect.stringContaining("60.45"));
  expect(link).toHaveAttribute("href", expect.stringContaining("22.3"));

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("does not invent a compass direction without exit-stop coordinates", () => {
  render(
    <FinalWalk
      walk={{ ...walk, fromLat: undefined, fromLon: undefined }}
      online={false}
      onDone={() => {}}
    />
  );

  expect(
    screen.queryByText(/Destination is roughly/i)
  ).not.toBeInTheDocument();
});

test("offline final walk keeps guidance but removes the external link", () => {
  render(<FinalWalk walk={walk} online={false} onDone={() => {}} />);

  expect(
    screen.getByText("Walking link unavailable offline.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Walk there" })
  ).not.toBeInTheDocument();
});
