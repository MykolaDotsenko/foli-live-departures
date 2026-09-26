import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Normalized exactly as in vite.config.js and scripts/build-sw.mjs, so the
// gate checks the build it is given: "/" by default, and the GitHub Pages
// subpath that production actually ships under.
const configuredBasePath = String(process.env.VITE_BASE_PATH || "/").trim();
const baseWithLeadingSlash = configuredBasePath.startsWith("/")
  ? configuredBasePath
  : `/${configuredBasePath}`;
const BASE_PATH = baseWithLeadingSlash.endsWith("/")
  ? baseWithLeadingSlash
  : `${baseWithLeadingSlash}/`;

const distDir = path.resolve("dist");
const assetsDir = path.join(distDir, "assets");
const sw = await readFile(path.join(distDir, "sw.js"), "utf8");
const assets = await readdir(assetsDir);

if (!sw.includes('const PRECACHE_URLS = [')) {
  throw new Error("Generated service worker has no precache manifest.");
}

if (!sw.includes(JSON.stringify(BASE_PATH))) {
  throw new Error("Generated service worker does not precache the app shell.");
}

for (const asset of assets) {
  if (!sw.includes(`${BASE_PATH}assets/${asset}`)) {
    throw new Error(`Generated service worker does not precache ${asset}.`);
  }
}

// The page tells an offline reopen apart by looking for a marker the worker
// files when it serves the cached shell. The two only agree if both put it
// under the same base path.
const markerUrl = sw.match(/const OFFLINE_MARKER_URL = `([^`]+)`;/)?.[1];

if (!markerUrl?.startsWith(BASE_PATH)) {
  throw new Error(
    "Generated service worker does not file the offline-shell marker under the base path."
  );
}

const scripts = await Promise.all(
  assets
    .filter((asset) => asset.endsWith(".js"))
    .map((asset) => readFile(path.join(assetsDir, asset), "utf8"))
);

if (!scripts.some((source) => source.includes(markerUrl))) {
  throw new Error(
    `The app never looks for the offline-shell marker at ${markerUrl}, so an offline reopen goes unnoticed.`
  );
}

// The home-screen tile, the install prompt and the iPhone icon come from these
// files. Chrome's install criteria ask for 192 and 512 pixel icons, not every
// platform rasterizes an SVG, and an icon marked both "any" and "maskable" is
// either clipped by the launcher's mask or shown with a margin everywhere
// else, so each purpose gets its own PNG.
const manifest = JSON.parse(
  await readFile(path.join(distDir, "manifest.webmanifest"), "utf8")
);
const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const purposesOf = (icon) => String(icon.purpose || "any").trim().split(/\s+/);
const requiredIcons = [
  ["192x192", "any"],
  ["512x512", "any"],
  ["512x512", "maskable"],
];

for (const [size, purpose] of requiredIcons) {
  const found = icons.some(
    (icon) =>
      icon.type === "image/png" &&
      String(icon.sizes || "").split(/\s+/).includes(size) &&
      purposesOf(icon).includes(purpose)
  );
  if (!found) {
    throw new Error(`The manifest has no ${size} PNG icon for purpose "${purpose}".`);
  }
}

for (const icon of icons) {
  const purposes = purposesOf(icon);
  if (purposes.includes("any") && purposes.includes("maskable")) {
    throw new Error(`Manifest icon ${icon.src} is marked both "any" and "maskable".`);
  }
}

const html = await readFile(path.join(distDir, "index.html"), "utf8");
const touchIcon = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1];

if (!touchIcon?.startsWith(BASE_PATH)) {
  throw new Error("The page links no apple-touch-icon under the base path.");
}

// The manifest sits at the base path, so its relative sources resolve there.
const iconUrls = [
  ...icons.map((icon) => `${BASE_PATH}${String(icon.src).replace(/^\.?\//, "")}`),
  touchIcon,
];

for (const url of iconUrls) {
  const relative = url.slice(BASE_PATH.length);
  try {
    await readFile(path.join(distDir, relative));
  } catch {
    throw new Error(`Icon ${url} is referenced but missing from the build.`);
  }
  if (!sw.includes(JSON.stringify(url))) {
    throw new Error(
      `Generated service worker does not precache ${url}, so the installed app loses it offline.`
    );
  }
}

// A shared link is the app's first impression. Scrapers need absolute URLs,
// and an image that is actually there.
const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
if (!/^https:\/\/[^%]+\/social-card\.jpg$/.test(ogImage || "")) {
  throw new Error(`The link preview image is not an absolute URL: ${ogImage}`);
}
if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) {
  throw new Error("The page has no large link-preview card for X/Twitter.");
}
try {
  await readFile(path.join(distDir, "social-card.jpg"));
} catch {
  throw new Error("The link preview image is missing from the build.");
}
if (sw.includes("social-card.jpg")) {
  throw new Error("The link preview image is precached, adding its weight to every install.");
}

// Android's fuller install sheet shows these. They must be in the build, a
// phone one and a laptop one at least, and not precached.
const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
for (const formFactor of ["narrow", "wide"]) {
  if (!screenshots.some((shot) => shot.form_factor === formFactor)) {
    throw new Error(`The manifest has no ${formFactor} screenshot for the install sheet.`);
  }
}
for (const shot of screenshots) {
  const relative = String(shot.src).replace(/^\.?\//, "");
  try {
    await readFile(path.join(distDir, relative));
  } catch {
    throw new Error(`Install screenshot ${shot.src} is missing from the build.`);
  }
  if (sw.includes(relative)) {
    throw new Error(`Install screenshot ${shot.src} is precached, adding its weight to every install.`);
  }
}

if (!sw.includes('caches.match(request, { ignoreVary: true })')) {
  throw new Error(
    "Generated service worker does not ignore Vary for same-origin precached assets."
  );
}

if (!sw.includes('caches.match(SHELL_URL, { ignoreVary: true })')) {
  throw new Error(
    "Generated service worker does not ignore Vary for the offline navigation shell."
  );
}

if (!sw.includes("settleWithin(network, NAVIGATION_TIMEOUT_MS)")) {
  throw new Error(
    "Generated service worker waits on a stalled network forever instead of opening the cached shell."
  );
}

if (!sw.includes('self.addEventListener("notificationclick"')) {
  throw new Error(
    "Generated service worker does not handle notification taps, so a get-off alert cannot reopen the app."
  );
}

if (!sw.includes('foli-claim-clients')) {
  throw new Error(
    "Generated service worker cannot take over a page that reloaded during install, so that visit has no offline shell."
  );
}
