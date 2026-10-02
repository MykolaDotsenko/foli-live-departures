import { useCallback, useEffect, useRef, useState } from "react";
import {
  announceRideStage,
  requestRideNotificationPermission,
  runRideTestAlert,
  stopRideAlerts,
} from "../utils/rideAlerts";
import {
  progressRuntime,
  recentGpsSpeedMps,
  rideConfirmations,
  rideStageSignals,
  rideStageTransition,
  rideUnderway,
  secondsSince,
} from "../utils/rideEvidence";
import {
  agedLiveEtaSec,
  agedProviderPositionAgeSec,
  readArrivalSignals,
  targetAnswerAgeSec,
  trackingHealth,
} from "../utils/rideFeedEvidence";
import {
  RIDE_STAGE,
  evaluateRideStage,
  plannedRideProgress,
  rideLongOver,
} from "../utils/rideProgress";
import {
  buildFieldDiagnosticReport,
  fieldDiagnosticsRequested,
  finishFieldDiagnostics,
  recordFieldDiagnosticObservation,
  startFieldDiagnostics,
} from "../utils/fieldDiagnostics";
import { BUILD_IDENTITY } from "../utils/buildIdentity";
import {
  RIDE_STORAGE_KEY,
  RIDE_TTL_MS,
  createRideId,
  emptyGps,
  emptyRuntime,
  persistRide,
  readStoredRide,
  rideIdentity,
  storedRideId,
} from "../utils/rideSession";
import useRideAudioReadiness from "./useRideAudioReadiness";
import useRideGps from "./useRideGps";
import useRideNowAlarm from "./useRideNowAlarm";
import useRideProviderPoll from "./useRideProviderPoll";
import useRideShape from "./useRideShape";
import useRideWakeLock from "./useRideWakeLock";

const CLOCK_INTERVAL_MS = 10_000;
// Ride Mode's get-off alert: one ride at a time, carried across reloads, and
// moved through its stages by every piece of evidence as it arrives, from
// the live feed, the phone's location, and the clock. The hooks it calls
// each gather one kind of evidence; this one weighs it all in one place, so
// the stage, the panel and the alerts never disagree.
export default function useRideMode() {
  const initialRideRef = useRef(null);
  if (initialRideRef.current === null) {
    initialRideRef.current = readStoredRide() || false;
  }

  const [session, setSession] = useState(
    initialRideRef.current === false ? null : initialRideRef.current
  );
  // The ride this page picked up from storage, if any. It knows nothing
  // live about the bus until its first poll comes back.
  const restoredRideIdRef = useRef(initialRideRef.current?.id || "");
  const [runtime, setRuntimeState] = useState(emptyRuntime);
  const [gps, setGpsState] = useState(emptyGps);
  const diagnosticsEnabledRef = useRef(fieldDiagnosticsRequested());
  const [fieldReport, setFieldReport] = useState(() =>
    diagnosticsEnabledRef.current ? buildFieldDiagnosticReport() : ""
  );

  const rideId = session?.id || "";
  const rideActive = Boolean(session);

  const sessionRef = useRef(session);
  const runtimeRef = useRef(runtime);
  const gpsRef = useRef(gps);

  const commitSession = useCallback((updater) => {
    setSession((current) => {
      const next =
        typeof updater === "function" ? updater(current) : updater;
      sessionRef.current = next;
      persistRide(next);
      return next;
    });
  }, []);

  const commitRuntime = useCallback((updater) => {
    setRuntimeState((current) => {
      const next =
        typeof updater === "function" ? updater(current) : updater;
      runtimeRef.current = next;
      return next;
    });
  }, []);

  const commitGps = useCallback((updater) => {
    setGpsState((current) => {
      const next =
        typeof updater === "function" ? updater(current) : updater;
      gpsRef.current = next;
      return next;
    });
  }, []);

  const setShapeStatus = useCallback(
    (shapeStatus) => commitGps((value) => ({ ...value, shapeStatus })),
    [commitGps]
  );

  const shapeRef = useRideShape({
    rideId,
    enabled: session?.options?.locationBackup === true,
    shapeId: session?.shapeId || "",
    onStatus: setShapeStatus,
  });

  const endRide = useCallback(() => {
    const current = sessionRef.current;
    if (diagnosticsEnabledRef.current && current) {
      finishFieldDiagnostics({
        session: current,
        runtime: runtimeRef.current,
        gps: gpsRef.current,
        outcome: "passenger-ended",
      });
      setFieldReport(buildFieldDiagnosticReport());
    }
    stopRideAlerts();
    shapeRef.current = null;
    commitSession(null);
    commitRuntime(emptyRuntime());
    commitGps(emptyGps());
  }, [commitGps, commitRuntime, commitSession, shapeRef]);

  // The same ride can be open in two tabs. Turned off in one, the other kept
  // alerting and later wrote its copy back, so the ride the passenger had
  // ended was there again on the next reload. A ride ended or replaced in
  // another tab is followed here, and nothing is written back: storage
  // already says what the passenger chose. Only by a tab running a ride,
  // though: every open tab took up a ride started in any of them, and each
  // polled, watched the location, held the screen on and said "Get off now"
  // on its own. A tab with no ride leaves a new one to the tab that started
  // it, and picks it up on its next load, as it always has. The stored ride
  // still being this one is asked of the record itself, not of whether it
  // looks resumable: a ride long past its planned exit is ended by the tab
  // that runs it, which may know its bus is very late and still coming.
  useEffect(() => {
    const takeOtherTabRide = (event) => {
      if (event.key !== null && event.key !== RIDE_STORAGE_KEY) return;
      const current = sessionRef.current;
      if (!current) return;
      if (storedRideId() === current.id) return;
      const stored = readStoredRide();

      stopRideAlerts();
      shapeRef.current = null;
      sessionRef.current = stored;
      setSession(stored);
      // Like a ride picked up on load, it knows nothing live yet.
      restoredRideIdRef.current = stored?.id || "";
      commitRuntime(emptyRuntime());
      commitGps(emptyGps());
    };
    window.addEventListener("storage", takeOtherTabRide);
    return () => window.removeEventListener("storage", takeOtherTabRide);
  }, [commitGps, commitRuntime, shapeRef]);

  const applyProgress = useCallback(
    (nextRuntime = runtimeRef.current, nextGps = gpsRef.current) => {
      const current = sessionRef.current;
      if (!current) return;

      if (Date.now() >= Number(current.expiresAt || 0)) {
        endRide();
        return;
      }

      const planned = plannedRideProgress(
        current.plan,
        Math.floor(Date.now() / 1000)
      );

      const confirmations = rideConfirmations(nextRuntime, nextGps);

      // A failed poll keeps the previous prediction in runtime. Past this age
      // it is no longer a live answer, so the stage logic must fall back to
      // the timetable instead of trusting a frozen number.
      const gpsAgeSec = secondsSince(nextGps.updatedAt, Date.now());

      const sinceTargetSec = targetAnswerAgeSec(
        nextRuntime.targetSeenAt,
        Date.now()
      );
      const liveEtaSec = agedLiveEtaSec(nextRuntime, sinceTargetSec);

      // Well past its planned exit, with nothing live saying the bus is
      // still on its way, the ride is over: it ends without a sound.
      if (liveEtaSec === null && rideLongOver(current.plan, Date.now() / 1000)) {
        endRide();
        return;
      }
      const providerPositionAgeSec = agedProviderPositionAgeSec(
        nextRuntime,
        sinceTargetSec
      );

      const gpsSpeedMps = recentGpsSpeedMps(nextGps, gpsAgeSec);
      const stageAgeSec = secondsSince(current.stageChangedAt, Date.now());

      const underway = rideUnderway(
        current,
        confirmations.previousPassedConfirmed,
        nextGps
      );

      const evaluated = evaluateRideStage(
        current.stage,
        rideStageSignals({
          session: current,
          planned,
          runtime: nextRuntime,
          gps: nextGps,
          confirmations,
          underway,
          liveEtaSec,
          providerPositionAgeSec,
          gpsAgeSec,
          gpsSpeedMps,
          stageAgeSec,
          restoredRideId: restoredRideIdRef.current,
        })
      );

      const mergedRuntime = progressRuntime({
        session: current,
        planned,
        runtime: nextRuntime,
        gps: nextGps,
        stage: evaluated.stage,
        underway,
        liveEtaSec,
        gpsAgeSec,
        sinceTargetSec,
      });
      runtimeRef.current = mergedRuntime;
      setRuntimeState(mergedRuntime);

      const transition = rideStageTransition(
        current,
        evaluated,
        underway,
        confirmations.previousPassedConfirmed,
        nextGps,
        Date.now()
      );
      if (!transition) return;

      const {
        nextSession: transitionedSession,
        previousLeft,
        announceStage,
      } = transition;

      // A false MISSED may be reopened only by provider evidence that is
      // distinct from what was already known when MISSED was entered. Using
      // millisecond wall-clock ordering here was racy: on a fast phone the
      // MISSED transition and the genuinely newer SIRI response can share
      // the same Date.now() value.
      const enteredMissed =
        current.stage !== RIDE_STAGE.MISSED &&
        transitionedSession.stage === RIDE_STAGE.MISSED;
      const leftMissed =
        current.stage === RIDE_STAGE.MISSED &&
        transitionedSession.stage !== RIDE_STAGE.MISSED;
      const nextSession = enteredMissed
        ? {
            ...transitionedSession,
            missedTargetSnapshotSignature:
              nextRuntime.targetSnapshotSignature || "",
          }
        : leftMissed
          ? { ...transitionedSession, missedTargetSnapshotSignature: "" }
          : transitionedSession;

      sessionRef.current = nextSession;
      setSession(nextSession);
      persistRide(nextSession);
      if (diagnosticsEnabledRef.current) {
        recordFieldDiagnosticObservation({
          session: nextSession,
          runtime: mergedRuntime,
          gps: nextGps,
          type: "stage-transition",
        });
      }

      if (announceStage) {
        announceRideStage(
          announceStage,
          current.targetStop,
          current.options?.notifications !== false,
          current.routeType,
          { previousStop: current.previousStop, previousLeft }
        );
      }
    },
    [endRide]
  );

  const startRide = useCallback(
    (config) => {
      if (!config?.targetStop || !config?.plan) return false;

      const now = Date.now();
      const nextSession = {
        id: createRideId(),
        ...config,
        stage: RIDE_STAGE.BOARDED,
        stageReason: "tracking",
        stageConfidence: "live",
        startedAt: now,
        stageChangedAt: now,
        expiresAt: now + RIDE_TTL_MS,
      };

      stopRideAlerts();
      commitRuntime(emptyRuntime());
      commitGps(emptyGps());
      commitSession(nextSession);
      if (diagnosticsEnabledRef.current) {
        startFieldDiagnostics(nextSession, BUILD_IDENTITY);
        setFieldReport("");
      }

      const wantsNotifications =
        nextSession.options?.notifications !== false;

      if (wantsNotifications) {
        void requestRideNotificationPermission().then((granted) => {
          commitRuntime((current) => ({
            ...current,
            notificationPermission: granted ? "granted" : "unavailable",
          }));
        });
      }

      void runRideTestAlert(
        nextSession.targetStop,
        wantsNotifications
      );

      return true;
    },
    [commitGps, commitRuntime, commitSession]
  );

  const testAlert = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    void runRideTestAlert(
      current.targetStop,
      current.options?.notifications !== false
    );
  }, []);

  const wakeLockState = useRideWakeLock(rideId);
  useRideAudioReadiness(rideId);

  const commitPolledRuntime = useCallback(
    (next) => {
      const merged = { ...next, trackingHealth: trackingHealth(next) };
      runtimeRef.current = merged;
      setRuntimeState(merged);
      if (diagnosticsEnabledRef.current && sessionRef.current) {
        recordFieldDiagnosticObservation({
          session: sessionRef.current,
          runtime: merged,
          gps: gpsRef.current,
        });
      }
      applyProgress(merged, gpsRef.current);
    },
    [applyProgress]
  );

  useRideProviderPoll({
    rideId,
    sessionRef,
    runtimeRef,
    rideIdentity,
    readArrivalSignals,
    onRuntime: commitPolledRuntime,
  });

  useRideGps({
    rideId,
    locationBackup: session?.options?.locationBackup,
    sessionRef,
    runtimeRef,
    gpsRef,
    shapeRef,
    commitGps,
    setGpsState,
    applyProgress,
  });

  useEffect(() => {
    if (!rideActive) return undefined;

    const id = window.setInterval(() => {
      const next = {
        ...runtimeRef.current,
        trackingHealth: trackingHealth(runtimeRef.current),
      };
      applyProgress(next, gpsRef.current);
    }, CLOCK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [applyProgress, rideActive, rideId]);

  useRideNowAlarm({
    stage: session?.stage,
    stageChangedAt: session?.stageChangedAt,
    targetMissingCount: runtime.targetMissingCount,
  });

  return {
    session,
    runtime,
    gps,
    wakeLockState,
    fieldDiagnosticsEnabled: diagnosticsEnabledRef.current,
    fieldReport,
    active: Boolean(session),
    startRide,
    endRide,
    testAlert,
  };
}
