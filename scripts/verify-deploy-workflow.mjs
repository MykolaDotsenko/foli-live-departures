import { readFile } from "node:fs/promises";
import path from "node:path";

const workflowPath = path.resolve(".github/workflows/deploy-pages.yml");
const workflow = await readFile(workflowPath, "utf8");

const requiredTrustChecks = [
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.head_branch == 'master'",
  "github.event.workflow_run.head_repository.full_name == github.repository",
];

for (const check of requiredTrustChecks) {
  if (!workflow.includes(check)) {
    throw new Error(
      `Production deployment is missing the trust check: ${check}`
    );
  }
}

const concurrencyBlock =
  workflow.match(/concurrency:\s*\n([\s\S]*?)\n\njobs:/m)?.[1] || "";

if (!concurrencyBlock.includes("'github-pages'")) {
  throw new Error(
    "Production-eligible deploy runs no longer share the GitHub Pages concurrency group."
  );
}

for (const check of requiredTrustChecks) {
  if (!concurrencyBlock.includes(check)) {
    throw new Error(
      `Pages concurrency is missing the trust condition: ${check}`
    );
  }
}

if (
  !concurrencyBlock.includes("format('non-production-{0}', github.run_id)")
) {
  throw new Error(
    "Ineligible workflow_run events can share production concurrency and cancel a valid Pages deploy."
  );
}

if (!concurrencyBlock.includes("cancel-in-progress: true")) {
  throw new Error(
    "Production Pages concurrency no longer cancels superseded deploys."
  );
}

if (!workflow.includes("persist-credentials: false")) {
  throw new Error(
    "Production checkout persists credentials into a build that executes package scripts."
  );
}

if (
  !/permissions:\s*\n\s+contents: read\s*\n\s*\nconcurrency:/m.test(workflow)
) {
  throw new Error(
    "Workflow-level permissions must stay read-only; Pages credentials belong only to the deploy job."
  );
}

if (
  !/deploy:\s*\n\s+needs: build\s*\n\s+permissions:\s*\n\s+pages: write\s*\n\s+id-token: write/m.test(
    workflow
  )
) {
  throw new Error(
    "The deploy job must explicitly own contents:read, pages:write and id-token:write permissions."
  );
}


const buildIndex = workflow.indexOf("run: npm run build");
const stampIndex = workflow.indexOf("run: npm run stamp:deployment");
const uploadIndex = workflow.indexOf("uses: actions/upload-pages-artifact@");

if (
  buildIndex < 0 ||
  stampIndex <= buildIndex ||
  uploadIndex <= stampIndex ||
  !workflow.includes(
    "DEPLOYMENT_SHA: ${{ github.event.workflow_run.head_sha }}"
  )
) {
  throw new Error(
    "Production artifact must stamp the exact verified CI SHA after build and before upload."
  );
}

const deployActionIndex = workflow.indexOf("uses: actions/deploy-pages@");
const liveSmokeIndex = workflow.indexOf(
  "run: npm run verify:production-site"
);

if (deployActionIndex < 0 || liveSmokeIndex <= deployActionIndex) {
  throw new Error(
    "Production workflow has no post-deploy live site verification."
  );
}

for (const required of [
  "PRODUCTION_SITE_URL: ${{ steps.deployment.outputs.page_url }}",
  "EXPECTED_DEPLOYMENT_SHA: ${{ github.event.workflow_run.head_sha }}",
]) {
  if (!workflow.includes(required)) {
    throw new Error(`Production live smoke is missing: ${required}`);
  }
}

const exactCheckoutRefs =
  workflow.match(
    /ref: \${{ github\.event\.workflow_run\.head_sha }}/g
  ) || [];
const nonPersistentCheckouts =
  workflow.match(/persist-credentials: false/g) || [];

if (exactCheckoutRefs.length < 2 || nonPersistentCheckouts.length < 2) {
  throw new Error(
    "Both production build and post-deploy smoke must checkout the exact verified revision without persisted credentials."
  );
}
