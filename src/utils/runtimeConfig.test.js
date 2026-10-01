import { afterEach, expect, test, vi } from "vitest";
import { loadRuntimeConfig } from "./runtimeConfig";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("loads a valid HTTPS Nominatim runtime config", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        geocoder: {
          enabled: true,
          provider: "nominatim",
          baseUrl: "https://nominatim.openstreetmap.org/search",
          countryCodes: ["FI", "bad-value"],
          resultLimit: 99,
        },
      }),
    })
  );

  await expect(loadRuntimeConfig()).resolves.toEqual({
    geocoder: {
      enabled: true,
      provider: "nominatim",
      baseUrl: "https://nominatim.openstreetmap.org",
      countryCodes: ["fi"],
      viewbox: "",
      resultLimit: 8,
    },
  });
});

test("fails closed for malformed, insecure or unavailable config", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        geocoder: {
          enabled: true,
          provider: "nominatim",
          baseUrl: "http://example.com",
        },
      }),
    })
  );

  const insecure = await loadRuntimeConfig();
  expect(insecure.geocoder.enabled).toBe(false);

  fetch.mockRejectedValueOnce(new Error("offline"));
  const offline = await loadRuntimeConfig();
  expect(offline.geocoder.enabled).toBe(false);
});
