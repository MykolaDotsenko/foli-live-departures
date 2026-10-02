import fs from "node:fs";
import { URL } from "node:url";
import CDP from "chrome-remote-interface";

const host = process.env.CDP_HOST || "127.0.0.1";
const port = Number(process.env.CDP_PORT || 9222);
const results = {
  startedAt: new Date().toISOString(),
  checks: [],
  capabilities: {},
  consoleErrors: [],
  exceptions: [],
  failedRequests: [],
  placeProviderRequests: [],
};

function record(name, passed, details = {}) {
  results.checks.push({ name, passed, ...details });
  const marker = passed ? "PASS" : "FAIL";
  console.log(`[${marker}] ${name}`, details);
  if (!passed) {
    throw new Error(`${name} failed: ${JSON.stringify(details)}`);
  }
}

const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

async function retry(label, fn, {
  attempts = 30,
  delayMs = 1000,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await fn();
      if (value) return value;
      lastError = new Error(`${label} returned a falsy value`);
    } catch (error) {
      lastError = error;
    }
    await sleep(delayMs);
  }
  throw new Error(`${label} timed out: ${lastError?.message || "unknown error"}`);
}

const session = await retry(
  "WebView CDP session",
  async () => {
    const list = await CDP.List({ host, port });
    const target =
      list.find(
        (candidate) =>
          candidate.type === "page" &&
          String(candidate.url || "").startsWith("https://localhost")
      ) ||
      list.find((candidate) => candidate.type === "page") ||
      null;

    if (!target) return null;

    let candidateClient = null;
    try {
      candidateClient = await CDP({ host, port, target, local: true });
      const { Runtime, Network, Log } = candidateClient;
      await Promise.all([Runtime.enable(), Network.enable(), Log.enable()]);
      return {
        target,
        client: candidateClient,
        Runtime,
        Network,
      };
    } catch (error) {
      try {
        await candidateClient?.close();
      } catch {
        // Best-effort cleanup before retrying a WebView that restarted.
      }
      throw error;
    }
  },
  { attempts: 12, delayMs: 1000 }
);

const {
  target: targets,
  client,
  Runtime,
  Network,
} = session;

console.log("CDP target:", {
  id: targets.id,
  title: targets.title,
  url: targets.url,
  type: targets.type,
});

Runtime.consoleAPICalled(({ type, args }) => {
  if (type !== "error") return;
  results.consoleErrors.push({
    type,
    values: args.map((arg) => arg.value ?? arg.description ?? "").filter(Boolean),
  });
});

Runtime.exceptionThrown(({ exceptionDetails }) => {
  results.exceptions.push({
    text: exceptionDetails.text,
    url: exceptionDetails.url,
    lineNumber: exceptionDetails.lineNumber,
    columnNumber: exceptionDetails.columnNumber,
    exception:
      exceptionDetails.exception?.description ||
      exceptionDetails.exception?.value ||
      null,
  });
});

// Native production stays under the same dormant-provider boundary as the PWA:
 // even a packaged WebView must never contact Nominatim while direct place
 // search is disabled and omitted from the shipped CSP.
Network.requestWillBeSent(({ request }) => {
  const url = String(request?.url || "");
  if (url.startsWith("https://nominatim.openstreetmap.org/")) {
    results.placeProviderRequests.push(url);
  }
});

Network.loadingFailed((event) => {
  results.failedRequests.push({
    requestId: event.requestId,
    errorText: event.errorText,
    canceled: Boolean(event.canceled),
    blockedReason: event.blockedReason || null,
  });
});

async function evaluate(expression, { awaitPromise = false } = {}) {
  const response = await Runtime.evaluate({
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });

  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ||
      response.exceptionDetails.text ||
      "Runtime.evaluate failed"
    );
  }
  return response.result.value;
}

await retry("app DOM ready", async () => {
  const ready = await evaluate(
    `document.readyState === "complete" && document.body && document.body.innerText.trim().length > 20`
  );
  return ready;
});

const initial = await evaluate(`(() => {
  const form = document.querySelector('form[data-stop-search-form="true"]');
  const input =
    form?.querySelector('input[role="combobox"]') ||
    form?.querySelector('input[type="search"]') ||
    form?.querySelector("input");
  const submit = form?.querySelector('button[type="submit"]');

  return {
    url: location.href,
    title: document.title,
    hasForm: Boolean(form),
    hasSearchInput: Boolean(input),
    hasSubmit: Boolean(submit),
    submitDisabled: Boolean(submit?.disabled),
    inputCount: document.querySelectorAll("input").length,
    buttonCount: document.querySelectorAll("button").length
  };
})()`);

record(
  "cold start renders the stop-search product UI",
  /^Turku Departures\b/i.test(initial.title) &&
    initial.hasForm === true &&
    initial.hasSearchInput === true &&
    initial.hasSubmit === true &&
    initial.submitDisabled === false,
  initial
);

results.capabilities = await evaluate(`({
  geolocation: Boolean(navigator.geolocation),
  notifications: "Notification" in globalThis,
  serviceWorker: "serviceWorker" in navigator,
  wakeLock: Boolean(navigator.wakeLock),
  speechSynthesis: "speechSynthesis" in globalThis,
  share: Boolean(navigator.share),
  vibration: Boolean(navigator.vibrate),
  online: navigator.onLine,
  userAgent: navigator.userAgent
})`);
console.log("Android WebView capabilities:", results.capabilities);

record("geolocation API is exposed", results.capabilities.geolocation === true);
record("app starts online", results.capabilities.online === true);

const ukrainianLocale = await retry(
  "Android Ukrainian locale switch",
  async () => {
    const switched = await evaluate(`(() => {
      const findButton = (label) =>
        [...document.querySelectorAll("button")].find(
          (button) => (button.textContent || "").trim() === label
        );

      const lang = document.documentElement.lang || "";
      if (lang === "en") {
        const toFinnish = findButton("Suomeksi");
        if (!toFinnish) return { ready: false, lang, reason: "missing-Suomeksi" };
        toFinnish.click();
        return { ready: false, lang, action: "to-fi" };
      }
      if (lang === "fi") {
        const toUkrainian = findButton("Українською");
        if (!toUkrainian) {
          return { ready: false, lang, reason: "missing-Ukrainian-switch" };
        }
        toUkrainian.click();
        return { ready: false, lang, action: "to-uk" };
      }

      return {
        ready:
          lang === "uk" &&
          localStorage.getItem("foli-language-v1") === "uk" &&
          Boolean(findButton("På svenska")),
        lang,
        stored: localStorage.getItem("foli-language-v1"),
        body: document.body.innerText.slice(0, 800)
      };
    })()`);
    return switched?.ready ? switched : null;
  },
  { attempts: 30, delayMs: 250 }
);
record(
  "Android can select Ukrainian through the production language registry",
  ukrainianLocale?.lang === "uk" && ukrainianLocale?.stored === "uk",
  ukrainianLocale || {}
);

await evaluate("location.reload(); true");
const ukrainianReload = await retry(
  "Android Ukrainian locale reload",
  async () => {
    const snapshot = await evaluate(`(() => ({
      ready: document.readyState === "complete",
      lang: document.documentElement.lang || "",
      stored: localStorage.getItem("foli-language-v1"),
      hasSwedishSwitch: [...document.querySelectorAll("button")].some(
        (button) => (button.textContent || "").trim() === "På svenska"
      ),
      hasUkrainianUi:
        /Виберіть автобусну зупинку|Знайти найближчу зупинку|Відправлення/.test(
          document.body.innerText
        )
    }))()`);
    return snapshot.ready &&
      snapshot.lang === "uk" &&
      snapshot.stored === "uk" &&
      snapshot.hasSwedishSwitch &&
      snapshot.hasUkrainianUi
      ? snapshot
      : null;
  },
  { attempts: 30, delayMs: 250 }
);
record(
  "Ukrainian locale persists across Android WebView reload",
  ukrainianReload?.lang === "uk" &&
    ukrainianReload?.stored === "uk" &&
    ukrainianReload?.hasUkrainianUi === true,
  ukrainianReload || {}
);

const switchedToSwedish = await retry(
  "Android Swedish locale switch",
  async () => {
    const snapshot = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => (candidate.textContent || "").trim() === "På svenska"
      );
      if (document.documentElement.lang === "uk" && button) {
        button.click();
        return null;
      }
      return {
        lang: document.documentElement.lang || "",
        stored: localStorage.getItem("foli-language-v1"),
        hasEnglishSwitch: [...document.querySelectorAll("button")].some(
          (candidate) => (candidate.textContent || "").trim() === "In English"
        ),
        hasSwedishUi:
          /Välj en busshållplats|Hitta närmaste hållplats|Avgår/.test(
            document.body.innerText
          )
      };
    })()`);
    return snapshot?.lang === "sv" &&
      snapshot?.stored === "sv" &&
      snapshot?.hasEnglishSwitch &&
      snapshot?.hasSwedishUi
      ? snapshot
      : null;
  },
  { attempts: 30, delayMs: 250 }
);
record(
  "Android can select Swedish through the production language registry",
  switchedToSwedish?.lang === "sv" && switchedToSwedish?.stored === "sv",
  switchedToSwedish || {}
);

await evaluate("location.reload(); true");
const swedishReload = await retry(
  "Android Swedish locale reload",
  async () => {
    const snapshot = await evaluate(`(() => ({
      ready: document.readyState === "complete",
      lang: document.documentElement.lang || "",
      stored: localStorage.getItem("foli-language-v1"),
      hasEnglishSwitch: [...document.querySelectorAll("button")].some(
        (candidate) => (candidate.textContent || "").trim() === "In English"
      ),
      hasSwedishUi:
        /Välj en busshållplats|Hitta närmaste hållplats|Avgår/.test(
          document.body.innerText
        )
    }))()`);
    return snapshot.ready &&
      snapshot.lang === "sv" &&
      snapshot.stored === "sv" &&
      snapshot.hasEnglishSwitch &&
      snapshot.hasSwedishUi
      ? snapshot
      : null;
  },
  { attempts: 30, delayMs: 250 }
);
record(
  "Swedish locale persists across Android WebView reload",
  swedishReload?.lang === "sv" &&
    swedishReload?.stored === "sv" &&
    swedishReload?.hasSwedishUi === true,
  swedishReload || {}
);

// Keep the long-standing Android E2E assertions language-stable after proving
// native persistence. The registry continues Swedish → English.
const restoredEnglish = await retry(
  "Android locale reset to English",
  async () => {
    const snapshot = await evaluate(`(() => {
      const findButton = (label) =>
        [...document.querySelectorAll("button")].find(
          (candidate) => (candidate.textContent || "").trim() === label
        );
      const lang = document.documentElement.lang || "";
      if (lang === "sv") {
        findButton("In English")?.click();
        return null;
      }
      return {
        lang,
        stored: localStorage.getItem("foli-language-v1")
      };
    })()`);
    return snapshot?.lang === "en" && snapshot?.stored === "en"
      ? snapshot
      : null;
  },
  { attempts: 30, delayMs: 250 }
);
record(
  "Android locale cycle returns to English for the remaining E2E contract",
  restoredEnglish?.lang === "en" && restoredEnglish?.stored === "en",
  restoredEnglish || {}
);

const nativeJourneyInput = await retry("native journey destination input", async () =>
  evaluate(`Boolean(document.querySelector("#journey-destination"))`)
);
record("Journey Assistant destination input is present", nativeJourneyInput === true);

const nativePlaceHandoff = await retry(
  "native place-search handoff",
  async () => {
    const snapshot = await evaluate(`(() => {
      const link = [...document.querySelectorAll("a")].find((node) =>
        node.href === "https://turku.digitransit.fi/"
      );
      const journey = document.querySelector('[aria-labelledby="journey-search-title"]');
      return {
        link: link
          ? {
              text: link.textContent?.trim() || "",
              href: link.href
            }
          : null,
        language: document.documentElement.lang || "",
        online: navigator.onLine,
        journeyPresent: Boolean(journey),
        privacyTextPresent: /official Turku journey planner|Turun virallista reittiopasta/i.test(
          journey?.textContent || ""
        )
      };
    })()`);

    if (!snapshot?.link) {
      throw new Error(
        `handoff link not ready: ${JSON.stringify(snapshot || {})}`
      );
    }

    return {
      ...snapshot.link,
      language: snapshot.language
    };
  },
  // The native handoff link is intentionally conditioned on the app's online
  // state. On a cold emulator WebView that connectivity probe can settle well
  // after navigator.onLine is already true, so wait for UI readiness rather
  // than weakening the link assertion.
  { attempts: 60, delayMs: 500 }
);
record(
  "packaged Android hands address/POI search to the official planner",
  nativePlaceHandoff?.href === "https://turku.digitransit.fi/",
  nativePlaceHandoff || {}
);

const nativeJourneyFilled = await evaluate(`(() => {
  const input = document.querySelector("#journey-destination");
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter.call(input, "Prisma Itäharju");
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: "Prisma Itäharju"
  }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.value === "Prisma Itäharju";
})()`);
record("native journey destination can be entered", nativeJourneyFilled === true);

// React may batch the synthetic input update until this JS task returns.
// Submitting in the same Runtime.evaluate call can therefore race the state
// commit and make the form see the old empty query on a cold WebView.
await sleep(100);
const nativeJourneySubmitted = await evaluate(`(() => {
  const input = document.querySelector("#journey-destination");
  const form = input?.closest("form");
  if (!input || !form) return false;
  form.requestSubmit();
  return true;
})()`);
record(
  "native journey destination form can be submitted",
  nativeJourneySubmitted === true
);

record(
  "packaged Android makes no direct public Nominatim request",
  results.placeProviderRequests.length === 0,
  { requests: results.placeProviderRequests }
);

async function readAndroidGeolocation(enableHighAccuracy, timeout) {
  return evaluate(`
    new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: "outer timeout" }),
        ${timeout + 2000}
      );
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          resolve({
            ok: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          clearTimeout(timer);
          resolve({ ok: false, error: error.message, code: error.code });
        },
        {
          enableHighAccuracy: ${enableHighAccuracy},
          timeout: ${timeout},
          maximumAge: 0
        }
      );
    })
  `, { awaitPromise: true });
}

// Mirror the product's reliability contract: ask for a fresh high-accuracy fix
// first, then fall back when Android reports a timeout. The assertion below
// remains strict about the injected Turku coordinates, so this retries Android
// location-provider readiness rather than accepting a wrong or stale location.
let geo = await readAndroidGeolocation(true, 8000);
if (!geo?.ok && geo?.code === 3) {
  geo = await retry(
    "Android fallback geolocation",
    async () => {
      const candidate = await readAndroidGeolocation(false, 5000);
      if (
        candidate?.ok === true &&
        Math.abs(Number(candidate.latitude) - 60.4518) < 0.05 &&
        Math.abs(Number(candidate.longitude) - 22.2666) < 0.05
      ) {
        return candidate;
      }
      return null;
    },
    { attempts: 6, delayMs: 1000 }
  );
}

record(
  "Android geolocation returns Turku emulator coordinates",
  geo?.ok === true &&
    Math.abs(Number(geo.latitude) - 60.4518) < 0.05 &&
    Math.abs(Number(geo.longitude) - 22.2666) < 0.05,
  geo || {}
);

const activeRideRequest = await evaluate(`(async () => {
  const cap = window.Capacitor;
  if (
    !cap ||
    cap.getPlatform?.() !== "android" ||
    cap.isNativePlatform?.() !== true ||
    cap.isPluginAvailable?.("ActiveRide") !== true ||
    !cap.Plugins?.ActiveRide
  ) {
    return {
      supported: false,
      platform: cap?.getPlatform?.() || "",
      native: cap?.isNativePlatform?.() === true,
      available: cap?.isPluginAvailable?.("ActiveRide") === true,
      pluginNames: Object.keys(cap?.Plugins || {})
    };
  }

  const plugin =
    window.__foliActiveRideE2E ||
    (window.__foliActiveRideE2E = cap.Plugins.ActiveRide);
  const prepared = await plugin.prepare({ request: false });
  const rideId = "android-e2e-active-ride";
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const started = await plugin.start({
    rideId,
    expiresAt: String(expiresAt)
  });
  return { supported: true, rideId, prepared, started };
})()`, { awaitPromise: true });

record(
  "Android exposes ActiveRide only after foreground location is ready",
  activeRideRequest?.supported === true &&
    activeRideRequest?.prepared?.ready === true &&
    activeRideRequest?.started?.reason === "requested",
  activeRideRequest || {}
);

const activeRideStatus = await retry(
  "Android ActiveRide foreground service promotion",
  async () => {
    const status = await evaluate(`(async () => {
      const plugin = window.__foliActiveRideE2E;
      return plugin ? await plugin.status() : null;
    })()`, { awaitPromise: true });
    return status?.active === true ? status : null;
  },
  { attempts: 30, delayMs: 250 }
);

record(
  "Android ActiveRide runs as a typed non-sticky foreground companion",
  activeRideStatus?.rideId === activeRideRequest?.rideId &&
    activeRideStatus?.serviceType === "location" &&
    activeRideStatus?.restartPolicy === "not-sticky",
  activeRideStatus || {}
);

const activeRideStop = await evaluate(`(async () => {
  const plugin = window.__foliActiveRideE2E;
  return plugin
    ? await plugin.stop({ rideId: "android-e2e-active-ride" })
    : null;
})()`, { awaitPromise: true });

record(
  "Android ActiveRide accepts an explicit matching stop request",
  activeRideStop?.reason === "stopping",
  activeRideStop || {}
);

const activeRideStopped = await retry(
  "Android ActiveRide foreground service stop",
  async () => {
    const status = await evaluate(`(async () => {
      const plugin = window.__foliActiveRideE2E;
      return plugin ? await plugin.status() : null;
    })()`, { awaitPromise: true });
    return status?.active === false ? status : null;
  },
  { attempts: 30, delayMs: 250 }
);

record(
  "Android ActiveRide leaves no native companion after explicit stop",
  activeRideStopped?.active === false,
  activeRideStopped || {}
);

// Android/WebView correctness must not depend on whether Föli happens to
// answer during this CI minute. Live provider contracts are exercised by the
// separate scheduled "Live Föli contract smoke" workflow. Here we seed only
// data the product itself is allowed to persist: public stop metadata and a
// recent departure-board snapshot. Then block the provider so search, board,
// offline continuity and reload are proved against a deterministic outage.
await evaluate(`(() => {
  const now = Date.now();
  const serverTime = Math.floor(now / 1000);

  localStorage.setItem(
    "foli-stop-catalog-v2",
    JSON.stringify({
      savedAt: now,
      coordinatesSavedAt: now,
      stops: [
        {
          id: "164",
          name: "Kauppatori",
          lat: 60.4518,
          lon: 22.2666
        }
      ]
    })
  );

  localStorage.setItem(
    "foli-last-departures-v1",
    JSON.stringify({
      "164": {
        stopName: "Kauppatori",
        arrivals: [
          {
            lineref: "1",
            destinationdisplay: "Satama",
            destinationdisplay_en: "Harbour",
            destinationdisplay_sv: "Hamnen",
            tripref: "",
            monitored: false,
            recordedattime: null,
            vehicleatstop: false,
            latitude: null,
            longitude: null,
            delay: null,
            expecteddeparturetime: null,
            expectedarrivaltime: null,
            aimeddeparturetime: serverTime + 600,
            aimedarrivaltime: serverTime + 600
          }
        ],
        serverTime,
        realtimeAvailable: false,
        scheduleAvailable: true,
        scheduleFailed: false,
        scheduleIncomplete: false,
        receivedAtMs: now
      }
    })
  );

  return true;
})()`);

await Network.setBlockedURLs({ urls: ["https://data.foli.fi/*"] });
await evaluate("location.reload(); true");

await retry("fixture-backed app reload", async () => {
  return evaluate(
    `document.readyState === "complete" &&
      document.body &&
      /Turku Departures/i.test(document.body.innerText)`
  );
}, { attempts: 20, delayMs: 500 });

await evaluate(`(() => {
  const form = document.querySelector('form[data-stop-search-form="true"]');
  const input =
    form?.querySelector('input[role="combobox"]') ||
    form?.querySelector('input[type="search"]') ||
    form?.querySelector("input");
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter.call(input, "Kauppatori");
  input.focus();
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: "Kauppatori"
  }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);

const suggestion = await retry("cached manual stop suggestion", async () => {
  return evaluate(`(() => {
    const form = document.querySelector('form[data-stop-search-form="true"]');
    const candidates = [...(form?.querySelectorAll('[role="option"]') || [])];
    const match = candidates.find((node) =>
      /Kauppatori/i.test(node.textContent || "")
    );
    return match
      ? { found: true, text: (match.textContent || "").trim() }
      : null;
  })()`);
}, { attempts: 20, delayMs: 500 });

record(
  "stop search returns cached Kauppatori during provider outage",
  suggestion?.found === true && /Kauppatori/i.test(suggestion.text || ""),
  suggestion || {}
);

const selected = await evaluate(`(() => {
  const form = document.querySelector('form[data-stop-search-form="true"]');
  const candidates = [...(form?.querySelectorAll('[role="option"]') || [])];
  const match = candidates.find((node) =>
    /Kauppatori/i.test(node.textContent || "")
  );
  if (!match) {
    return {
      clicked: false,
      candidates: candidates
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 30)
    };
  }
  match.click();
  return { clicked: true, text: (match.textContent || "").trim() };
})()`);

record("Kauppatori suggestion can be selected", selected?.clicked === true, selected || {});

const selectedStopId = await retry("selected stop URL", async () => {
  return evaluate(`new URL(location.href).searchParams.get("stop") || ""`);
}, { attempts: 20, delayMs: 250 });

record(
  "selected suggestion opens a concrete Föli stop",
  /^\d+$/.test(selectedStopId),
  { selectedStopId }
);

await sleep(500);

const showDepartures = await evaluate(`(() => {
  const form = document.querySelector('form[data-stop-search-form="true"]');
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return { clicked: false, reason: "missing-submit" };

  const disabled = Boolean(button.disabled);
  if (!disabled) button.click();

  return {
    clicked: !disabled,
    disabled,
    type: button.type
  };
})()`);

record(
  "departure submit action is enabled and clickable",
  showDepartures?.clicked === true,
  showDepartures || {}
);

const board = await retry("fixture-backed departure board", async () => {
  return evaluate(`(() => ({
    url: location.href,
    text: document.body.innerText,
    rows: document.querySelectorAll("tbody tr").length,
    heading: [...document.querySelectorAll("h1,h2,h3")].map((n) => (n.textContent || "").trim()).find((value) => /Kauppatori/i.test(value)) || ""
  }))()`);
}, { attempts: 25, delayMs: 750 });

record(
  "recent cached departure board opens while Föli is unavailable",
  new URL(board.url).searchParams.get("stop") === selectedStopId &&
    /Kauppatori/i.test(board.heading || board.text) &&
    Number(board.rows) > 0,
  {
    url: board.url,
    selectedStopId,
    heading: board.heading,
    rows: board.rows
  }
);

const liveSemantics = await evaluate(`(() => {
  const table = document.querySelector("table");
  const rows = [...document.querySelectorAll("tbody tr")];
  const cellCounts = rows.map((row) => row.querySelectorAll("td").length);
  const hasRefreshControl = [...document.querySelectorAll("button")].some(
    (button) =>
      button.getAttribute("aria-label")?.toLowerCase().includes("refresh") ||
      button.dataset?.action === "refresh"
  );

  return {
    hasTable: Boolean(table),
    rowCount: rows.length,
    everyRowHasAtLeastThreeCells:
      rows.length > 0 && cellCounts.every((count) => count >= 3),
    hasRefreshControl,
    cellCounts
  };
})()`);

record(
  "departure board exposes a structured, populated departures table",
  liveSemantics.hasTable === true &&
    liveSemantics.rowCount > 0 &&
    liveSemantics.everyRowHasAtLeastThreeCells === true,
  liveSemantics
);

const providerOutageState = await evaluate(`({
  online: navigator.onLine,
  rows: document.querySelectorAll("tbody tr").length,
  text: document.body.innerText
})`);

record(
  "provider outage keeps the cached board usable while the WebView is online",
  providerOutageState.online === true &&
    providerOutageState.rows > 0 &&
    /Kauppatori/i.test(providerOutageState.text),
  {
    online: providerOutageState.online,
    rows: providerOutageState.rows
  }
);

await Network.emulateNetworkConditions({
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
  connectionType: "none",
});
await evaluate(`window.dispatchEvent(new Event("offline")); true`);
await sleep(1000);

const offlineState = await evaluate(`({
  online: navigator.onLine,
  url: location.href,
  textLength: document.body.innerText.trim().length,
  rows: document.querySelectorAll("tbody tr").length,
  hasMainContent: Boolean(document.querySelector("main, [role='main'], table"))
})`);

record(
  "offline transition keeps the selected stop UI usable",
  offlineState.online === false &&
    new URL(offlineState.url).searchParams.get("stop") === selectedStopId &&
    offlineState.textLength > 50 &&
    offlineState.hasMainContent === true,
  offlineState
);

await Network.emulateNetworkConditions({
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: "wifi",
});
await evaluate(`window.dispatchEvent(new Event("online")); true`);
await sleep(750);

const recovered = await retry("online recovery", async () => {
  const value = await evaluate(`({
    online: navigator.onLine,
    text: document.body.innerText,
    rows: document.querySelectorAll("tbody tr").length
  })`);
  return value.online && value.rows > 0 && !/^Offline$/m.test(value.text) ? value : null;
}, { attempts: 20, delayMs: 750 });

record(
  "online recovery restores a populated board",
  recovered.online === true && recovered.rows > 0,
  { online: recovered.online, rows: recovered.rows }
);

const persistedUrl = await evaluate("location.href");
await evaluate("location.reload(); true");
await retry("reload after selected stop", async () => {
  return evaluate(
    `document.readyState === "complete" &&
      new URL(location.href).searchParams.get("stop") === ${JSON.stringify(selectedStopId)} &&
      /Kauppatori/i.test(document.body.innerText)`
  );
}, { attempts: 25, delayMs: 500 });

const reloaded = await evaluate(`({
  url: location.href,
  rows: document.querySelectorAll("tbody tr").length,
  text: document.body.innerText.slice(0, 2000)
})`);

record(
  "selected stop survives Android WebView reload",
  new URL(reloaded.url).searchParams.get("stop") === selectedStopId &&
    /Kauppatori/i.test(reloaded.text),
  { before: persistedUrl, after: reloaded.url, rows: reloaded.rows }
);

record(
  "no uncaught JavaScript exceptions during tested flow",
  results.exceptions.length === 0,
  { exceptions: results.exceptions }
);

results.finishedAt = new Date().toISOString();
fs.mkdirSync("artifacts/android-e2e", { recursive: true });
fs.writeFileSync(
  "artifacts/android-e2e/webview-e2e-results.json",
  JSON.stringify(results, null, 2)
);

console.log("ANDROID_WEBVIEW_E2E_RESULT");
console.log(JSON.stringify(results, null, 2));
await client.close();
