const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * @param {{
 *   timeout?: number,
 *   headers?: Record<string, string>,
 * }} [options]
 */
export function createHttpClient(options = {}) {
  const timeoutMs =
    Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0
      ? Number(options.timeout)
      : DEFAULT_TIMEOUT_MS;
  const defaultHeaders = options.headers || {};

  return {
    /**
     * Small compatibility surface used by foliApi: GET JSON and return
     * { data }, while preserving caller cancellation and a hard timeout.
     *
     * @param {string | URL} url
     * @param {{ signal?: AbortSignal }} [request]
     */
    async get(url, request = {}) {
      const controller = new AbortController();
      const callerSignal = request.signal;
      let timedOut = false;

      const abortFromCaller = () => {
        controller.abort(callerSignal?.reason);
      };

      if (callerSignal?.aborted) {
        abortFromCaller();
      } else {
        callerSignal?.addEventListener("abort", abortFromCaller, {
          once: true,
        });
      }

      const timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await globalThis.fetch(String(url), {
          method: "GET",
          headers: defaultHeaders,
          credentials: "omit",
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = new Error(
            `Request failed with HTTP ${response.status}.`
          );
          error.name = "HttpError";
          throw error;
        }

        return { data: await response.json() };
      } catch (error) {
        if (
          timedOut &&
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          const timeoutError = new Error(
            `Request timed out after ${timeoutMs} ms.`
          );
          timeoutError.name = "TimeoutError";
          throw timeoutError;
        }
        throw error;
      } finally {
        globalThis.clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

export default {
  create: createHttpClient,
};
