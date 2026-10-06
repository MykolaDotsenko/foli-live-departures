import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RadarLoadBoundary } from "./StopRadarPanel";

function BrokenRadar() {
  throw new Error("chunk failed");
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("a Radar chunk failure leaves explicit retry and close actions", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const onRetry = vi.fn();
  const onClose = vi.fn();

  render(
    <RadarLoadBoundary onRetry={onRetry} onClose={onClose}>
      <BrokenRadar />
    </RadarLoadBoundary>
  );

  expect(
    screen.getByRole("alert")
  ).toHaveTextContent(
    "Stop radar couldn’t open. Check your connection, then try again."
  );

  fireEvent.click(screen.getByRole("button", { name: "Open stop radar" }));
  expect(onRetry).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Close stop radar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
