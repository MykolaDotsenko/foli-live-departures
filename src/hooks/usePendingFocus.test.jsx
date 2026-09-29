import { fireEvent, render, screen } from "@testing-library/react";
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
