import { readFile } from "node:fs/promises";
import path from "node:path";

const workflow = await readFile(
  path.resolve(".github/workflows/live-contract-smoke.yml"),
  "utf8"
);

const failures = [];
const requireToken = (token, message) => {
  if (!workflow.includes(token)) failures.push(message);
};

requireToken("name: Live Föli contract smoke", "Live contract workflow name changed unexpectedly.");
requireToken("  push:\n    branches:\n      - master", "Live Föli smoke must run after every master push.");
requireToken('    - cron: "17 5 * * *"', "Live Föli smoke must retain its daily schedule.");
requireToken("  workflow_dispatch:", "Live Föli smoke must remain manually runnable.");
requireToken("permissions:\n  contents: read", "Live Föli smoke must stay read-only.");
requireToken("cancel-in-progress: true", "Live Föli smoke must cancel superseded runs.");
requireToken("https://data.foli.fi", "Live Föli smoke must exercise the public Föli API.");
requireToken("timeout-minutes: 8", "Live Föli smoke must stay bounded.");

if (/contents:\s*write/.test(workflow) || /id-token:\s*write/.test(workflow)) {
  failures.push("Live Föli smoke must not receive write or OIDC permissions.");
}

if (failures.length) {
  throw new Error(
    ["Live Föli smoke workflow contract failed:", ...failures.map((f) => `- ${f}`)].join("\n")
  );
}

console.log(
  "Live Föli smoke contract verified: every master push, daily schedule and manual dispatch; read-only and non-blocking."
);
