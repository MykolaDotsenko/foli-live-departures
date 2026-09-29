import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ServiceAlerts from "./ServiceAlerts";

function message(id, overrides = {}) {
  return {
    id: `message-${id}`,
    type: "message",
    title: `Update ${id}`,
    message: `Message ${id}`,
    information: "",
    effect: "DETOUR",
    effectLabel: "Detour",
    routeNames: ["1"],
    ...overrides,
  };
}

test("keeps retained disruption information visible when a refresh fails", () => {
  render(
    <ServiceAlerts
      alerts={[message(1)]}
      error
      receivedAtMs={Date.now() - 2 * 60 * 1000}
    />
  );

  expect(screen.getByText("Update 1")).toBeInTheDocument();
  expect(screen.getByText(/Update failed.*2 min ago/i)).toBeInTheDocument();
});

test("an emergency is expanded immediately and cannot be folded behind the phone summary", () => {
  render(
    <ServiceAlerts
      alerts={[
        message(1, {
          type: "emergency",
          title: "Emergency notice text",
          information: "Follow the official instructions.",
          routeNames: [],
        }),
      ]}
    />
  );

  const details = screen.getByText("Emergency notice text").closest("details");
  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Follow the official instructions.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /service update/i })
  ).not.toBeInTheDocument();
});

test("a cancellation shows the line, planned time and known cause without an effect badge", () => {
  render(
    <ServiceAlerts
      alerts={[
        {
          id: "cancelled-1",
          type: "cancellation",
          title: "Cancelled departure",
          line: "32",
          scheduledTime: 12 * 60 * 60,
          cause: "TECHNICAL_PROBLEM",
          effect: "NO_SERVICE",
          effectLabel: "No service",
          routeNames: ["32"],
          message: "",
          information: "",
        },
      ]}
    />
  );

  expect(
    screen.getByText(/Line 32.*Technical problem/i)
  ).toBeInTheDocument();
  expect(screen.queryByText("No service")).not.toBeInTheDocument();
});

test("the singular overflow action exposes exactly one additional update", () => {
  render(<ServiceAlerts alerts={[1, 2, 3, 4, 5].map((id) => message(id))} />);

  const more = screen.getByRole("button", { name: "Show 1 more update" });
  expect(screen.queryByText("Update 5")).not.toBeInTheDocument();

  fireEvent.click(more);

  expect(screen.getByText("Update 5")).toBeInTheDocument();
});

test("stale empty disruption data is not presented as a clean no-alert state", () => {
  render(
    <ServiceAlerts
      alerts={[]}
      receivedAtMs={Date.now() - 11 * 60 * 1000}
    />
  );

  expect(
    screen.getByRole("heading", { name: "Couldn’t check service updates" })
  ).toBeInTheDocument();
  expect(screen.getByText(/last checked 11 min ago/i)).toBeInTheDocument();
});
