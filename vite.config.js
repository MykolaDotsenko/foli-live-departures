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

function connectSources(env) {
  return [
    ...FOLI_CONNECT_SOURCES,
    ...FOLI_ENDPOINT_VARIABLES.map((name) => originOf(env[name] || "")),
  ];
}

export default defineConfig(({ mode }) => ({
  base: normalizedBasePath(),
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
        statements: 82,
        branches: 75,
        functions: 85,
        lines: 86,
      },
    },
  },
}));
