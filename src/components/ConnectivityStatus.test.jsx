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
    screen.getByText(/saved places and show to driver still work/i)
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Live times and directions need a connection/i)
  ).toBeInTheDocument();
});

// The header's status line announces going offline. With the banner a live
// region too, a screen reader heard it more than once at the same moment.
test("is seen, not announced a second time", () => {
  const { container } = render(<ConnectivityStatus online={false} />);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(container.querySelector("[aria-live]")).toBeNull();
});
