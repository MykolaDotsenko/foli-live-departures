const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * @typedef {{
 *   version?: unknown,
 *   sha?: unknown,
 *   native?: unknown,
 *   platform?: unknown
 * }} BuildIdentityInput
 */

/**
 * Keep support identifiers bounded and deterministic before they reach either
 * the UI or a field report. The exact SHA is retained for diagnostics while
 * the UI can show a compact revision without inventing a separate release ID.
 *
 * @param {BuildIdentityInput} [input]
 */
export function normalizeBuildIdentity(input = {}) {
  const rawVersion = String(input.version || "").trim().slice(0, 64);
  const rawSha = String(input.sha || "").trim();
  const sha = SHA_PATTERN.test(rawSha) ? rawSha.toLowerCase() : "";
  const platform =
    input.platform === "android" || input.native === true ? "android" : "web";

  return Object.freeze({
    version: rawVersion || "dev",
    sha,
    shortSha: sha ? sha.slice(0, 12) : "",
    platform,
  });
}

export const BUILD_IDENTITY = normalizeBuildIdentity({
  version: import.meta.env.VITE_APP_VERSION || "",
  sha: import.meta.env.VITE_BUILD_SHA || "",
  native: import.meta.env.VITE_NATIVE_BUILD === "true",
});
