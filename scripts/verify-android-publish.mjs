import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  readFile(path.resolve(root, relativePath), "utf8");

const [buildWorkflow, e2eWorkflow, publishWorkflow] = await Promise.all([
  read(".github/workflows/android-apk.yml"),
  read(".github/workflows/android-e2e.yml"),
  read(".github/workflows/android-publish.yml"),
]);

const failures = [];

if (!/^permissions:\n  contents: read$/m.test(buildWorkflow)) {
  failures.push("Android APK build workflow must stay read-only.");
}
for (const [name, workflow] of [
  ["Android APK build", buildWorkflow],
  ["Android E2E", e2eWorkflow],
]) {
  if (!workflow.includes('      - "capacitor.config.json"')) {
    failures.push(
      `${name} workflow must rerun when canonical capacitor.config.json changes.`
    );
  }
}

if (buildWorkflow.includes("gh release create")) {
  failures.push(
    "Android APK build workflow must not publish directly; publication must follow E2E."
  );
}

const requiredPublishEvidence = [
  'workflows: ["Android APK E2E"]',
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.head_branch == 'master'",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "actions: read",
  "contents: write",
  "github.event.workflow_run.id",
  "--name android-e2e-evidence",
  "android/app/build/outputs/apk/debug/app-debug.apk",
  "sha256sum -c apk-sha256.txt",
  "github.event.workflow_run.head_sha",
  'gh release view "$tag" --repo "$GITHUB_REPOSITORY"',
  'gh release delete "$tag" --repo "$GITHUB_REPOSITORY"',
  'gh release create "$tag"',
  '--repo "$GITHUB_REPOSITORY"',
];

for (const token of requiredPublishEvidence) {
  if (!publishWorkflow.includes(token)) {
    failures.push(`Android test publication is missing invariant: ${token}`);
  }
}

if (!e2eWorkflow.includes("name: android-e2e-evidence")) {
  failures.push(
    "Android E2E must upload the exact tested APK in android-e2e-evidence."
  );
}

if (failures.length) {
  throw new Error(
    ["Android tested-artifact publication contract failed:", ...failures.map((f) => `- ${f}`)].join(
      "\n"
    )
  );
}

console.log(
  "Android test publication contract verified: read-only builds cannot publish, and android-latest can only use the exact APK from a successful trusted master Android E2E run."
);
