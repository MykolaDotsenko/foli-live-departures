import fs from "node:fs";
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
      candidateClient = await CDP({ host, port, target });
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

const initial = await evaluate(`({
  url: location.href,
  title: document.title,
  text: document.body.innerText.slice(0, 4000),
  inputCount: document.querySelectorAll("input").length,
  buttonCount: document.querySelectorAll("button").length
})`);

record(
  "cold start renders product UI",
  /Find your stop/i.test(initial.text) && /Show departures/i.test(initial.text),
  { url: initial.url, title: initial.title, inputCount: initial.inputCount, buttonCount: initial.buttonCount }
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

const geo = await evaluate(`
  new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, error: "timeout" }),
      12000
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  })
`, { awaitPromise: true });

record(
  "Android geolocation returns Turku emulator coordinates",
  geo?.ok === true &&
    Math.abs(Number(geo.latitude) - 60.4518) < 0.05 &&
    Math.abs(Number(geo.longitude) - 22.2666) < 0.05,
  geo || {}
);

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

const suggestionText = await retry("live stop suggestion", async () => {
  const text = await evaluate("document.body.innerText");
  return /Kauppatori/i.test(text) ? text : "";
}, { attempts: 20, delayMs: 750 });

record("live stop search returns Kauppatori", /Kauppatori/i.test(suggestionText));

const selected = await evaluate(`(() => {
  const candidates = [...document.querySelectorAll(
    '[role="option"], [role="listbox"] button, button'
  )];
  const match = candidates.find((node) =>
    /Kauppatori/i.test(node.textContent || "") &&
    !/Show departures/i.test(node.textContent || "")
  );
  if (!match) return { clicked: false, candidates: candidates.map((node) => (node.textContent || "").trim()).filter(Boolean).slice(0, 30) };
  match.click();
  return { clicked: true, text: (match.textContent || "").trim() };
})()`);

record("Kauppatori suggestion can be selected", selected?.clicked === true, selected || {});

await sleep(500);

const showDepartures = await evaluate(`(() => {
  const button = [...document.querySelectorAll("button")].find((node) =>
    /Show departures/i.test(node.textContent || "")
  );
  if (!button) return { clicked: false };
  const disabled = Boolean(button.disabled);
  if (!disabled) button.click();
  return {
    clicked: !disabled,
    disabled,
    text: (button.textContent || "").trim()
  };
})()`);

record("Show departures action is enabled and clickable", showDepartures?.clicked === true, showDepartures || {});

const board = await retry("live departure board", async () => {
  return evaluate(`(() => ({
    url: location.href,
    text: document.body.innerText,
    rows: document.querySelectorAll("tbody tr").length,
    heading: [...document.querySelectorAll("h1,h2,h3")].map((n) => (n.textContent || "").trim()).find((value) => /Kauppatori/i.test(value)) || ""
  }))()`);
}, { attempts: 25, delayMs: 750 });

record(
  "live Föli departure board opens for stop 164",
  /[?&]stop=164(?:&|$)/.test(board.url) &&
    /Kauppatori/i.test(board.heading || board.text) &&
    Number(board.rows) > 0,
  { url: board.url, heading: board.heading, rows: board.rows }
);

const liveSemantics = await evaluate(`(() => {
  const text = document.body.innerText;
  return {
    hasRefresh: /Refresh/i.test(text),
    hasDepartureVocabulary: /(Live|Scheduled|min|due|now)/i.test(text),
    rowCount: document.querySelectorAll("tbody tr").length,
    pageTextSample: text.slice(0, 2500)
  };
})()`);

record(
  "departure board exposes usable realtime/timetable semantics",
  liveSemantics.hasRefresh === true &&
    liveSemantics.hasDepartureVocabulary === true &&
    liveSemantics.rowCount > 0,
  { hasRefresh: liveSemantics.hasRefresh, hasDepartureVocabulary: liveSemantics.hasDepartureVocabulary, rowCount: liveSemantics.rowCount }
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
  text: document.body.innerText.slice(0, 3500),
  rows: document.querySelectorAll("tbody tr").length
})`);

record(
  "offline transition is surfaced without blanking the app",
  offlineState.online === false &&
    /Offline/i.test(offlineState.text) &&
    offlineState.text.trim().length > 50,
  { online: offlineState.online, rows: offlineState.rows }
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

await evaluate(`(() => {
  const button = [...document.querySelectorAll("button")].find((node) =>
    /^Refresh$/i.test((node.textContent || "").trim())
  );
  if (button && !button.disabled) button.click();
  return Boolean(button);
})()`);

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
    `document.readyState === "complete" && /[?&]stop=164(?:&|$)/.test(location.href) && /Kauppatori/i.test(document.body.innerText)`
  );
}, { attempts: 25, delayMs: 500 });

const reloaded = await evaluate(`({
  url: location.href,
  rows: document.querySelectorAll("tbody tr").length,
  text: document.body.innerText.slice(0, 2000)
})`);

record(
  "selected stop survives Android WebView reload",
  /[?&]stop=164(?:&|$)/.test(reloaded.url) && /Kauppatori/i.test(reloaded.text),
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
