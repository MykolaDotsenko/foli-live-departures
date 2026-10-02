import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import BuildIdentity from "./BuildIdentity";

test("shows a compact build revision while exposing the exact source commit", () => {
  const sha = "b".repeat(40);
  render(
    <dl>
      <BuildIdentity
        identity={{
          version: "1.2.3",
          sha,
          shortSha: sha.slice(0, 12),
          platform: "web",
        }}
      />
    </dl>
  );

  const identity = screen.getByText("Version 1.2.3").closest("dd");
  expect(identity).toHaveAttribute("data-build-version", "1.2.3");
  expect(identity).toHaveAttribute("data-build-sha", sha);
  expect(identity).toHaveAttribute("data-build-platform", "web");

  const link = screen.getByRole("link", {
    name: `Source revision ${sha}`,
  });
  expect(link).toHaveTextContent(`Build ${sha.slice(0, 12)}`);
  expect(link).toHaveAttribute(
    "href",
    `https://github.com/MykolaDotsenko/foli-live-departures/commit/${sha}`
  );
});

test("labels an unstamped development build explicitly", () => {
  render(
    <dl>
      <BuildIdentity
        identity={{
          version: "0.1.0",
          sha: "",
          shortSha: "",
          platform: "web",
        }}
      />
    </dl>
  );

  expect(screen.getByText("Version 0.1.0")).toBeInTheDocument();
  expect(screen.getByText("Local build")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
