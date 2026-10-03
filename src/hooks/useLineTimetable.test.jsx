import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchScheduledLineDepartures: vi.fn(),
}));

vi.mock("../api/foliApi", () => ({
  fetchScheduledLineDepartures: api.fetchScheduledLineDepartures,
}));

import useLineTimetable from "./useLineTimetable";

beforeEach(() => {
  api.fetchScheduledLineDepartures.mockReset().mockResolvedValue([]);
});

test("rechecks a successful empty timetable when the moving horizon advances", async () => {
  const { result, rerender, unmount } = renderHook(
    ({ referenceTime }) =>
      useLineTimetable("164", ["32"], referenceTime),
    { initialProps: { referenceTime: 1_000 } }
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.rows).toEqual([]);
  expect(api.fetchScheduledLineDepartures).toHaveBeenCalledTimes(1);

  // Same ten-minute bucket: the board's 10-second clock must not create
  // timetable request churn.
  rerender({ referenceTime: 1_199 });
  await Promise.resolve();
  expect(api.fetchScheduledLineDepartures).toHaveBeenCalledTimes(1);

  // The empty result is time-relative. Once the horizon moves into a new
  // bucket, refresh exactly once so a formerly-out-of-range departure can
  // enter the board.
  rerender({ referenceTime: 1_200 });
  await waitFor(() =>
    expect(api.fetchScheduledLineDepartures).toHaveBeenCalledTimes(2)
  );
  await waitFor(() => expect(result.current.status).toBe("ready"));

  unmount();
});

test("does not bucket-refresh while a known first departure still exists", async () => {
  api.fetchScheduledLineDepartures.mockResolvedValue([
    {
      tripref: "trip-32",
      lineref: "32",
      aimeddeparturetime: 5_000,
      aimedarrivaltime: 5_000,
    },
  ]);

  const { result, rerender, unmount } = renderHook(
    ({ referenceTime }) =>
      useLineTimetable("164", ["32"], referenceTime),
    { initialProps: { referenceTime: 1_000 } }
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(api.fetchScheduledLineDepartures).toHaveBeenCalledTimes(1);

  rerender({ referenceTime: 1_800 });
  await Promise.resolve();
  expect(api.fetchScheduledLineDepartures).toHaveBeenCalledTimes(1);

  unmount();
});
