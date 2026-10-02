import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFile(path.resolve(root, relativePath), "utf8");

const workflows = {
  pages: await read(".github/workflows/deploy-pages.yml"),
  androidLatest: await read(".github/workflows/android-publish.yml"),
  androidProduction: await read(".github/workflows/android-release.yml"),
};

const failures = [];
const requiredTokens = [
  "Verify merged PR provenance before repository code",
  "/commits/$CANDIDATE_SHA/pulls",
  '.state == "closed"',
  ".merged_at != null",
  '.base.ref == "master"',
  ".merge_commit_sha == $sha",
];

for (const [name, source] of Object.entries(workflows)) {
  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      failures.push(`${name} workflow is missing provenance invariant: ${token}`);
    }
  }
}

const pagesCheck = workflows.pages.indexOf(
  "Verify merged PR provenance before repository code"
);
const pagesCheckout = workflows.pages.indexOf("Checkout verified revision");
if (pagesCheck < 0 || pagesCheckout < 0 || pagesCheck > pagesCheckout) {
  failures.push("Pages must verify PR provenance before checkout/build execution.");
}

const androidLatestCheck = workflows.androidLatest.indexOf(
  "Verify merged PR provenance before repository code"
);
const androidLatestDownload = workflows.androidLatest.indexOf(
  "Download the exact APK exercised by Android E2E"
);
if (
  androidLatestCheck < 0 ||
  androidLatestDownload < 0 ||
  androidLatestCheck > androidLatestDownload
) {
  failures.push(
    "android-latest must verify PR provenance before downloading/publishing the tested artifact."
  );
}

const androidProductionCheck = workflows.androidProduction.indexOf(
  "Verify merged PR provenance before repository code"
);
const androidProductionCheckout = workflows.androidProduction.indexOf(
  "Checkout verified master"
);
if (
  androidProductionCheck < 0 ||
  androidProductionCheckout < 0 ||
  androidProductionCheck > androidProductionCheckout
) {
  failures.push(
    "Production Android must verify PR provenance before checking out repository code."
  );
}

if (failures.length) {
  throw new Error(
    ["Release provenance workflow contract failed:", ...failures.map((item) => `- ${item}`)].join("\n")
  );
}

console.log(
  "Release provenance contract verified: production web and Android publication paths require the exact merge commit of a merged PR into master before repository code is executed."
);
