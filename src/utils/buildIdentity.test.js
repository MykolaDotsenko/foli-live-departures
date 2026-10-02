import { expect, test } from "vitest";
import { BUILD_IDENTITY, normalizeBuildIdentity } from "./buildIdentity";

test("normalizes an exact release identity without losing the diagnostic SHA", () => {
  const identity = normalizeBuildIdentity({
    version: " 1.2.3-rc.1 ",
    sha: "A".repeat(40),
    native: true,
  });

  expect(identity).toEqual({
    version: "1.2.3-rc.1",
    sha: "a".repeat(40),
    shortSha: "a".repeat(12),
    platform: "android",
  });
});

test("fails closed for malformed revisions and bounds display metadata", () => {
  const identity = normalizeBuildIdentity({
    version: "x".repeat(100),
    sha: "not-a-git-sha",
    platform: "web",
  });

  expect(identity.version).toHaveLength(64);
  expect(identity.sha).toBe("");
  expect(identity.shortSha).toBe("");
  expect(identity.platform).toBe("web");
});

test("uses the package version as the default Vite build version", () => {
  expect(BUILD_IDENTITY.version).toBe("0.1.0");
  expect(BUILD_IDENTITY.platform).toBe("web");
});
