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

if (failures.length > 0) {
  throw new Error(
    ["Android production-release contract failed:", ...failures.map((f) => `- ${f}`)].join(
      "\n"
    )
  );
}

console.log(
  "Android release contract verified: independent app identity, persistent signing inputs, exact signed-APK emulator verification and immutable version publishing are enforced."
);
