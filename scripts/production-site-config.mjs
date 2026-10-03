import fs from "node:fs";
import path from "node:path";

export const PRODUCTION_SITE_CONFIG_PATH = "config/production-site.json";

function normalizedBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || /[?#]/.test(raw) || raw.includes("..")) {
    throw new Error("Production basePath must be an absolute clean URL path.");
  }
  const withTrailing = raw.endsWith("/") ? raw : `${raw}/`;
  if (/\/\//.test(withTrailing)) {
    throw new Error("Production basePath must not contain duplicate slashes.");
  }
  return withTrailing;
}

function normalizedSiteUrl(value, label = "Production siteUrl") {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query or hash.`);
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function normalizedDomain(value) {
  if (value == null) return null;
  const domain = String(value).trim().toLowerCase();
  if (!domain || domain.includes("/") || domain.includes(":") || /\s/.test(domain)) {
    throw new Error("customDomain must be a bare hostname.");
  }
  const parsed = new URL(`https://${domain}/`);
  if (parsed.hostname !== domain) {
    throw new Error("customDomain must be a normalized bare hostname.");
  }
  return domain;
}

export function validateProductionSiteConfig(raw, { cname = null } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Production site config must be an object.");
  }
  if (raw.schema !== 1) {
    throw new Error("Production site config schema must be 1.");
  }
  if (raw.provider !== "github-pages") {
    throw new Error("Production site provider must remain github-pages.");
  }

  const basePath = normalizedBasePath(raw.basePath);
  const siteUrl = normalizedSiteUrl(raw.siteUrl);
  if (siteUrl.pathname !== basePath) {
    throw new Error(
      `Production siteUrl pathname ${siteUrl.pathname} does not match basePath ${basePath}.`
    );
  }

  const customDomain = normalizedDomain(raw.customDomain);
  const legacySiteUrls = Array.isArray(raw.legacySiteUrls)
    ? raw.legacySiteUrls.map((value) => normalizedSiteUrl(value, "legacySiteUrl").href)
    : [];

  if (new Set(legacySiteUrls).size !== legacySiteUrls.length) {
    throw new Error("legacySiteUrls must not contain duplicates.");
  }
  if (legacySiteUrls.includes(siteUrl.href)) {
    throw new Error("The active production site cannot also be a legacy site URL.");
  }

  const normalizedCname = cname == null ? null : String(cname).trim().toLowerCase();
  if (customDomain) {
    if (basePath !== "/") {
      throw new Error("A GitHub Pages custom domain must build at root basePath '/'.");
    }
    if (siteUrl.hostname !== customDomain) {
      throw new Error("siteUrl hostname must equal customDomain.");
    }
    if (!legacySiteUrls.length) {
      throw new Error("Custom-domain cutover must retain the previous production URL in legacySiteUrls.");
    }
    if (normalizedCname !== customDomain) {
      throw new Error("public/CNAME must exactly match customDomain.");
    }
  } else if (normalizedCname) {
    throw new Error("public/CNAME must be absent until customDomain is configured.");
  }

  return {
    schema: 1,
    provider: "github-pages",
    siteUrl: siteUrl.href,
    basePath,
    customDomain,
    legacySiteUrls,
  };
}

export function loadProductionSiteConfig(root = process.cwd()) {
  const configPath = path.resolve(root, PRODUCTION_SITE_CONFIG_PATH);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const cnamePath = path.resolve(root, "public/CNAME");
  const cname = fs.existsSync(cnamePath) ? fs.readFileSync(cnamePath, "utf8") : null;
  return validateProductionSiteConfig(raw, { cname });
}
