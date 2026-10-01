import { afterEach, expect, test, vi } from "vitest";
import { createHttpClient } from "./httpClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("GET returns parsed JSON and keeps the public API request credential-free", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ status: "OK" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  const client = createHttpClient({
    timeout: 8_000,
    headers: { Accept: "application/json" },
  });

  await expect(client.get("https://data.foli.fi/test")).resolves.toEqual({
    data: { status: "OK" },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "https://data.foli.fi/test",
    expect.objectContaining({
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      signal: expect.any(globalThis.AbortSignal),
    })
  );
});

test("non-success HTTP status rejects instead of parsing it as valid data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    })
  );

  const client = createHttpClient();

  await expect(
    client.get("https://data.foli.fi/test")
  ).rejects.toMatchObject({
    name: "HttpError",
    message: "Request failed with HTTP 503.",
  });
});

test("caller AbortSignal cancels the underlying fetch", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true }
        );
      })
    )
  );

  const client = createHttpClient();
  const controller = new globalThis.AbortController();
  const request = client.get("https://data.foli.fi/test", {
    signal: controller.signal,
  });

  controller.abort();

  await expect(request).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("hard timeout is reported as TimeoutError, not passenger cancellation", async () => {
  vi.useFakeTimers();

  vi.stubGlobal(
    "fetch",
    vi.fn((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(
            new globalThis.DOMException("The operation was aborted.", "AbortError")
          ),
          { once: true }
        );
      })
    )
  );

  const client = createHttpClient({ timeout: 50 });
  const request = client.get("https://data.foli.fi/test");
  const rejection = expect(request).rejects.toMatchObject({
    name: "TimeoutError",
    message: "Request timed out after 50 ms.",
  });

  await vi.advanceTimersByTimeAsync(50);
  await rejection;
});
