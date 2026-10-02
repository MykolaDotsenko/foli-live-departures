import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  FOLI_CONNECT_SOURCES,
  contentSecurityPolicyPlugin,
  originOf,
} from "./scripts/content-security-policy.mjs";

// Link previews need absolute URLs. This is where production lives; a
// deployment elsewhere sets VITE_SITE_URL, and index.html reads it as
// %VITE_SITE_URL%.
process.env.VITE_SITE_URL ||=
  "https://mykoladotsenko.github.io/foli-live-departures/";

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

const NATIVE_BUILD =
  String(process.env.VITE_NATIVE_BUILD || "").trim().toLowerCase() === "true";

const PLACE_SEARCH_CONNECT_SOURCES = NATIVE_BUILD
  ? []
  : ["https://nominatim.openstreetmap.org"];

function connectSources(env) {
  return [
    ...FOLI_CONNECT_SOURCES,
    ...PLACE_SEARCH_CONNECT_SOURCES,
    ...FOLI_ENDPOINT_VARIABLES.map((name) => originOf(env[name] || "")),
  ];
}

export default defineConfig(({ mode }) => ({
  base: normalizedBasePath(),
  build: {
    // Release QA targets current Chromium, Firefox and mobile WebKit. ES2022
    // is supported by those browsers and avoids compatibility transforms for
    // syntax we already exercise in Playwright on every pull request.
    target: "es2022",
    // The app has no dynamic imports, so the modulepreload compatibility
    // polyfill has no runtime work to do. All supported release browsers also
    // have native module support.
    modulePreload: { polyfill: false },
  },
  css: {
    modules: {
      // Default CSS-module identifiers repeat file/local names in both the
      // stylesheet and JS class map. A six-character content hash keeps
      // module isolation while materially reducing the executable/style
      // payload. Global class names are unaffected.
      generateScopedName: "[hash:base64:6]",
    },
  },
  plugins: [
    react(),
    contentSecurityPolicyPlugin({
      connectSources: connectSources(loadEnv(mode, process.cwd(), "VITE_")),
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
}));
