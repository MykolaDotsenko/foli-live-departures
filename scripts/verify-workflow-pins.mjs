import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const workflowsDir = path.resolve(".github/workflows");
const files = (await readdir(workflowsDir))
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

const violations = [];

for (const file of files) {
  const source = await readFile(path.join(workflowsDir, file), "utf8");
  const usesPattern = /^\s*uses:\s*([^@\s]+)@([^\s#]+)(?:\s+#.*)?$/gm;

  for (const match of source.matchAll(usesPattern)) {
    const action = match[1];
    const ref = match[2];

    if (action.startsWith("./")) continue;
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      violations.push(`${file}: ${action}@${ref}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    [
      "GitHub Actions must be pinned to immutable 40-character commit SHAs.",
      ...violations.map((item) => `- ${item}`),
    ].join("\n")
  );
}
