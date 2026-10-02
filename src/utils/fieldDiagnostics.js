export const FIELD_DIAGNOSTICS_STORAGE_KEY = "turku-field-diagnostics-v1";
export const FIELD_DIAGNOSTICS_SCHEMA = 1;
const MAX_EVENTS = 200;

/** @returns {boolean} */
export function fieldDiagnosticsRequested() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("fieldtest") === "1";
  } catch {
    return false;
  }
}

/** @param {unknown} value */
function text(value) {
  return String(value || "").slice(0, 160);
}

/** @param {unknown} value */
function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {unknown} value @returns {any} */
function safeJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** @returns {any | null} */
function readTrace() {
  try {
    const raw = globalThis.sessionStorage?.getItem(FIELD_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.schema === FIELD_DIAGNOSTICS_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {any} trace */
function writeTrace(trace) {
  try {
    globalThis.sessionStorage?.setItem(
      FIELD_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(trace)
    );
  } catch {
    // Field diagnostics are optional and must never affect the ride.
  }
}

export function clearFieldDiagnostics() {
  try {
    globalThis.sessionStorage?.removeItem(FIELD_DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // Optional diagnostics only.
  }
}

/**
 * Public transit identifiers are useful for reproducing a field failure.
 * Random ride IDs, saved-place labels and any GPS coordinates are deliberately
 * excluded.
 */
/** @param {any} session */
export function sanitizedRideIdentity(session) {
  return {
    tripRef: text(session?.tripRef),
    lineRef: text(session?.lineRef),
    routeType:
      session?.routeType === null || session?.routeType === undefined
        ? null
        : Number(session.routeType),
    targetStopId: text(session?.targetStop?.id),
    previousStopId: text(session?.previousStop?.id),
    originAimedDepartureTime: positive(session?.originAimedDepartureTime),
  };
}

/**
 * @param {any} runtime
 * @param {any} gps
 * @param {import("../types/journey").TransferRevalidationState | null} [transferRevalidation]
 */
export function sanitizedEvidence(runtime, gps, transferRevalidation = null) {
  const gpsAge = positive(runtime?.gpsAgeSec);
  const gpsState =
    gps?.status === "error"
      ? "error"
      : gps?.status === "off"
        ? "off"
        : gpsAge === null
          ? "unknown"
          : gpsAge <= 30
            ? "fresh"
            : "stale";

  const providerHealth = [
    "live",
    "recent",
    "schedule",
    "stale",
    "lost",
  ].includes(String(runtime?.trackingHealth || ""))
    ? String(runtime.trackingHealth)
    : "unknown";

  return {
    providerHealth,
    providerMatched: Boolean(runtime?.lastLiveMatchAt),
    providerError: Boolean(runtime?.lastError),
    targetListed: Boolean(runtime?.targetListed),
    targetWasAtStop: Boolean(runtime?.targetWasAtStop),
    gpsState,
    gpsOnRoute: Boolean(gps?.onRoute),
    gpsShapeUsable: Boolean(gps?.shapeUsable),
    transferProviderState: text(transferRevalidation?.providerState),
    transferDecision: text(transferRevalidation?.decision),
  };
}

/**
 * @param {any} session
 * @param {{version?: string, sha?: string, platform?: string}} [build]
 */
export function startFieldDiagnostics(session, build = {}) {
  const now = Date.now();
  const trace = {
    schema: FIELD_DIAGNOSTICS_SCHEMA,
    createdAt: now,
    finishedAt: null,
    build: {
      version: text(build.version || ""),
      sha: /^[0-9a-f]{40}$/i.test(String(build.sha || ""))
        ? String(build.sha).toLowerCase()
        : "",
      platform: text(build.platform || "web"),
    },
    ride: sanitizedRideIdentity(session),
    events: [
      {
        at: now,
        type: "ride-start",
        stage: text(session?.stage || "boarded"),
        reason: text(session?.stageReason),
        confidence: text(session?.stageConfidence),
        evidence: sanitizedEvidence(null, null),
      },
    ],
  };
  writeTrace(trace);
  return safeJson(trace);
}

/** @param {any} event */
function appendEvent(event) {
  const trace = readTrace();
  if (!trace) return null;
  const events = Array.isArray(trace.events) ? trace.events.slice(-MAX_EVENTS + 1) : [];
  events.push(event);
  const next = { ...trace, events };
  writeTrace(next);
  return safeJson(next);
}

/**
 * @param {{
 *   session?: any,
 *   runtime?: any,
 *   gps?: any,
 *   transferRevalidation?: import("../types/journey").TransferRevalidationState | null,
 *   type?: string
 * }} [input]
 */
export function recordFieldDiagnosticObservation({
  session,
  runtime,
  gps,
  transferRevalidation = null,
  type = "observation",
} = {}) {
  if (!session || !readTrace()) return null;
  const evidence = sanitizedEvidence(runtime, gps, transferRevalidation);
  const previous = readTrace()?.events?.at(-1);
  const nextComparable = JSON.stringify({
    stage: session.stage,
    reason: session.stageReason,
    confidence: session.stageConfidence,
    evidence,
  });
  const previousComparable = previous
    ? JSON.stringify({
        stage: previous.stage,
        reason: previous.reason,
        confidence: previous.confidence,
        evidence: previous.evidence,
      })
    : "";

  if (type === "observation" && nextComparable === previousComparable) {
    return readTrace();
  }

  return appendEvent({
    at: Date.now(),
    type: text(type),
    stage: text(session.stage),
    reason: text(session.stageReason),
    confidence: text(session.stageConfidence),
    evidence,
  });
}

/**
 * @param {{
 *   session?: any,
 *   runtime?: any,
 *   gps?: any,
 *   transferRevalidation?: import("../types/journey").TransferRevalidationState | null,
 *   outcome?: string
 * }} [input]
 */
export function finishFieldDiagnostics({
  session,
  runtime,
  gps,
  transferRevalidation = null,
  outcome = "ended",
} = {}) {
  if (!readTrace()) return null;
  recordFieldDiagnosticObservation({
    session,
    runtime,
    gps,
    transferRevalidation,
    type: "ride-end",
  });
  const trace = readTrace();
  if (!trace) return null;
  const next = {
    ...trace,
    finishedAt: Date.now(),
    outcome: text(outcome),
  };
  writeTrace(next);
  return safeJson(next);
}

export function buildFieldDiagnosticReport() {
  const trace = readTrace();
  if (!trace) return "";
  return JSON.stringify(trace, null, 2) + "\n";
}
