// The suite's `test`: every scenario gets the Föli mocks, the CSP guard and a clock restore.
import { test as base, expect } from "@playwright/test";
import { restoreRealClock } from "./clock.js";
import { mockFoli } from "./foli.js";

// Inline style Playwright itself injects into the page under test, matched
// exactly so that anything else inline is still a failure.
const PLAYWRIGHT_TOOLING_STYLES = ["body {}"];

export const test = base.extend({
  // An automatic fixture rather than hooks in each file: the violations list
  // lives in this closure, so it belongs to one test and nothing else, on
  // any worker, with fullyParallel on.
  standardScenario: [
    async ({ page }, use) => {
      // The shipped page carries a Content-Security-Policy (vite.config.js). Every
      // scenario doubles as its check: anything the policy blocks, a script, a
      // style, a request, fails the test that met it.
      const cspViolations = [];
      await page.exposeBinding("__reportCspViolation", (_source, violation) => {
        cspViolations.push(violation);
      });
      await page.addInitScript((toolingSamples) => {
        document.addEventListener("securitypolicyviolation", (event) => {
          // Playwright's own screenshot machinery, not the page: on WebKit it
          // appends <style>body {}</style> before every capture to settle
          // animations, and the policy rightly refuses it.
          if (
            event.effectiveDirective === "style-src-elem" &&
            toolingSamples.includes(event.sample)
          ) {
            return;
          }
          globalThis.__reportCspViolation?.(
            `${event.effectiveDirective} blocked ${event.blockedURI || "inline code"}${
              event.sample ? ` (${event.sample})` : ""
            }`
          );
        });
      }, PLAYWRIGHT_TOOLING_STYLES);
      await mockFoli(page);

      await use();

      restoreRealClock();
      expect(cspViolations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
