import fs from "node:fs";

export const EXPECTED_RELEASE_GATES = Object.freeze([
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
]);

export const RELEASE_GATE_PROFILES = Object.freeze({
  "android-publish": Object.freeze([
    "android-production-signing",
    "physical-android-lifecycle",
    "android-physical-upgrade",
  ]),
  "public-promotion": Object.freeze([
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
  ]),
  "play-production": Object.freeze([
    "branch-protection",
    "native-finnish-review",
    "native-ukrainian-review",
    "native-swedish-review",
    "talkback-physical",
    "physical-android-lifecycle",
    "real-bus-validation",
    "android-production-signing",
    "android-physical-upgrade",
    "play-data-safety-final-review",
    "play-console-upload-review",
  ]),
});

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export function validateReleaseGates(
  payload,
  {
    productionConfig = {},
    requiredProfile = null,
  } = {},
) {
  const failures = [];
  if (payload?.schema !== 1 || !Array.isArray(payload?.gates)) {
    failures.push("Release-gate ledger must use schema 1 with a gates array.");
  }

  const gates = Array.isArray(payload?.gates) ? payload.gates : [];
  const ids = gates.map((gate) => String(gate?.id || ""));
  if (new Set(ids).size !== ids.length) {
    failures.push("Release-gate IDs must be unique.");
  }
  for (const id of EXPECTED_RELEASE_GATES) {
    if (!ids.includes(id)) failures.push(`Release-gate ledger is missing ${id}.`);
  }
  for (const id of ids) {
    if (!EXPECTED_RELEASE_GATES.includes(id)) {
      failures.push(`Unknown release-gate ID: ${id}.`);
    }
  }

  const byId = new Map();
  for (const gate of gates) {
    const id = String(gate?.id || "");
    byId.set(id, gate);
    if (!["open", "closed"].includes(gate?.status)) {
      failures.push(`${id}: status must be open or closed.`);
      continue;
    }

    const evidence = Array.isArray(gate.evidence)
      ? gate.evidence.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    if (gate.status === "closed") {
      if (!validDate(gate.completedAt)) {
        failures.push(`${id}: closed gate requires a real YYYY-MM-DD completedAt date.`);
      }
      if (!evidence.length) {
        failures.push(`${id}: closed gate requires explicit evidence.`);
      }
    } else {
      if (gate.completedAt != null) {
        failures.push(`${id}: open gate cannot have completedAt.`);
      }
      if (evidence.length) {
        failures.push(`${id}: open gate cannot claim completion evidence.`);
      }
    }
  }

  const customDomainGate = byId.get("custom-domain");
  if (customDomainGate?.status === "closed" && !productionConfig?.customDomain) {
    failures.push(
      "custom-domain cannot be closed before production-site config names the final domain."
    );
  }

  let required = [];
  if (requiredProfile) {
    required = RELEASE_GATE_PROFILES[requiredProfile] || [];
    if (!RELEASE_GATE_PROFILES[requiredProfile]) {
      failures.push(`Unknown release-gate profile: ${requiredProfile}.`);
    }
    for (const id of required) {
      if (byId.get(id)?.status !== "closed") {
        failures.push(
          `${requiredProfile}: required manual gate remains open: ${id}.`
        );
      }
    }
  }

  return {
    failures,
    open: gates
      .filter((gate) => gate?.status === "open")
      .map((gate) => String(gate.id)),
    closed: gates
      .filter((gate) => gate?.status === "closed")
      .map((gate) => String(gate.id)),
    required,
  };
}

export function assertReleaseGates(payload, options = {}) {
  const result = validateReleaseGates(payload, options);
  if (result.failures.length) {
    throw new Error(
      [
        "Release-gate ledger verification failed:",
        ...result.failures.map((failure) => `- ${failure}`),
      ].join("\n")
    );
  }
  return result;
}

function cliRequiredProfile(argv) {
  const index = argv.indexOf("--require");
  if (index < 0) return null;
  const profile = argv[index + 1];
  if (!profile || profile.startsWith("--")) {
    throw new Error("--require needs a release-gate profile name.");
  }
  return profile;
}

if (process.argv[1]?.endsWith("verify-release-gates.mjs")) {
  const payload = JSON.parse(
    fs.readFileSync("config/release-gates.json", "utf8")
  );
  const productionConfig = JSON.parse(
    fs.readFileSync("config/production-site.json", "utf8")
  );
  const requiredProfile = cliRequiredProfile(process.argv.slice(2));
  const result = assertReleaseGates(payload, {
    productionConfig,
    requiredProfile,
  });

  const profileText = requiredProfile
    ? `; ${requiredProfile} profile is fully closed`
    : "";
  console.log(
    `Release-gate ledger verified: ${result.closed.length} closed, ${result.open.length} manual gates still open${profileText}.`
  );
}
