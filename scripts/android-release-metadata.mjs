import fs from "node:fs/promises";

const VERSION_CODE_RE = /(?:^|\n)Android-Version-Code:\s*(\d+)\s*(?:\n|$)/g;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const COMMIT_RE = /^[0-9a-f]{40}$/i;

export function versionCodesFromReleases(releases) {
  const values = [];
  for (const release of Array.isArray(releases) ? releases : []) {
    if (release?.draft === true || release?.prerelease === true) continue;
    if (!/^v\d+\.\d+\.\d+/.test(String(release?.tag_name || ""))) continue;
    const body = String(release?.body || "");
    VERSION_CODE_RE.lastIndex = 0;
    let match;
    while ((match = VERSION_CODE_RE.exec(body))) {
      const code = Number(match[1]);
      if (Number.isSafeInteger(code) && code > 0) values.push(code);
    }
  }
  return values;
}

export function highestPublishedVersionCode(releases) {
  const values = versionCodesFromReleases(releases);
  return values.length ? Math.max(...values) : 0;
}

export function assertIncreasingVersionCode(candidate, releases) {
  const code = Number(candidate);
  if (!Number.isSafeInteger(code) || code <= 0) {
    throw new Error("versionCode must be a positive safe integer.");
  }
  const production = (Array.isArray(releases) ? releases : []).filter(
    (release) =>
      release?.draft !== true &&
      release?.prerelease !== true &&
      /^v\d+\.\d+\.\d+/.test(String(release?.tag_name || ""))
  );
  const parsed = versionCodesFromReleases(production);
  if (production.length !== parsed.length) {
    throw new Error(
      "A published production release is missing exactly one Android-Version-Code marker; refusing to guess release ordering."
    );
  }
  const previous = highestPublishedVersionCode(production);
  if (code <= previous) {
    throw new Error(
      `versionCode ${code} must be greater than the highest published production code ${previous}.`
    );
  }
  return { candidate: code, previous };
}

function requireSha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!SHA256_RE.test(text)) throw new Error(`${label} must be a SHA-256 digest.`);
  return text;
}

export function buildReleaseMetadata({
  versionName,
  versionCode,
  commitSha,
  packageId,
  certificateSha256,
  apkSha256,
  aabSha256,
}) {
  const code = Number(versionCode);
  const version = String(versionName || "").trim();
  const commit = String(commitSha || "").trim().toLowerCase();
  const pkg = String(packageId || "").trim();

  if (!/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("versionName must be semantic version text.");
  }
  if (!Number.isSafeInteger(code) || code <= 0) {
    throw new Error("versionCode must be a positive safe integer.");
  }
  if (!COMMIT_RE.test(commit)) throw new Error("commitSha must be an exact Git SHA.");
  if (!pkg) throw new Error("packageId is required.");

  return {
    schema: 1,
    versionName: version,
    versionCode: code,
    commitSha: commit,
    packageId: pkg,
    certificateSha256: requireSha256(certificateSha256, "certificateSha256"),
    apkSha256: requireSha256(apkSha256, "apkSha256"),
    aabSha256: requireSha256(aabSha256, "aabSha256"),
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "check-version") {
    const [candidate, releasesPath] = args;
    const releases = JSON.parse(await fs.readFile(releasesPath, "utf8"));
    const result = assertIncreasingVersionCode(candidate, releases);
    console.log(
      `Android versionCode verified: ${result.candidate} > ${result.previous}.`
    );
    return;
  }

  if (command === "write") {
    const [outputPath] = args;
    if (!outputPath) throw new Error("metadata output path is required.");
    const metadata = buildReleaseMetadata({
      versionName: process.env.VERSION_NAME,
      versionCode: process.env.VERSION_CODE,
      commitSha: process.env.GITHUB_SHA,
      packageId: process.env.PACKAGE_ID,
      certificateSha256: process.env.ANDROID_CERT_SHA256,
      apkSha256: process.env.APK_SHA256,
      aabSha256: process.env.AAB_SHA256,
    });
    await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2) + "\n");
    console.log(`Wrote release metadata to ${outputPath}.`);
    return;
  }

  throw new Error("Usage: android-release-metadata.mjs check-version <code> <releases.json> | write <output.json>");
}

if (process.argv[1]?.endsWith("android-release-metadata.mjs")) {
  await main();
}
