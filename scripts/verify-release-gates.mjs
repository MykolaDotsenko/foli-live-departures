import fs from "node:fs";

const payload = JSON.parse(fs.readFileSync("config/release-gates.json", "utf8"));
const expected = [
  "branch-protection",
  "native-finnish-review",
  "native-ukrainian-review",
  "native-swedish-review",
  "voiceover-physical",
  "talkback-physical",
  "physical-iphone-lifecycle",
  "physical-android-lifecycle",
  "real-bus-validation",
  "custom-domain",
  "android-production-signing",
  "android-physical-upgrade",
  "play-data-safety-final-review",
  "play-console-upload-review",
];

const failures = [];
if (payload?.schema !== 1 || !Array.isArray(payload?.gates)) {
  failures.push("Release-gate ledger must use schema 1 with a gates array.");
}
const gates = Array.isArray(payload?.gates) ? payload.gates : [];
const ids = gates.map((gate) => String(gate?.id || ""));
if (new Set(ids).size !== ids.length) failures.push("Release-gate IDs must be unique.");
for (const id of expected) {
  if (!ids.includes(id)) failures.push(`Release-gate ledger is missing ${id}.`);
}
for (const id of ids) {
  if (!expected.includes(id)) failures.push(`Unknown release-gate ID: ${id}.`);
}

for (const gate of gates) {
  if (!["open", "closed"].includes(gate.status)) {
    failures.push(`${gate.id}: status must be open or closed.`);
    continue;
  }
  const evidence = Array.isArray(gate.evidence)
    ? gate.evidence.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (gate.status === "closed") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(gate.completedAt || ""))) {
      failures.push(`${gate.id}: closed gate requires YYYY-MM-DD completedAt.`);
    }
    if (!evidence.length) {
      failures.push(`${gate.id}: closed gate requires explicit evidence.`);
    }
  } else if (gate.completedAt != null) {
    failures.push(`${gate.id}: open gate cannot have completedAt.`);
  }
}

const production = JSON.parse(fs.readFileSync("config/production-site.json", "utf8"));
const customDomainGate = gates.find((gate) => gate.id === "custom-domain");
if (customDomainGate?.status === "closed" && !production.customDomain) {
  failures.push("custom-domain cannot be closed before production-site config names the final domain.");
}

if (failures.length) {
  throw new Error(
    ["Release-gate ledger verification failed:", ...failures.map((f) => `- ${f}`)].join("\n")
  );
}
const open = gates.filter((gate) => gate.status === "open").map((gate) => gate.id);
console.log(
  `Release-gate ledger verified: ${gates.length - open.length} closed, ${open.length} manual gates still open.`
);
