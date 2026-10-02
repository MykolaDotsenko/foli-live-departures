import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  FOLI_CONNECT_SOURCES,
  contentSecurityPolicyPlugin,
  originOf,
} from "./scripts/content-security-policy.mjs";
import { createCssModuleScopedNameGenerator } from "./scripts/css-module-names.mjs";
import { loadProductionSiteConfig } from "./scripts/production-site-config.mjs";

// Link previews need the canonical production URL. The versioned config owns
// that origin; local/E2E builds still keep their own base path unless the
// production build wrapper explicitly supplies it.
const PRODUCTION_SITE = loadProductionSiteConfig();
process.env.VITE_SITE_URL ||= PRODUCTION_SITE.siteUrl;

const PACKAGE_VERSION = String(
  JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8")
  ).version || ""
).trim();

function normalizedBasePath() {
  const value = String(process.env.VITE_BASE_PATH || "/").trim();
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

// src/api/foliApi.js can be pointed elsewhere at build time; the policy must
// let the app reach wherever it was pointed.
const FOLI_ENDPOINT_VARIABLES = [
  "VITE_FOLI_API_URL",
  "VITE_FOLI_ALERTS_URL",
  "VITE_FOLI_GTFS_URL",
  "VITE_FOLI_STOPS_URL",
  "VITE_FOLI_ROUTES_URL",
  "VITE_FOLI_BOUNDARY_URL",
];

// Direct public place search is dormant in production. Its reviewed endpoint
// remains in the runtime config, but CSP deliberately does not admit that
// origin. Re-enabling it therefore requires an explicit CSP/code review rather
// than a config-only switch.
function connectSources(env) {
  return [
    ...FOLI_CONNECT_SOURCES,
    ...FOLI_ENDPOINT_VARIABLES.map((name) => originOf(env[name] || "")),
  ];
}

const generateScopedName = createCssModuleScopedNameGenerator();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appVersion = String(
    process.env.VITE_APP_VERSION || env.VITE_APP_VERSION || PACKAGE_VERSION
  ).trim();

  return {
  base: normalizedBasePath(),
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion || "dev"),
  },
  build: {
    manifest: true,
    // Release QA targets current Chromium, Firefox and mobile WebKit. ES2022
    // is exercised by Playwright on every pull request and avoids unnecessary
    // compatibility transforms in both the web and Android payloads.
    target: "es2022",
    // Lightning CSS is already part of Vite's locked toolchain. Use it for
    // production styles while keeping Vite's default JS minifier, avoiding an
    // extra optional Terser dependency in native/release workflows.
    cssMinify: "lightningcss",
    // Locale runtime helpers are dynamically imported, but all supported
    // release browsers have native module support, so the legacy preload
    // compatibility polyfill is unnecessary.
    modulePreload: { polyfill: false },
    // Keep third-party licence text available without repeating legal
    // comments inside the executable JS bundle. The generated file ships
    // with the static site and is outside the JS/CSS performance budget.
    license: true,
    rolldownOptions: {
      output: {
        // Rolldown uses the same built-in Oxc minifier as Vite. Full output
        // minification performs compression/DCE without adding an optional
        // external minifier dependency, so web and Android stay identical.
        minify: true,
        minifyInternalExports: true,
        legalComments: "none",
      },
    },
  },
  css: {
    modules: {
      // A build-local registry guarantees uniqueness while using compact
      // names (a, b, …). A contract test proves these names do not collide
      // with global App.css classes on every pull request.
      generateScopedName,
    },
  },
  plugins: [
    react(),
    contentSecurityPolicyPlugin({
      connectSources: connectSources(env),
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text"],
      include: ["src/**/*.{js,jsx}"],
      // Entry point and test scaffolding are not behaviour under test.
      exclude: ["src/**/*.{test,spec}.{js,jsx}", "src/setupTests.js", "src/main.jsx"],
      // Set just under what the suite currently reaches, so the numbers can
      // only be argued upwards. They are a ratchet, not a target.
      thresholds: {
        statements: 88,
        branches: 81,
        functions: 90,
        lines: 91,
      },
    },
  },
  };
});
