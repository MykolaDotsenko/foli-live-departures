import { createHash } from "node:crypto";

// GitHub Pages cannot send response headers, so the policy travels in the
// page itself. A <meta> policy cannot carry frame-ancestors, report-uri or
// sandbox; everything else below is enforced by the browser.

const CHARSET_META = /<meta\s+charset=[^>]*>/i;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** Every inline script body in a document, exactly as the browser hashes it. */
export function inlineScripts(html) {
  return [...html.matchAll(INLINE_SCRIPT)]
    .map((match) => match[1])
    .filter((body) => body.trim() !== "");
}

export function scriptHash(body) {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

/** The origin a configured endpoint URL is served from, or "" if none. */
export function originOf(url) {
  try {
    const { protocol, origin } = new globalThis.URL(url);
    return protocol === "https:" || protocol === "http:" ? origin : "";
  } catch {
    return "";
  }
}

/**
 * @param {{ html: string, connectSources: string[] }} input
 *   connectSources are CSP source expressions, such as origins.
 * @returns {string}
 */
export function buildContentSecurityPolicy({ html, connectSources }) {
  const connect = [...new Set(connectSources.filter(Boolean))];
  const scripts = inlineScripts(html).map(scriptHash);

  return [
    "default-src 'self'",
    // The bundle, plus the pre-paint theme script by hash: no inline code
    // that was not in index.html at build time can run.
    `script-src 'self' ${scripts.join(" ")}`.trim(),
    // React writes style through the CSSOM, which a policy does not govern;
    // no style attribute or <style> element is ever parsed from markup.
    "style-src 'self'",
    // Föli's service alerts link illustrations from wherever Föli hosts them.
    "img-src 'self' data: https:",
    `connect-src 'self' ${connect.join(" ")}`.trim(),
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function policyMeta(policy) {
  const content = policy.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<meta http-equiv="Content-Security-Policy" content="${content}" />`;
}

/** The policy a built index.html carries, or null. */
export function documentPolicy(html) {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i
  );
  return match ? match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&") : null;
}

/**
 * Föli's GTFS metadata names the host its dataset lives on. Any foli.fi host
 * is allowed so a move within Föli keeps working; a host outside it is not
 * one the app should be talking to.
 */
export const FOLI_CONNECT_SOURCES = ["https://data.foli.fi", "https://*.foli.fi"];

/**
 * @param {{ connectSources: string[] }} options
 * @returns {import("vite").Plugin}
 */
export function contentSecurityPolicyPlugin({ connectSources }) {
  return {
    name: "foli-content-security-policy",
    // The dev server injects its own inline HMR code; the policy belongs to
    // what ships.
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const policy = buildContentSecurityPolicy({ html, connectSources });
        const charset = html.match(CHARSET_META);
        if (!charset) {
          throw new Error("index.html needs <meta charset> for the policy to follow.");
        }
        // Right after the charset, which must stay first, and before any
        // script: a policy governs only what the parser meets after it.
        const at = charset.index + charset[0].length;
        return `${html.slice(0, at)}\n    ${policyMeta(policy)}${html.slice(at)}`;
      },
    },
  };
}
