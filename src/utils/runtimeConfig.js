const DEFAULT_CONFIG = Object.freeze({
  geocoder: Object.freeze({
    enabled: false,
    provider: "",
    baseUrl: "",
    countryCodes: [],
    viewbox: "",
    resultLimit: 6,
  }),
});

/**
 * Runtime config deliberately fails closed. A missing/malformed config never
 * causes the app to contact an external place-search provider.
 *
 * @param {AbortSignal} [signal]
 */
export async function loadRuntimeConfig(signal) {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}runtime-config.json`,
      {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) return DEFAULT_CONFIG;
    const payload = await response.json();
    const geocoder = payload?.geocoder;

    if (!geocoder || typeof geocoder !== "object") {
      return DEFAULT_CONFIG;
    }

    const baseUrl = String(geocoder.baseUrl || "").trim();
    let origin = "";
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol === "https:") origin = parsed.origin;
    } catch {
      // Invalid URLs disable the provider.
    }

    const provider =
      geocoder.provider === "nominatim" ? "nominatim" : "";
    const enabled =
      geocoder.enabled === true &&
      provider === "nominatim" &&
      Boolean(origin);

    return {
      geocoder: {
        enabled,
        provider,
        baseUrl: enabled ? origin : "",
        countryCodes: Array.isArray(geocoder.countryCodes)
          ? geocoder.countryCodes
              .map((value) => String(value || "").trim().toLowerCase())
              .filter((value) => /^[a-z]{2}$/.test(value))
              .slice(0, 5)
          : [],
        viewbox:
          typeof geocoder.viewbox === "string"
            ? geocoder.viewbox.trim()
            : "",
        resultLimit: Math.min(
          8,
          Math.max(1, Number(geocoder.resultLimit) || 6)
        ),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
