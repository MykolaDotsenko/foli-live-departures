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
requireToken("permissions:\n  contents: read\n  actions: read\n  issues: write", "Live Föli smoke may write only operator issues while repository content stays read-only.");
requireToken("cancel-in-progress: true", "Live Föli smoke must cancel superseded runs.");
requireToken("https://data.foli.fi", "Live Föli smoke must exercise the public Föli API.");
requireToken("timeout-minutes: 8", "Live Föli smoke must stay bounded.");
requireToken("id: contract", "Live Föli smoke must expose the contract step outcome.");
requireToken("Publish operator health summary", "Live Föli smoke must publish an operator-facing workflow summary.");
requireToken("No passenger telemetry is collected by this workflow.", "Health reporting must explicitly remain telemetry-free.");
requireToken('EVENT_NAME: ${{ github.event_name }}', "Health issue logic must distinguish scheduled checks from push/manual runs.");
requireToken('previous_conclusion', "Health issue creation must require a previous scheduled failure.");
requireToken('previous_conclusion\" != \"failure', "A first scheduled failure must not create an issue.");
requireToken("gh issue create", "Sustained health failure must be able to create an operator issue.");
requireToken("gh issue comment", "An existing health issue must be updated instead of duplicated.");
requireToken("gh issue close", "A recovered contract must close the operator issue.");

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
