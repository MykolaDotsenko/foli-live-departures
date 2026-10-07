import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import usePendingFocus from "./usePendingFocus";

// A button that goes away when pressed, and a heading that only appears
// once it has: the shape of Start, a saved-stop chip and a place setup.
function Swap({ ask = true }) {
  const requestFocus = usePendingFocus();
  const [done, setDone] = useState(false);
  const [ticks, setTicks] = useState(0);

  return (
    <>
      {done ? (
        <h2 id="result" tabIndex={-1}>
          Result
        </h2>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (ask) requestFocus(() => document.getElementById("result"));
            setDone(true);
          }}
        >
          Go
        </button>
      )}
      <button type="button" onClick={() => setTicks(ticks + 1)}>
        Elsewhere {ticks}
      </button>
    </>
  );
}

test("focus follows the action to a target that mounts with it", () => {
  render(<Swap />);
  const go = screen.getByRole("button", { name: "Go" });
  go.focus();

  fireEvent.click(go);

  expect(screen.getByRole("heading", { name: "Result" })).toHaveFocus();
});

function OutsideReact() {
  const requestFocus = usePendingFocus();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          requestFocus(() => document.getElementById("async-result"))
        }
      >
        Wait for lazy target
      </button>
      <div data-testid="async-host" />
    </>
  );
}

test("focus follows a target inserted without re-rendering the hook owner", async () => {
  render(<OutsideReact />);
  const button = screen.getByRole("button", { name: "Wait for lazy target" });
  button.focus();
  fireEvent.click(button);

  const target = document.createElement("h2");
  target.id = "async-result";
  target.tabIndex = -1;
  target.textContent = "Lazy result";
  screen.getByTestId("async-host").append(target);

  await waitFor(() => expect(target).toHaveFocus());
});

test("nothing moves focus unless an action asked", () => {
  render(<Swap ask={false} />);
  const go = screen.getByRole("button", { name: "Go" });
  go.focus();

  fireEvent.click(go);

  expect(screen.getByRole("heading", { name: "Result" })).not.toHaveFocus();
});

// A place setup opens only when the location answers. A passenger who has
// moved on by then is left where they went.
function Late() {
  const requestFocus = usePendingFocus();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => requestFocus(() => document.getElementById("late"))}
      >
        Ask
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Answer
      </button>
      {open && (
        <h2 id="late" tabIndex={-1}>
          Late
        </h2>
      )}
    </>
  );
}

test("a late target does not take focus from where the passenger went", () => {
  render(<Late />);
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  const answer = screen.getByRole("button", { name: "Answer" });
  answer.focus();
  fireEvent.click(answer);

  expect(answer).toHaveFocus();
});

test("a late target takes focus while the passenger is still waiting on it", () => {
  render(<Late />);
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  // The answer arrives by itself; focus is still on the button pressed.
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));

  expect(screen.getByRole("heading", { name: "Late" })).toHaveFocus();
});

// Tapping plain text leaves focus on the page, just as a control that has
// gone does. A slow "Use my location" answered after that pulled focus, and
// the page's scroll, back to the place setup the passenger had left.
test("a late target does not take focus after the passenger tapped elsewhere", () => {
  render(
    <>
      <Late />
      <p>Some text</p>
    </>
  );
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  fireEvent.pointerDown(screen.getByText("Some text"));
  ask.blur();
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));

  expect(screen.getByRole("heading", { name: "Late" })).not.toHaveFocus();
  expect(document.body).toHaveFocus();
});

test("focus on the page is not the asking control's while it is still there", () => {
  render(<Late />);
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  ask.blur();
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));

  expect(screen.getByRole("heading", { name: "Late" })).not.toHaveFocus();
});

test("focus moving to another control withdraws the request", () => {
  render(<Late />);
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  const answer = screen.getByRole("button", { name: "Answer" });
  answer.focus();
  ask.focus();
  fireEvent.click(answer);

  expect(screen.getByRole("heading", { name: "Late" })).not.toHaveFocus();
  expect(ask).toHaveFocus();
});

test("a press on the asking control itself keeps the request", () => {
  render(<Late />);
  const ask = screen.getByRole("button", { name: "Ask" });
  ask.focus();
  fireEvent.click(ask);

  fireEvent.pointerDown(ask);
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));

  expect(screen.getByRole("heading", { name: "Late" })).toHaveFocus();
});
