import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

function Crash() {
  throw new Error("boom");
}

test("replaces a render crash with a usable recovery surface", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <AppErrorBoundary>
      <Crash />
    </AppErrorBoundary>
  );

  expect(
    screen.getByRole("heading", { name: "Something went wrong." })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reload app" })).toBeVisible();
  expect(
    screen.getByText(/your saved stops are still on this phone/i)
  ).toBeInTheDocument();

  consoleSpy.mockRestore();
});
