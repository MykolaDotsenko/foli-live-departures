import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StopRadarPanel from "./StopRadarPanel";

vi.mock("./StopRadar", () => {
  throw new Error("chunk failed");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("a Radar chunk failure leaves explicit retry and close actions", async () => {
  const onClose = vi.fn();
  render(<StopRadarPanel stops={[]} onClose={onClose} />);

  expect(
    await screen.findByRole("alert")
  ).toHaveTextContent(
    "Stop radar couldn’t open. Check your connection, then try again."
  );

  expect(screen.getByRole("button", { name: "Open stop radar" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close stop radar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
