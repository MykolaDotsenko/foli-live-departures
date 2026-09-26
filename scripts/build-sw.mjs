import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const SW_PATH = path.join(DIST_DIR, "sw.js");
const configuredBasePath = String(process.env.VITE_BASE_PATH || "/").trim();
const baseWithLeadingSlash = configuredBasePath.startsWith("/")
  ? configuredBasePath
  : `/${configuredBasePath}`;
const BASE_PATH = baseWithLeadingSlash.endsWith("/")
  ? baseWithLeadingSlash
  : `${baseWithLeadingSlash}/`;
const withBasePath = (relativePath = "") =>
  `${BASE_PATH}${String(relativePath).replace(/^\/+/, "")}`;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

// Fetched by link previews and by the install sheet, never by the app:
// precaching them would add their weight to every install for nothing.
const NOT_PRECACHED = new Set(["social-card.jpg"]);
const NOT_PRECACHED_DIRS = ["screenshots/"];

const allFiles = (await listFiles(DIST_DIR))
  .filter((file) => file !== SW_PATH)
  .filter((file) => !file.endsWith(".map"))
  .filter((file) => {
    const relative = path.relative(DIST_DIR, file).replaceAll(path.sep, "/");
    return (
      !NOT_PRECACHED.has(relative) &&
      !NOT_PRECACHED_DIRS.some((dir) => relative.startsWith(dir))
    );
  })
  .sort();

const hash = createHash("sha256");
for (const file of allFiles) {
  const relative = path.relative(DIST_DIR, file).replaceAll(path.sep, "/");
  hash.update(relative);
  hash.update(await readFile(file));
}

const cacheName = `foli-shell-${hash.digest("hex").slice(0, 12)}`;
const precacheUrls = [
  BASE_PATH,
  ...allFiles
    .map((file) => path.relative(DIST_DIR, file).replaceAll(path.sep, "/"))
    .filter((relative) => relative !== "index.html")
    .map((relative) => withBasePath(relative)),
];

const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = "foli-shell-";
const BASE_PATH = ${JSON.stringify(BASE_PATH)};
const SHELL_URL = BASE_PATH;
const OFFLINE_MARKER_URL = \`${BASE_PATH}__foli_offline_shell__\`;
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function markOfflineShell(offline) {
  const cache = await caches.open(CACHE_NAME);

  if (offline) {
    await cache.put(
      OFFLINE_MARKER_URL,
      new Response("offline", {
        headers: { "Content-Type": "text/plain" },
      })
    );
  } else {
    await cache.delete(OFFLINE_MARKER_URL);
  }
}

// A stalled connection (one bar of signal, a captive portal) does not fail,
// it just never answers, and only a failure reached the cached shell: the
// page stayed blank until the browser gave up, exactly when Get me Home
// matters most. Past this wait the saved shell opens instead, and the page
// then checks the connection for itself.
const NAVIGATION_TIMEOUT_MS = 4000;

function settleWithin(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function offlineResponse() {
  return new Response("", {
    status: 504,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const network = fetch(request);
        try {
          const response = await settleWithin(network, NAVIGATION_TIMEOUT_MS);
          if (response) {
            await markOfflineShell(false);
            return response;
          }

          // Still waiting. Not marked as offline: the connection may yet
          // work, and the page decides that with its own check.
          const shell = await caches.match(SHELL_URL, { ignoreVary: true });
          if (shell) {
            network.catch(() => {});
            return shell;
          }
          return await network;
        } catch {
          await markOfflineShell(true);
          const shell = await caches.match(SHELL_URL, { ignoreVary: true });
          // Never resolve respondWith with undefined: that turns a handled
          // offline navigation into a browser network error.
          return shell || offlineResponse();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;

      try {
        return await fetch(request);
      } catch {
        return offlineResponse();
      }
    })()
  );
});

// A get-off alert is shown by the service worker, so the tap that follows is
// delivered here and nowhere else. Without this the passenger taps "Get off
// now" on a locked phone and nothing opens: they still have to unlock, find
// the browser and find the tab, in the seconds the alert exists to save.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(BASE_PATH);
    })()
  );
});

// A reload that commits while the first install is still running lands on a
// document this worker never claimed: activation, and the claim with it,
// already happened for a page that no longer exists. Nothing claims the new
// one, so that whole visit runs with no offline shell. The page notices and
// asks; claiming an already-activated worker's client is cheap and safe.
self.addEventListener("message", (event) => {
  if (event.data?.type === "foli-claim-clients") {
    event.waitUntil(self.clients.claim());
  }
});
`;

await writeFile(SW_PATH, serviceWorker, "utf8");
