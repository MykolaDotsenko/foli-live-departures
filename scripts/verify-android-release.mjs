import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  readFile(path.resolve(root, relativePath), "utf8");

const [rawConfig, apkWorkflow, e2eWorkflow, releaseWorkflow, runner] =
  await Promise.all([
    read("capacitor.config.json"),
    read(".github/workflows/android-apk.yml"),
    read(".github/workflows/android-e2e.yml"),
    read(".github/workflows/android-release.yml"),
    read("scripts/run-android-emulator-e2e.sh"),
  ]);

const config = JSON.parse(rawConfig);
const EXPECTED_ID = "io.github.mykoladotsenko.turkudepartures";
const failures = [];


const signingSecretRefs = [
  "secrets.ANDROID_KEYSTORE_BASE64",
  "secrets.ANDROID_KEYSTORE_PASSWORD",
  "secrets.ANDROID_KEY_ALIAS",
  "secrets.ANDROID_KEY_PASSWORD",
];

const releaseJobEnv =
  releaseWorkflow.match(
    /\n  release:\n[\s\S]*?\n    env:\n([\s\S]*?)\n\n    steps:/m
  )?.[1] || "";

for (const secretRef of signingSecretRefs) {
  if (releaseJobEnv.includes(secretRef)) {
    failures.push(
      `Production signing secret ${secretRef} must not be exposed at job scope.`
    );
  }
}

const validationStep =
  releaseWorkflow.match(
    /- name: Validate release inputs and signing material\n([\s\S]*?)(?=\n      - name:)/
  )?.[1] || "";
for (const secretRef of signingSecretRefs) {
  if (!validationStep.includes(secretRef)) {
    failures.push(
      `Signing validation step is missing step-scoped ${secretRef}.`
    );
  }
}

const decodeStep =
  releaseWorkflow.match(
    /- name: Decode production signing key\n([\s\S]*?)(?=\n      - name:)/
  )?.[1] || "";
if (!decodeStep.includes("secrets.ANDROID_KEYSTORE_BASE64")) {
  failures.push(
    "Keystore decode step must receive ANDROID_KEYSTORE_BASE64 only at step scope."
  );
}
for (const secretRef of signingSecretRefs.slice(1)) {
  if (decodeStep.includes(secretRef)) {
    failures.push(
      `Keystore decode step must not receive unrelated signing secret ${secretRef}.`
    );
  }
}

const signStep =
  releaseWorkflow.match(
    /- name: Sign and verify exact release artifacts\n([\s\S]*?)(?=\n      - name:)/
  )?.[1] || "";
for (const secretRef of signingSecretRefs.slice(1)) {
  if (!signStep.includes(secretRef)) {
    failures.push(
      `Signing step is missing step-scoped ${secretRef}.`
    );
  }
}
if (signStep.includes("secrets.ANDROID_KEYSTORE_BASE64")) {
  failures.push(
    "Signing step must not receive the base64 keystore after it has been decoded."
  );
}

const cleanupStep =
  releaseWorkflow.match(
    /- name: Remove production signing key\n([\s\S]*?)(?=\n      - name:)/
  )?.[1] || "";
if (
  !cleanupStep.includes("if: always()") ||
  !cleanupStep.includes('rm -rf "$RUNNER_TEMP/turku-signing"')
) {
  failures.push(
    "Production signing keystore must be removed with an always-running cleanup step."
  );
}

if (config.appId !== EXPECTED_ID) {
  failures.push(
    `Capacitor appId must remain ${EXPECTED_ID}; got ${String(config.appId)}.`
  );
}
if (String(config.appId || "").startsWith("fi.turku.")) {
  failures.push("Independent app must not use the City of Turku namespace.");
}

for (const [name, source] of [
  ["debug APK workflow", apkWorkflow],
  ["Android E2E workflow", e2eWorkflow],
  ["production release workflow", releaseWorkflow],
  ["emulator E2E runner", runner],
]) {
  if (source.includes("fi.turku.folilivedepartures")) {
    failures.push(`${name} still contains the retired City-style package ID.`);
  }
}

const requiredReleaseEvidence = [
  "assembleRelease bundleRelease",
  "apksigner",
  "jarsigner",
  'jarsigner -verify -verbose "$aab"',
  "sha256sum",
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  "android-production",
  "actions: read",
  "Require successful CI for this exact master commit",
  '--arg sha "$GITHUB_SHA"',
  "select(.head_sha == $sha)",
  "adb install -r",
  'PACKAGE_ID: io.github.mykoladotsenko.turkudepartures',
  "permissions:\n  actions: read\n  contents: read\n  pull-requests: read",
  "Verify merged PR provenance before repository code",
  "/commits/$CANDIDATE_SHA/pulls",
  '.state == "closed"',
  ".merged_at != null",
  '.base.ref == "master"',
  ".merge_commit_sha == $sha",
  "publish:",
  "needs: release",
  "contents: write",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  "sha256sum -c",
  'if: inputs.publish',
  'gh release create "$tag"',
];

for (const token of requiredReleaseEvidence) {
  if (!releaseWorkflow.includes(token)) {
    failures.push(
      `Production Android workflow is missing release invariant: ${token}`
    );
  }
}

if (!runner.includes('capacitor.config.json')) {
  failures.push(
    "Android emulator E2E must derive its package ID from capacitor.config.json."
  );
}

if (releaseWorkflow.includes("jarsigner -verify -strict")) {
  failures.push(
    "AAB verification must not use jarsigner --strict because Android release certificates are normally self-signed."
  );
}

const provenanceIndex = releaseWorkflow.indexOf(
  "Verify merged PR provenance before repository code"
);
const checkoutIndex = releaseWorkflow.indexOf("Checkout verified master");
if (
  provenanceIndex < 0 ||
  checkoutIndex < 0 ||
  provenanceIndex > checkoutIndex
) {
  failures.push(
    "Production Android must verify merged-PR provenance before checking out repository code."
  );
}

const releaseJobStart = releaseWorkflow.indexOf("jobs:\n  release:");
const publishJobStart = releaseWorkflow.indexOf("\n  publish:");
if (releaseJobStart < 0 || publishJobStart < 0) {
  failures.push("Production signing and publication must be separate jobs.");
} else {
  const signingJob = releaseWorkflow.slice(releaseJobStart, publishJobStart);
  if (/contents:\s*write/.test(signingJob)) {
    failures.push(
      "Production signing/verification job must not receive contents:write."
    );
  }
}


if (failures.length > 0) {
  throw new Error(
    ["Android production-release contract failed:", ...failures.map((f) => `- ${f}`)].join(
      "\n"
    )
  );
}

console.log(
  "Android release contract verified: independent app identity, green-master gating, step-scoped signing secrets, signing-key cleanup, least-privilege signing, exact signed-APK emulator verification and immutable version publishing are enforced."
);
