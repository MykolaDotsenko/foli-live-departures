import { beforeEach, expect, test } from "vitest";
import {
  FIELD_DIAGNOSTICS_STORAGE_KEY,
  buildFieldDiagnosticReport,
  clearFieldDiagnostics,
  fieldDiagnosticsRequested,
  finishFieldDiagnostics,
  recordFieldDiagnosticObservation,
  sanitizedEvidence,
  sanitizedRideIdentity,
  startFieldDiagnostics,
} from "./fieldDiagnostics";

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const session = {
  id: "private-random-id",
  tripRef: "trip-public",
  lineRef: "18",
  routeType: 3,
  originAimedDepartureTime: 1_790_000_000,
  targetStop: { id: "164", name: "Private-ish provider name" },
  previousStop: { id: "163", name: "Another provider name" },
  stage: "boarded",
  stageReason: "tracking",
  stageConfidence: "live",
};

test("field-test mode is explicit", () => {
  expect(fieldDiagnosticsRequested()).toBe(false);
  window.history.replaceState({}, "", "/?fieldtest=1");
  expect(fieldDiagnosticsRequested()).toBe(true);
});

test("sanitized identity excludes random ride ids, names and coordinates", () => {
  const identity = sanitizedRideIdentity({
    ...session,
    lat: 60.45,
    lon: 22.26,
    home: "Home",
  });
  expect(identity).toEqual({
    tripRef: "trip-public",
    lineRef: "18",
    routeType: 3,
    targetStopId: "164",
    previousStopId: "163",
    originAimedDepartureTime: 1_790_000_000,
  });
  expect(JSON.stringify(identity)).not.toContain("private-random-id");
  expect(JSON.stringify(identity)).not.toContain("Private-ish");
  expect(JSON.stringify(identity)).not.toContain("60.45");
});

test("evidence stores freshness classes but no GPS distances or coordinates", () => {
  const evidence = sanitizedEvidence(
    {
      gpsAgeSec: 4,
      trackingHealth: "live",
      lastLiveMatchAt: Date.now(),
      lastError: "",
      targetListed: true,
      targetWasAtStop: false,
      providerDistanceM: 17,
    },
    {
      status: "active",
      onRoute: true,
      shapeUsable: true,
      distanceM: 25,
      latitude: 60.45,
      longitude: 22.26,
    },
    { providerState: "live", decision: "good" }
  );
  expect(evidence).toMatchObject({
    providerHealth: "live",
    providerMatched: true,
    gpsState: "fresh",
    gpsOnRoute: true,
    transferProviderState: "live",
    transferDecision: "good",
  });
  const serialized = JSON.stringify(evidence);
  expect(serialized).not.toContain("distance");
  expect(serialized).not.toContain("60.45");
  expect(serialized).not.toContain("22.26");
});

test("records a bounded deterministic local trace and explicit finish", () => {
  startFieldDiagnostics(session, {
    version: "1.0.0-rc",
    sha: "a".repeat(40),
    platform: "pwa",
  });
  recordFieldDiagnosticObservation({
    session: { ...session, stage: "soon", stageReason: "planned" },
    runtime: { trackingHealth: "schedule", gpsAgeSec: null },
    gps: { status: "off" },
    type: "stage-transition",
  });
  finishFieldDiagnostics({
    session: { ...session, stage: "now", stageReason: "provider-at-stop" },
    runtime: { trackingHealth: "live", lastLiveMatchAt: Date.now() },
    gps: { status: "off" },
    outcome: "passenger-ended",
  });

  const report = buildFieldDiagnosticReport();
  const parsed = JSON.parse(report);
  expect(parsed.schema).toBe(1);
  expect(parsed.build.sha).toBe("a".repeat(40));
  expect(parsed.ride.tripRef).toBe("trip-public");
  expect(parsed.finishedAt).toEqual(expect.any(Number));
  expect(parsed.outcome).toBe("passenger-ended");
  expect(parsed.events.map((event) => event.type)).toEqual([
    "ride-start",
    "stage-transition",
    "ride-end",
  ]);
  expect(report).not.toContain("private-random-id");
  expect(report).not.toContain("Private-ish provider name");
});

test("deduplicates unchanged observations and can be cleared", () => {
  startFieldDiagnostics(session);
  const snapshot = {
    session,
    runtime: { trackingHealth: "schedule", gpsAgeSec: null },
    gps: { status: "off" },
  };
  recordFieldDiagnosticObservation(snapshot);
  recordFieldDiagnosticObservation(snapshot);
  const parsed = JSON.parse(buildFieldDiagnosticReport());
  expect(parsed.events).toHaveLength(2);

  clearFieldDiagnostics();
  expect(sessionStorage.getItem(FIELD_DIAGNOSTICS_STORAGE_KEY)).toBeNull();
  expect(buildFieldDiagnosticReport()).toBe("");
});
