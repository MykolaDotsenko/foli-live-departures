import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Stamp the built static artifact with the exact CI revision that was
 * authorized for production. The file is written after the service worker is
 * generated, so it stays network-only and can be used to detect stale Pages
 * content without changing the offline cache.
 *
 * @param {{ sha?: string, outputDir?: string }} [options]
 * @returns {Promise<string>} absolute metadata path
 */
export async function stampDeployment({
  sha = process.env.DEPLOYMENT_SHA || "",
  outputDir = process.env.DEPLOYMENT_DIR || "dist",
} = {}) {
  const normalizedSha = String(sha).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalizedSha)) {
    throw new Error("DEPLOYMENT_SHA must be an exact 40-character Git commit SHA.");
  }

  const directory = path.resolve(outputDir);
  const outputPath = path.join(directory, "deployment.json");
  await mkdir(directory, { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ schema: 1, sha: normalizedSha }, null, 2)}\n`,
    "utf8"
  );
  return outputPath;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  await stampDeployment();
}
