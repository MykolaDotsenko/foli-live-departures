import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMergedPullForCommit,
  findMergedPullForCommit,
  verifyMergedPullProvenance,
} from "./release-provenance.mjs";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

function pr(overrides = {}) {
  return {
    number: 137,
    state: "closed",
    merged_at: "2026-10-02T10:00:00Z",
    merge_commit_sha: SHA,
    base: {
      ref: "master",
      repo: { full_name: "MykolaDotsenko/foli-live-departures" },
    },
    ...overrides,
  };
}

test("accepts only the exact merged PR commit into master", () => {
  assert.equal(
    findMergedPullForCommit([pr()], {
      sha: SHA,
      branch: "master",
      repository: "MykolaDotsenko/foli-live-departures",
    })?.number,
    137
  );
});

test("rejects open, unmerged, wrong-branch and wrong-SHA associations", () => {
  const cases = [
    pr({ state: "open", merged_at: null }),
    pr({ merged_at: null }),
    pr({ base: { ref: "develop", repo: { full_name: "MykolaDotsenko/foli-live-departures" } } }),
    pr({ merge_commit_sha: OTHER }),
  ];
  for (const candidate of cases) {
    assert.equal(
      findMergedPullForCommit([candidate], { sha: SHA, branch: "master" }),
      null
    );
  }
});

test("rejects malformed candidate SHAs fail closed", () => {
  assert.equal(findMergedPullForCommit([pr()], { sha: "abc" }), null);
  assert.throws(
    () => assertMergedPullForCommit([pr()], { sha: OTHER, branch: "master" }),
    /not the exact merge commit/
  );
});

test("network verifier checks the same exact provenance contract", async () => {
  const seen = [];
  const match = await verifyMergedPullProvenance({
    repository: "MykolaDotsenko/foli-live-departures",
    sha: SHA,
    branch: "master",
    token: "test-token",
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return [pr()];
        },
      };
    },
  });
  assert.equal(match.number, 137);
  assert.match(seen[0].url, new RegExp(`/commits/${SHA}/pulls$`));
  assert.equal(seen[0].init.headers.Authorization, "Bearer test-token");
});

test("network verifier fails closed on API errors and malformed payloads", async () => {
  await assert.rejects(
    verifyMergedPullProvenance({
      repository: "MykolaDotsenko/foli-live-departures",
      sha: SHA,
      token: "x",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    /HTTP 403/
  );
  await assert.rejects(
    verifyMergedPullProvenance({
      repository: "MykolaDotsenko/foli-live-departures",
      sha: SHA,
      token: "x",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {};
        },
      }),
    }),
    /unexpected payload/
  );
});
