import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{js,jsx}", "e2e/**/*.js", "scripts/**/*.mjs", "playwright.config.mjs"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        document: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        File: "readonly",
        HTMLAnchorElement: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        Intl: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
      },
    },
  },
  {
    // Words on screen go through t() (src/i18n), or they stay English
    // whatever language the passenger chose. Names and symbols are allowed.
    files: ["src/**/*.jsx"],
    ignores: ["src/**/*.test.jsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          // {"text"} and {`text`} count too; props are the i18n test's job.
          noStrings: true,
          ignoreProps: true,
          allowedStrings: [
            "·",
            "›",
            "‹",
            "≈",
            "×",
            "+",
            "−",
            "–",
            "—",
            "/",
            ":",
            "(",
            ")",
            "↗",
            "⌖",
            "⌂",
            "★",
            "☆",
            "↺",
            "♿",
            "✓",
            "…",
            ".",
            "🔊",
            "Turku",
            "Åbo",
            "Föli departures",
            "data.foli.fi",
            "CC BY 4.0",
            "GitHub",
          ],
        },
      ],
    },
  },
];
