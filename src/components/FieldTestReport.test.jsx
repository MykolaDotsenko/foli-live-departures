import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import FieldTestReport from "./FieldTestReport";

let anchorClick;

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  Object.defineProperty(globalThis.URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:field-report"),
  });
  Object.defineProperty(globalThis.URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  anchorClick = vi
    .spyOn(globalThis.HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});

afterEach(() => {
  anchorClick?.mockRestore();
  vi.restoreAllMocks();
});

test("renders nothing until an explicit local field report exists", () => {
  const { container } = render(<FieldTestReport report="" />);
  expect(container).toBeEmptyDOMElement();
});

test("copies the sanitized report and exposes success state", async () => {
  render(<FieldTestReport report={'{"schema":1}\n'} />);

  fireEvent.click(screen.getByRole("button", { name: "Copy report" }));

  await waitFor(() =>
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith(
      '{"schema":1}\n'
    )
  );
  expect(
    await screen.findByText("Field-test report copied.")
  ).toBeInTheDocument();
});

test("copy failure stays local and offers the download fallback", async () => {
  globalThis.navigator.clipboard.writeText.mockRejectedValueOnce(
    new Error("clipboard denied")
  );
  render(<FieldTestReport report={'{"schema":1}\n'} />);

  fireEvent.click(screen.getByRole("button", { name: "Copy report" }));

  expect(
    await screen.findByText("Copy failed. Download the report instead.")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Download report" })
  ).toBeInTheDocument();
});

test("downloads the exact report as a local JSON blob and revokes the URL", () => {
  render(<FieldTestReport report={'{"schema":1}\n'} />);

  fireEvent.click(screen.getByRole("button", { name: "Download report" }));

  expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  const blob = globalThis.URL.createObjectURL.mock.calls[0][0];
  expect(blob).toBeInstanceOf(globalThis.Blob);
  expect(blob.type).toBe("application/json");
  expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
    "blob:field-report"
  );
});
