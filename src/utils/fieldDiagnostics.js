export const FIELD_DIAGNOSTICS_STORAGE_KEY = "turku-field-diagnostics-v2";
export const FIELD_DIAGNOSTICS_SCHEMA = 2;
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

function ageClass(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds <= 10) return "fresh";
  if (seconds <= 30) return "aging";
  return "stale";
}

function accuracyClass(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters < 0) return "unknown";
  if (meters <= 15) return "excellent";
  if (meters <= 35) return "good";
  if (meters <= 75) return "fair";
  return "weak";
}

function allowed(value, choices, fallback = "unknown") {
  const candidate = String(value || "");
  return choices.includes(candidate) ? candidate : fallback;
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
 * @param {{legIndex: number, state: import("../types/journey").TransferRevalidationState}[]} [futureLegRevalidations]
 */
export function sanitizedEvidence(
  runtime,
  gps,
  transferRevalidation = null,
  futureLegRevalidations = []
) {
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
    providerAge: ageClass(runtime?.providerPositionAgeSec),
    etaSource: allowed(runtime?.etaSource, ["location", "live", "schedule"]),
    notificationPermission: allowed(
      runtime?.notificationPermission,
      ["unknown", "granted", "unavailable"]
    ),
    targetListed: Boolean(runtime?.targetListed),
    targetWasAtStop: Boolean(runtime?.targetWasAtStop),
    gpsState,
    gpsStatus: allowed(
      gps?.status,
      ["off", "unavailable", "starting", "weak", "off-route", "active", "error"]
    ),
    gpsAge: ageClass(runtime?.gpsAgeSec),
    gpsAccuracy: accuracyClass(gps?.accuracyM),
    gpsOnRoute: Boolean(gps?.onRoute),
    gpsShapeUsable: Boolean(gps?.shapeUsable),
    transferProviderState: text(transferRevalidation?.providerState),
    transferDecision: text(transferRevalidation?.decision),
    futureLegs: (Array.isArray(futureLegRevalidations)
      ? futureLegRevalidations
      : []
    )
      .map((entry) => ({
        legIndex: Number(entry?.legIndex),
        providerState: text(entry?.state?.providerState),
        decision: text(entry?.state?.decision),
      }))
      .filter(
        (entry) =>
          Number.isInteger(entry.legIndex) &&
          entry.legIndex >= 0 &&
          (entry.providerState || entry.decision)
      )
      .sort((left, right) => left.legIndex - right.legIndex),
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
  return trace;
}

/** @param {any} event */
function appendEvent(event) {
  const trace = readTrace();
  if (!trace) return null;
  const events = Array.isArray(trace.events) ? trace.events.slice(-MAX_EVENTS + 1) : [];
  events.push(event);
  const next = { ...trace, events };
  writeTrace(next);
  return next;
}

/**
 * @param {{
 *   session?: any,
 *   runtime?: any,
 *   gps?: any,
 *   transferRevalidation?: import("../types/journey").TransferRevalidationState | null,
 *   futureLegRevalidations?: {legIndex: number, state: import("../types/journey").TransferRevalidationState}[],
 *   type?: string
 * }} [input]
 */
export function recordFieldDiagnosticObservation({
  session,
  runtime,
  gps,
  transferRevalidation = null,
  futureLegRevalidations = [],
  type = "observation",
} = {}) {
  const trace = readTrace();
  if (!session || !trace) return null;
  const evidence = sanitizedEvidence(
    runtime,
    gps,
    transferRevalidation,
    futureLegRevalidations
  );
  const previous = trace.events?.at(-1);
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
    return trace;
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
 *   futureLegRevalidations?: {legIndex: number, state: import("../types/journey").TransferRevalidationState}[],
 *   outcome?: string
 * }} [input]
 */
export function finishFieldDiagnostics({
  session,
  runtime,
  gps,
  transferRevalidation = null,
  futureLegRevalidations = [],
  outcome = "ended",
} = {}) {
  const trace = recordFieldDiagnosticObservation({
    session,
    runtime,
    gps,
    transferRevalidation,
    futureLegRevalidations,
    type: "ride-end",
  });
  if (!trace) return null;
  const next = {
    ...trace,
    finishedAt: Date.now(),
    outcome: text(outcome),
  };
  writeTrace(next);
  return next;
}

export function buildFieldDiagnosticReport() {
  const trace = readTrace();
  if (!trace) return "";
  return JSON.stringify(trace, null, 2) + "\n";
}
