import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;

/**
 * Return the merged PR that produced exactly `sha` on `branch`.
 * This intentionally accepts merge, squash, or rebase outcomes only when
 * GitHub associates the exact commit with a merged PR whose merge_commit_sha
 * is that exact commit. A merely closed/open PR or a PR into another branch
 * is not production provenance.
 */
export function findMergedPullForCommit(
  pulls,
  { sha, branch = "master", repository = "" } = {}
) {
  const exactSha = String(sha || "").toLowerCase();
  if (!SHA_RE.test(exactSha) || !Array.isArray(pulls)) return null;

  return (
    pulls.find((pull) => {
      const baseRepo = String(pull?.base?.repo?.full_name || "");
      return (
        pull?.state === "closed" &&
        Boolean(pull?.merged_at) &&
        String(pull?.base?.ref || "") === branch &&
        String(pull?.merge_commit_sha || "").toLowerCase() === exactSha &&
        (!repository || !baseRepo || baseRepo === repository)
      );
    }) || null
  );
}

export function assertMergedPullForCommit(pulls, options = {}) {
  const match = findMergedPullForCommit(pulls, options);
  if (!match) {
    throw new Error(
      `Commit ${String(options.sha || "")} is not the exact merge commit of a merged PR into ${String(options.branch || "master")}.`
    );
  }
  return match;
}

export async function fetchAssociatedPulls({
  repository,
  sha,
  token,
  fetchImpl = globalThis.fetch,
  apiUrl = "https://api.github.com",
}) {
  if (!repository || !SHA_RE.test(String(sha || ""))) {
    throw new Error("repository and an exact 40-character commit SHA are required.");
  }
  if (!token) throw new Error("A GitHub token is required for provenance verification.");
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable.");

  const response = await fetchImpl(
    `${apiUrl.replace(/\/$/, "")}/repos/${repository}/commits/${sha}/pulls`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!response.ok) {
    throw new Error(
      `GitHub provenance lookup failed with HTTP ${response.status}.`
    );
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("GitHub provenance lookup returned an unexpected payload.");
  }
  return payload;
}

export async function verifyMergedPullProvenance({
  repository,
  sha,
  branch = "master",
  token,
  fetchImpl,
  apiUrl,
}) {
  const pulls = await fetchAssociatedPulls({
    repository,
    sha,
    token,
    fetchImpl,
    apiUrl,
  });
  return assertMergedPullForCommit(pulls, { repository, sha, branch });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedPath === import.meta.url) {
  const repository = process.env.GITHUB_REPOSITORY || "";
  const sha = process.env.RELEASE_SHA || process.env.GITHUB_SHA || "";
  const branch = process.env.RELEASE_BRANCH || "master";
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

  const pull = await verifyMergedPullProvenance({
    repository,
    sha,
    branch,
    token,
  });
  console.log(
    `Verified merged-PR provenance: #${pull.number} produced ${sha} on ${branch}.`
  );
}
