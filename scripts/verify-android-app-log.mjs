import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find a fatal AndroidRuntime block that belongs to the app package.
 * System/test-harness crashes (for example UiAutomation) are not app crashes.
 *
 * @param {string} log
 * @param {string} packageName
 * @returns {{line: number, block: string} | null}
 */
export function findFatalAppCrash(log, packageName) {
  const text = String(log || "");
  const pkg = String(packageName || "").trim();
  if (!pkg) throw new Error("packageName is required.");

  const lines = text.split(/\r?\n/);
  const processPattern = new RegExp(
    `\\bProcess:\\s*${escapeRegExp(pkg)}(?:,|\\s|$)`
  );

  for (let index = 0; index < lines.length; index += 1) {
    if (!/FATAL EXCEPTION:/.test(lines[index])) continue;

    const end = Math.min(lines.length, index + 8);
    const blockLines = lines.slice(index, end);
    if (blockLines.some((line) => processPattern.test(line))) {
      return { line: index + 1, block: blockLines.join("\n") };
    }
  }

  return null;
}

export function assertNoFatalAppCrash(log, packageName) {
  const crash = findFatalAppCrash(log, packageName);
  if (!crash) return;
  throw new Error(
    `Detected fatal Android runtime crash for ${packageName} near log line ${crash.line}:\n${crash.block}`
  );
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invoked === import.meta.url) {
  const [logPath, packageName] = process.argv.slice(2);
  if (!logPath || !packageName) {
    throw new Error(
      "Usage: verify-android-app-log.mjs <logcat.txt> <package-name>"
    );
  }
  const log = fs.readFileSync(logPath, "utf8");
  assertNoFatalAppCrash(log, packageName);
  console.log(`No fatal Android runtime crash detected for ${packageName}.`);
}
