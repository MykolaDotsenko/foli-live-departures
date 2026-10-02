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
  !/permissions:\s*\n\s+contents: read\s*\n\s+pull-requests: read\s*\n\s*\nconcurrency:/m.test(workflow)
) {
  throw new Error(
    "Workflow-level permissions must stay read-only (contents and pull-request metadata); Pages credentials belong only to the deploy job."
  );
}

if (
  !/deploy:\s*\n\s+needs: build\s*\n\s+permissions:\s*\n\s+pages: write\s*\n\s+id-token: write\s*\n\s+outputs:\s*\n\s+page_url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/m.test(
    workflow
  )
) {
  throw new Error(
    "The deploy job must own only pages:write/id-token:write and expose the resulting page URL."
  );
}

if (
  !/smoke:\s*\n\s+needs: deploy\s*\n\s+permissions:\s*\n\s+contents: read/m.test(
    workflow
  )
) {
  throw new Error(
    "The post-deploy smoke must run in its own read-only contents job."
  );
}


const provenanceIndex = workflow.indexOf(
  "Verify merged PR provenance before repository code"
);
const firstCheckoutIndex = workflow.indexOf("Checkout verified revision");
for (const required of [
  "/commits/$CANDIDATE_SHA/pulls",
  '.state == "closed"',
  ".merged_at != null",
  '.base.ref == "master"',
  ".merge_commit_sha == $sha",
]) {
  if (!workflow.includes(required)) {
    throw new Error(`Pages release provenance is missing: ${required}`);
  }
}
if (
  provenanceIndex < 0 ||
  firstCheckoutIndex < 0 ||
  provenanceIndex > firstCheckoutIndex
) {
  throw new Error(
    "Pages must verify merged-PR provenance before checking out repository code."
  );
}

if (!workflow.includes("run: npm run build:production-site")) {
  throw new Error(
    "Production Pages must build through config/production-site.json rather than a hardcoded base path."
  );
}
if (/VITE_BASE_PATH:\s*\/foli-live-departures\//.test(workflow)) {
  throw new Error(
    "Production Pages workflow still hardcodes the project base path instead of the versioned production-site config."
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
  "PRODUCTION_SITE_URL: ${{ needs.deploy.outputs.page_url }}",
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


const deployJob =
  workflow.match(/\n  deploy:\n([\s\S]*?)(?=\n  smoke:\n)/m)?.[1] || "";
const smokeJob =
  workflow.match(/\n  smoke:\n([\s\S]*)$/m)?.[1] || "";

if (
  deployJob.includes("actions/checkout@") ||
  deployJob.includes("actions/setup-node@") ||
  /\n\s+-?\s*run:/m.test(deployJob)
) {
  throw new Error(
    "The privileged Pages deploy job must not checkout or execute repository code."
  );
}

for (const required of [
  "needs: deploy",
  "permissions:\n      contents: read",
  "run: npm run verify:production-site",
  "PRODUCTION_SITE_URL: ${{ needs.deploy.outputs.page_url }}",
]) {
  if (!smokeJob.includes(required)) {
    throw new Error(
      `Read-only production smoke job is missing: ${required}`
    );
  }
}
