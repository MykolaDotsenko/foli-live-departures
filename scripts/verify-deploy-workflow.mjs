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
    "The deploy job must explicitly own pages:write and id-token:write permissions."
  );
}
