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
    { attempts: 3, delayMs: 1000 }
  );
}

record(
  "Android geolocation returns Turku emulator coordinates",
  geo?.ok === true &&
    Math.abs(Number(geo.latitude) - 60.4518) < 0.05 &&
    Math.abs(Number(geo.longitude) - 22.2666) < 0.05,
  geo || {}
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
  const input =
    document.querySelector('input[role="combobox"]') ||
    document.querySelector('input[type="search"]') ||
    document.querySelector("input");
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

const suggestionText = await retry("cached stop suggestion", async () => {
  const text = await evaluate("document.body.innerText");
  return /Kauppatori/i.test(text) ? text : "";
}, { attempts: 20, delayMs: 750 });

record("stop search returns cached Kauppatori during provider outage", /Kauppatori/i.test(suggestionText));

const selected = await evaluate(`(() => {
  const candidates = [...document.querySelectorAll('[role="option"]')];
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
