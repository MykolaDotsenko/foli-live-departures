import { spawnSync } from "node:child_process";
import { loadProductionSiteConfig } from "./production-site-config.mjs";

const config = loadProductionSiteConfig();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SITE_URL: config.siteUrl,
    VITE_BASE_PATH: config.basePath,
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  `Built production site for ${config.siteUrl} with base path ${config.basePath}.`
);
