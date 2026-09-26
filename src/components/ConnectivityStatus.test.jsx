import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ConnectivityStatus from "./ConnectivityStatus";

test("stays out of the way while online", () => {
  const { container } = render(<ConnectivityStatus online />);

  expect(container).toBeEmptyDOMElement();
});

test("explains exactly what remains usable while offline", () => {
  render(<ConnectivityStatus online={false} />);

  expect(screen.getByText("Offline")).toBeInTheDocument();
  expect(
    screen.getByText(/saved places and the driver card still work/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Live times and directions need a connection/i)
  ).toBeInTheDocument();
});
