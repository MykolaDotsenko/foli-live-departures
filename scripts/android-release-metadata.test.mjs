import assert from "node:assert/strict";
import test from "node:test";
import {
  assertIncreasingVersionCode,
  buildReleaseMetadata,
  highestPublishedVersionCode,
  versionCodesFromReleases,
} from "./android-release-metadata.mjs";

const releases = [
  {
    tag_name: "v1.0.0",
    draft: false,
    prerelease: false,
    body: "Production release\nAndroid-Version-Code: 7\n",
  },
  {
    tag_name: "v1.1.0",
    draft: false,
    prerelease: false,
    body: "Android-Version-Code: 12\n",
  },
  {
    tag_name: "android-latest",
    draft: false,
    prerelease: true,
    body: "Android-Version-Code: 999\n",
  },
  {
    tag_name: "v2.0.0",
    draft: true,
    prerelease: false,
    body: "Android-Version-Code: 100\n",
  },
];

test("extracts only published production version codes", () => {
  assert.deepEqual(versionCodesFromReleases(releases), [7, 12]);
  assert.equal(highestPublishedVersionCode(releases), 12);
});

test("requires a strictly increasing versionCode", () => {
  assert.deepEqual(assertIncreasingVersionCode(13, releases), {
    candidate: 13,
    previous: 12,
  });
  assert.throws(() => assertIncreasingVersionCode(12, releases), /greater than/);
  assert.throws(() => assertIncreasingVersionCode(0, releases), /positive/);
});

test("metadata captures immutable release identity", () => {
  const metadata = buildReleaseMetadata({
    versionName: "1.2.3",
    versionCode: 13,
    commitSha: "a".repeat(40),
    packageId: "io.github.mykoladotsenko.turkudepartures",
    certificateSha256: "b".repeat(64),
    apkSha256: "c".repeat(64),
    aabSha256: "d".repeat(64),
  });

  assert.deepEqual(metadata, {
    schema: 1,
    versionName: "1.2.3",
    versionCode: 13,
    commitSha: "a".repeat(40),
    packageId: "io.github.mykoladotsenko.turkudepartures",
    certificateSha256: "b".repeat(64),
    apkSha256: "c".repeat(64),
    aabSha256: "d".repeat(64),
  });
});

test("metadata rejects malformed immutable identifiers", () => {
  const valid = {
    versionName: "1.0.0",
    versionCode: 1,
    commitSha: "a".repeat(40),
    packageId: "io.github.mykoladotsenko.turkudepartures",
    certificateSha256: "b".repeat(64),
    apkSha256: "c".repeat(64),
    aabSha256: "d".repeat(64),
  };
  assert.throws(
    () => buildReleaseMetadata({ ...valid, commitSha: "abc" }),
    /exact Git SHA/
  );
  assert.throws(
    () => buildReleaseMetadata({ ...valid, apkSha256: "bad" }),
    /SHA-256/
  );
});
