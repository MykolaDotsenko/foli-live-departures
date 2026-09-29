import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ServiceAlerts from "./ServiceAlerts";
import { resetLanguageForTests } from "../i18n";

function message(id) {
  return {
    id: `message-${id}`,
    type: "message",
    title: `Update ${id}`,
    message: `Message ${id}`,
    information: "",
    effect: "DETOUR",
    effectLabel: "Detour",
    routeNames: ["1"],
  };
}

test("does not silently hide service updates beyond the first four", () => {
  render(
    <ServiceAlerts
      alerts={[1, 2, 3, 4, 5, 6].map(message)}
    />
  );

  expect(screen.getByText("Update 1")).toBeInTheDocument();
  expect(screen.getByText("Update 4")).toBeInTheDocument();
  expect(screen.queryByText("Update 5")).not.toBeInTheDocument();

  const more = screen.getByRole("button", {
    name: "Show 2 more updates",
  });
  expect(more).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(more);

  expect(screen.getByText("Update 5")).toBeInTheDocument();
  expect(screen.getByText("Update 6")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Show fewer updates" })
  ).toHaveAttribute("aria-expanded", "true");
});


test("does not imply there are no disruptions when the alert feed cannot be confirmed", () => {
  render(<ServiceAlerts alerts={[]} error />);

  expect(
    screen.getByRole("heading", { name: "Couldn’t check service updates" })
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Some disruptions may not show/i)
  ).toBeInTheDocument();
});

test("marks retained disruption data when the last successful check is old", () => {
  render(
    <ServiceAlerts
      alerts={[message(1)]}
      receivedAtMs={Date.now() - 11 * 60 * 1000}
    />
  );

  expect(
    screen.getByText(/Service updates may be out of date.*11 min ago/i)
  ).toBeInTheDocument();
  expect(screen.getByText("Update 1")).toBeInTheDocument();
});


test("shows validity and mounts disruption media only after details are opened", () => {
  render(
    <ServiceAlerts
      alerts={[
        {
          ...message(1),
          validity: { start: 1_900_000_000, end: 1_900_003_600 },
          images: [
            {
              url: "https://data.foli.fi/media/detour.png",
              title: "Temporary stop map",
              type: "image/png",
            },
          ],
        },
      ]}
    />
  );

  const summary = screen.getByText("Update 1").closest("summary");
  const details = summary.closest("details");

  expect(screen.getByText(/Valid until/i)).not.toBeVisible();
  expect(screen.queryByAltText("Temporary stop map")).not.toBeInTheDocument();

  fireEvent.click(summary);
  details.open = true;
  fireEvent(details, new globalThis.Event("toggle"));

  expect(screen.getByText(/Valid until/i)).toBeVisible();
  const image = screen.getByAltText("Temporary stop map");
  expect(image).toHaveAttribute(
    "src",
    "https://data.foli.fi/media/detour.png"
  );
  expect(image).toHaveAttribute("loading", "lazy");
});

// A cause Föli adds after this was written is spelt out from its code in
// English; spelt out in a Finnish sentence it would be English, so there it
// is simply another cause.
test("names a cause it does not know without leaving English in Finnish", () => {
  const cancellation = {
    id: "cancellation-1",
    type: "cancellation",
    title: "Cancelled departure",
    line: "32",
    cause: "BUS_BREAKDOWN",
    scheduledTime: null,
    routeNames: ["32"],
    message: "",
    information: "",
    effect: "NO_SERVICE",
    effectLabel: "No service",
  };

  const { unmount } = render(<ServiceAlerts alerts={[cancellation]} />);
  expect(screen.getByText("Line 32 · Bus Breakdown")).toBeInTheDocument();
  unmount();

  resetLanguageForTests("fi");
  try {
    render(<ServiceAlerts alerts={[cancellation]} />);
    expect(screen.getByText("Linja 32 · Muu syy")).toBeInTheDocument();
  } finally {
    resetLanguageForTests("en");
  }
});

// A label on a plain span is not read, so the count said only "2".
test("the count beside the heading is read in words", () => {
  render(<ServiceAlerts alerts={[1, 2].map(message)} />);

  const words = screen.getByText("2 service updates", { exact: true });
  const count = words.parentElement;
  expect(count).not.toHaveAttribute("aria-label");
  expect(count.querySelector('[aria-hidden="true"]')).toHaveTextContent(/^2$/);
});
