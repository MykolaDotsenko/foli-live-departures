import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "../i18n";
import { distanceInMeters, hasCoordinates } from "../utils/geo";
import { analyzeRideGps } from "../utils/rideGeometry";
import {
  announceRideStage,
  repeatNowRideSignal,
  requestRideNotificationPermission,
  runRideTestAlert,
  stopRideAlerts,
} from "../utils/rideAlerts";
import {
  RIDE_STAGE,
  arrivalEtaSeconds,
  rideStageRank,
  evaluateRideStage,
  plannedRideProgress,
  fixLeftStop,
  rideLongOver,
} from "../utils/rideProgress";
import { dataAgeSeconds } from "../utils/time";
import useRideAudioReadiness from "./useRideAudioReadiness";
import useRideProviderPoll from "./useRideProviderPoll";
import useRideShape from "./useRideShape";
import useRideWakeLock from "./useRideWakeLock";

const STORAGE_KEY = "foli-active-ride-v1";
const RIDE_TTL_MS = 6 * 60 * 60 * 1000;
const CLOCK_INTERVAL_MS = 10_000;
const NOW_REPEAT_MS = 5_000;
// Long enough for any dwell and a door that is slow to open. Past it the bus
// has left, whether or not anything could report that: with the network
// gone, a phone in a pocket otherwise repeated "get off now" until the ride
// expired hours later.
const NOW_REPEAT_LIMIT_MS = 3 * 60_000;
// How long an answer from the exit stop still counts as live. Everything
// read from it, estimate and position alike, is aged by the time since.
const TARGET_LIVE_FOR_SEC = 120;
// The same window trackingHealth calls "live", so the panel's "Your bus is
// confirmed" and its badge always describe the same evidence.
const TARGET_CONFIRMED_FOR_SEC = 45;
// A fix this precise is needed before straight-line distance counts towards
// "you have gone past your stop": two fixes 300 m wide ended a ride that was
// still a minute from the stop.
const MISS_FIX_ACCURACY_M = 50;

// Metres along the trip's shape from the stop before the exit to the exit.
// How far along the route a stop of the plan lies before the exit.
function routeGapM(plan, stop) {
  const target = Number(plan?.targetStop?.shapeDistTraveled);
  const from = Number(stop?.shapeDistTraveled);
  if (
    plan?.targetStop?.shapeDistTraveled === null ||
    stop?.shapeDistTraveled === null ||
    !Number.isFinite(target) ||
    !Number.isFinite(from) ||
    target <= from
  ) {
    return null;
  }
  return target - from;
}

// Fixes in a row that must agree the phone has left a stop. One can be
// thrown by a building; two a second or so apart rarely are. On a one-stop
// ride both stops are the boarding stop, so setting off and "Press STOP now"
// come together, as one alert.
const LEFT_STOP_FIXES = 2;

function emptyRuntime() {
  return {
    lastPollAt: null,
    lastProviderSuccessAt: null,
    lastLiveMatchAt: null,
    targetSeenAt: null,
    previousSeen: false,
    previousMissingCount: 0,
    targetMissingCount: 0,
    targetWasAtStop: false,
    targetListed: false,
    targetMatchBy: "",
    liveEtaSec: null,
    providerDistanceM: null,
    providerPositionAgeSec: null,
    scheduleEtaSec: null,
    remainingStops: null,
    etaSec: null,
    gpsAgeSec: null,
    trackingHealth: "schedule",
    lastError: "",
    notificationPermission: "unknown",
  };
}

function emptyGps() {
  return {
    status: "off",
    distanceM: null,
    accuracyM: null,
    speedMps: null,
    minimumDistanceM: null,
    wasNearTarget: false,
    movedAwayAfterNear: false,
    shapeStatus: "idle",
    shapeError: "",
    shapeUsable: false,
    onRoute: false,
    alongRouteM: null,
    alongRouteUpdatedAt: null,
    lateralDistanceM: null,
    routeDistanceM: null,
    routeEtaSec: null,
    offRouteSinceMs: null,
    offRouteSuspected: false,
    passedTarget: false,
    leftBoardingFixes: 0,
    leftPreviousFixes: 0,
    updatedAt: null,
    error: "",
  };
}

function validStoredRide(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.targetStop &&
    /^\d+$/.test(String(value.targetStop.id || "")) &&
    value.plan &&
    Number(value.expiresAt) > Date.now() &&
    !rideLongOver(value.plan, Date.now() / 1000)
  );
}

function readStoredRide() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validStoredRide(parsed)) return parsed;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A corrupt convenience record must never block the departure board.
  }
  return null;
}

function persistRide(session) {
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ride tracking continues in-memory even if storage is unavailable.
  }
}

function createRideId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rideIdentity(session) {
  return {
    datedVehicleJourneyRef: session.datedVehicleJourneyRef,
    tripRef: session.tripRef,
    vehicleRef: session.vehicleRef,
    lineRef: session.lineRef,
    originAimedDepartureTime: session.originAimedDepartureTime,
  };
}

function trackingHealth(runtime, online = globalThis.navigator?.onLine !== false) {
  if (!online) return "schedule";

  const lastLive = Number(runtime.lastLiveMatchAt);
  if (!Number.isFinite(lastLive) || lastLive <= 0) return "schedule";

  const ageMs = Date.now() - lastLive;
  if (ageMs <= 45_000) return "live";
  if (ageMs <= 120_000) return "delayed";
  return "schedule";
}

function providerDistanceToTarget(arrival, targetStop) {
  if (
    !hasCoordinates(targetStop) ||
    !hasCoordinates({ lat: arrival?.latitude, lon: arrival?.longitude })
  ) {
    return null;
  }

  const distance = distanceInMeters(
    { lat: arrival.latitude, lon: arrival.longitude },
    targetStop
  );

  return Number.isFinite(distance) ? distance : null;
}

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
    stopRideAlerts();
    shapeRef.current = null;
    commitSession(null);
    commitRuntime(emptyRuntime());
    commitGps(emptyGps());
  }, [commitGps, commitRuntime, commitSession, shapeRef]);

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

      const gpsMovedAway =
        nextGps.wasNearTarget === true &&
        nextGps.movedAwayAfterNear === true;

      const previousPassedConfirmed =
        nextRuntime.previousSeen === true &&
        nextRuntime.previousMissingCount >= 2 &&
        nextRuntime.targetListed === true;

      const targetPassedConfirmed =
        nextRuntime.targetWasAtStop === true &&
        nextRuntime.targetMissingCount >= 2;

      // A failed poll keeps the previous prediction in runtime. Past this age
      // it is no longer a live answer, so the stage logic must fall back to
      // the timetable instead of trusting a frozen number.
      const gpsAgeSec = Number.isFinite(Number(nextGps.updatedAt))
        ? Math.max(0, (Date.now() - Number(nextGps.updatedAt)) / 1000)
        : null;

      // The exit stop's row is only as current as the answer it came in.
      // Its estimate counts down from then, and its position ages from then,
      // or a failed poll keeps both looking fresh: a frozen "100 s" held
      // back "Press STOP" past the bus's arrival, and a position from a
      // loop's first pass, kept at its original age, later read as the bus
      // standing at the stop. Sightings at the stop before do not count
      // here; they say nothing about the exit stop's estimate.
      const targetSeenAt = Number(nextRuntime.targetSeenAt);
      const sinceTargetSec =
        Number.isFinite(targetSeenAt) && targetSeenAt > 0
          ? Math.max(0, (Date.now() - targetSeenAt) / 1000)
          : null;
      const targetAnswerLive =
        sinceTargetSec !== null && sinceTargetSec <= TARGET_LIVE_FOR_SEC;
      const reportedEta = Number(nextRuntime.liveEtaSec);
      const liveEtaSec =
        targetAnswerLive &&
        nextRuntime.liveEtaSec !== null &&
        Number.isFinite(reportedEta)
          ? Math.round(reportedEta - sinceTargetSec)
          : null;

      // Well past its planned exit, with nothing live saying the bus is
      // still on its way, the ride is over: it ends without a sound.
      if (liveEtaSec === null && rideLongOver(current.plan, Date.now() / 1000)) {
        endRide();
        return;
      }
      const reportedPositionAge = Number(nextRuntime.providerPositionAgeSec);
      const providerPositionAgeSec =
        sinceTargetSec === null
          ? null
          : (nextRuntime.providerPositionAgeSec !== null &&
            Number.isFinite(reportedPositionAge)
              ? reportedPositionAge
              : 0) + sinceTargetSec;

      // Riding pace, from a fix recent enough to still describe the phone.
      const gpsSpeed = Number(nextGps.speedMps);
      const gpsSpeedMps =
        nextGps.speedMps !== null &&
        Number.isFinite(gpsSpeed) &&
        gpsAgeSec !== null &&
        gpsAgeSec <= 60
          ? gpsSpeed
          : null;
      const stageAgeSec = Number.isFinite(Number(current.stageChangedAt))
        ? Math.max(0, (Date.now() - Number(current.stageChangedAt)) / 1000)
        : null;

      // Until the phone has ridden away from the boarding stop, where it is
      // says nothing about the bus: someone waiting there for a one-stop
      // ride is already "400 m from the exit", and was told to press STOP
      // twenty minutes before the bus came. Kept once known.
      const underway =
        current.underway === true ||
        previousPassedConfirmed ||
        nextGps.leftBoardingFixes >= LEFT_STOP_FIXES;

      const evaluated = evaluateRideStage(current.stage, {
        liveEtaSec,
        scheduleEtaSec: planned.etaSec,
        remainingStops: planned.remainingStops,
        providerDistanceM: nextRuntime.providerDistanceM,
        providerPositionAgeSec,
        gpsDistanceM: nextGps.distanceM,
        gpsAccuracyM: nextGps.accuracyM,
        gpsAgeSec,
        gpsShapeAvailable: nextGps.shapeStatus === "ready",
        gpsShapeUsable: underway && nextGps.shapeUsable,
        gpsOnRoute: underway && nextGps.onRoute,
        gpsRouteDistanceM: nextGps.routeDistanceM,
        gpsRouteEtaSec: nextGps.routeEtaSec,
        // 200 m past the exit is not somewhere a passenger waits for the bus.
        gpsPassedTarget: nextGps.passedTarget,
        gpsSpeedMps,
        stageAgeSec,
        previousPassedConfirmed,
        targetAtStop: nextRuntime.targetWasAtStop && nextRuntime.targetListed,
        targetPassedConfirmed,
        gpsMovedAwayAfterNear: gpsMovedAway,
        // A reloaded ride waits for its first poll to answer, or fail. And
        // the timetable says nothing about a bus that is not due to have
        // left the boarding stop yet.
        scheduleMayRaise:
          !planned.beforeDeparture &&
          (current.id !== restoredRideIdRef.current ||
            nextRuntime.lastPollAt !== null),
        lastReason: current.stageReason,
        lastConfidence: current.stageConfidence,
      });

      const health = trackingHealth(nextRuntime);
      // The panel must not read a different source than the stage logic. A
      // frozen prediction from a failed poll, or a fix from before a tunnel,
      // would otherwise keep showing a confident "~2 min" next to a badge
      // that already says tracking is degraded.
      const gpsEtaUsable =
        underway &&
        nextGps.routeEtaSec !== null &&
        Number.isFinite(Number(nextGps.routeEtaSec)) &&
        (gpsAgeSec === null || gpsAgeSec <= 60);
      const etaSource = gpsEtaUsable
        ? "location"
        : liveEtaSec !== null
          ? "live"
          : "schedule";
      // Answers without the bus only count towards ending the alarm once it
      // is sounding, so the count starts again as it begins.
      const enteringNow =
        evaluated.stage === RIDE_STAGE.NOW &&
        current.stage !== RIDE_STAGE.NOW;
      const mergedRuntime = {
        ...nextRuntime,
        targetMissingCount: enteringNow ? 0 : nextRuntime.targetMissingCount,
        scheduleEtaSec: planned.etaSec,
        // What the panel shows. Before the bus leaves, every stop of the
        // plan is still ahead: the stage logic may not count them yet, but
        // the passenger may, and "Remaining: tracking" answered nothing.
        remainingStops:
          planned.remainingStops ??
          (planned.beforeDeparture && Array.isArray(current.plan?.stopsToTarget)
            ? current.plan.stopsToTarget.length
            : null),
        // Published so the panel can age out a fix on exactly the same clock
        // the stage logic uses, instead of presenting a tunnel-old distance
        // as where the passenger is now.
        gpsAgeSec,
        etaSec:
          etaSource === "location"
            ? Number(nextGps.routeEtaSec)
            : etaSource === "live"
              ? liveEtaSec
              : planned.etaSec,
        etaSource,
        // The panel's "confirmed" is about the exit stop, on the same clock
        // as the estimate it sits beside, and never beside a badge that has
        // gone back to the timetable (an offline phone does at once).
        targetLive:
          health === "live" &&
          sinceTargetSec !== null &&
          sinceTargetSec <= TARGET_CONFIRMED_FOR_SEC &&
          nextRuntime.targetListed === true,
        trackingHealth: health,
      };
      runtimeRef.current = mergedRuntime;
      setRuntimeState(mergedRuntime);

      // Kept once known: "Press STOP now" is only said once the bus has left
      // the stop before the exit, and a fix lost in a tunnel afterwards does
      // not put it back there. One vague fix past it is not enough: the bus
      // could still be standing there, and the press would stop it there.
      const previousLeft =
        current.previousLeft === true ||
        previousPassedConfirmed ||
        (underway && nextGps.leftPreviousFixes >= LEFT_STOP_FIXES);
      const stageChanged = evaluated.stage !== current.stage;
      const leftPrevious = previousLeft && current.previousLeft !== true;
      const setOff = underway && current.underway !== true;

      if (!stageChanged && !leftPrevious && !setOff) return;

      const nextSession = stageChanged
        ? {
            ...current,
            underway,
            previousLeft,
            stage: evaluated.stage,
            stageReason: evaluated.reason,
            stageConfidence: evaluated.confidence,
            stageChangedAt: Date.now(),
          }
        : { ...current, underway, previousLeft };

      sessionRef.current = nextSession;
      setSession(nextSession);
      persistRide(nextSession);

      // "Your stop is after X" is said on reaching NEXT before the bus has
      // left X; the moment it has, "Press STOP now" is said as an alert of
      // its own.
      const announceStage = stageChanged
        ? evaluated.stage
        : leftPrevious && evaluated.stage === RIDE_STAGE.NEXT
          ? RIDE_STAGE.NEXT
          : null;
      if (
        announceStage === RIDE_STAGE.SOON ||
        announceStage === RIDE_STAGE.NEXT ||
        announceStage === RIDE_STAGE.NOW ||
        announceStage === RIDE_STAGE.MISSED
      ) {
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

  const readArrivalSignals = useCallback(
    (arrival, serverTime, targetStop) => ({
      liveEtaSec: arrivalEtaSeconds(arrival, serverTime),
      providerDistanceM: providerDistanceToTarget(arrival, targetStop),
      providerPositionAgeSec: dataAgeSeconds(
        arrival.recordedattime,
        serverTime
      ),
    }),
    []
  );

  const commitPolledRuntime = useCallback(
    (next) => {
      const merged = { ...next, trackingHealth: trackingHealth(next) };
      runtimeRef.current = merged;
      setRuntimeState(merged);
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

  useEffect(() => {
    const current = sessionRef.current;
    if (!current?.options?.locationBackup) {
      commitGps(emptyGps());
      return undefined;
    }

    // Errors are kept as phrases and translated where the panel shows them,
    // so a language switch mid-ride reaches them too.
    if (
      typeof globalThis.navigator?.geolocation?.watchPosition !== "function"
    ) {
      commitGps((value) => ({
        ...value,
        status: "unavailable",
        error: msg("Location backup is unavailable on this device."),
      }));
      return undefined;
    }

    let active = true;
    commitGps((value) => ({
      ...value,
      status: "starting",
      error: "",
    }));

    const watchId = globalThis.navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;

        const point = {
          lat: Number(position?.coords?.latitude),
          lon: Number(position?.coords?.longitude),
        };
        const accuracy = Number(position?.coords?.accuracy);
        // Browsers report a speed they do not have as null, which Number()
        // turns into a confident 0 m/s.
        const reportedSpeed = position?.coords?.speed;
        const speed =
          reportedSpeed === null || reportedSpeed === undefined
            ? Number.NaN
            : Number(reportedSpeed);
        const nowMs = Date.now();

        if (!hasCoordinates(point)) return;

        const straightDistance = hasCoordinates(current.targetStop)
          ? distanceInMeters(point, current.targetStop)
          : null;
        const previous = gpsRef.current;

        // Loop and doubling-back routes drive close to the target long before
        // serving it. Arming the "gone past it" latch on that early pass would
        // let a sample taken while still approaching look like a miss, so the
        // approach is only tracked once the ride is actually near its end.
        const onApproach =
          rideStageRank(sessionRef.current?.stage) >=
          rideStageRank(RIDE_STAGE.NEXT);
        // Only a precise fix moves the "near, then away" latch that ends a
        // ride as missed. The rest still show distance and time as before.
        const preciseFix =
          Number.isFinite(accuracy) && accuracy <= MISS_FIX_ACCURACY_M;
        const minimumDistance =
          onApproach && preciseFix && Number.isFinite(straightDistance)
            ? previous.minimumDistanceM === null
              ? straightDistance
              : Math.min(previous.minimumDistanceM, straightDistance)
            : previous.minimumDistanceM;
        const wasNearTarget =
          previous.wasNearTarget === true ||
          (onApproach &&
            Number.isFinite(minimumDistance) &&
            minimumDistance <= 80);
        const movedAwayAfterNear = preciseFix
          ? wasNearTarget &&
            Number.isFinite(straightDistance) &&
            straightDistance >= 250 &&
            Number.isFinite(minimumDistance) &&
            straightDistance > minimumDistance + 120
          : previous.movedAwayAfterNear === true;

        const shapeAnalysis = shapeRef.current
          ? analyzeRideGps({
              position: point,
              accuracyM: accuracy,
              speedMps: speed,
              shape: shapeRef.current,
              boardingShapeDistM:
                current.plan?.boardingStop?.shapeDistTraveled,
              targetShapeDistM:
                current.plan?.targetStop?.shapeDistTraveled,
              previousAlongM: previous.alongRouteM,
              previousFixAtMs: previous.alongRouteUpdatedAt,
              offRouteSinceMs: previous.offRouteSinceMs,
              nowMs,
            })
          : null;

        // Asked of every fix, so "in a row" means fixes, not polls.
        const fixSignals = {
          gpsShapeUsable: shapeAnalysis?.usable === true,
          gpsOnRoute: shapeAnalysis?.onRoute === true,
          gpsRouteDistanceM: shapeAnalysis?.routeDistanceM,
          gpsAccuracyM: accuracy,
          gpsAgeSec: 0,
          gpsSpeedMps: Number.isFinite(speed) ? speed : null,
        };
        const leftBoardingFixes = fixLeftStop(
          fixSignals,
          routeGapM(current.plan, current.plan?.boardingStop)
        )
          ? (previous.leftBoardingFixes || 0) + 1
          : 0;
        const leftPreviousFixes = fixLeftStop(
          fixSignals,
          routeGapM(current.plan, current.plan?.previousStop)
        )
          ? (previous.leftPreviousFixes || 0) + 1
          : 0;

        const next = {
          ...previous,
          status:
            Number.isFinite(accuracy) && accuracy > 120
              ? "weak"
              : shapeAnalysis?.offRouteSuspected
                ? "off-route"
                : "active",
          distanceM: Number.isFinite(straightDistance)
            ? straightDistance
            : null,
          accuracyM: Number.isFinite(accuracy) ? accuracy : null,
          speedMps: Number.isFinite(speed) ? speed : null,
          minimumDistanceM: minimumDistance,
          wasNearTarget,
          movedAwayAfterNear,
          shapeStatus: shapeRef.current ? "ready" : previous.shapeStatus,
          shapeUsable: shapeAnalysis?.usable === true,
          onRoute: shapeAnalysis?.onRoute === true,
          // Ambiguous or off-route projections are diagnostics, not progress.
          // Keeping one as the next continuity anchor can lock a later good fix
          // onto the wrong leg of a loop.
          alongRouteM:
            shapeAnalysis?.onRoute === true &&
            Number.isFinite(shapeAnalysis?.alongM)
              ? shapeAnalysis.alongM
              : previous.alongRouteM,
          alongRouteUpdatedAt:
            shapeAnalysis?.onRoute === true &&
            Number.isFinite(shapeAnalysis?.alongM)
              ? nowMs
              : previous.alongRouteUpdatedAt,
          lateralDistanceM: Number.isFinite(shapeAnalysis?.lateralDistanceM)
            ? shapeAnalysis.lateralDistanceM
            : null,
          routeDistanceM: Number.isFinite(shapeAnalysis?.routeDistanceM)
            ? shapeAnalysis.routeDistanceM
            : null,
          routeEtaSec: Number.isFinite(shapeAnalysis?.routeEtaSec)
            ? shapeAnalysis.routeEtaSec
            : null,
          offRouteSinceMs: shapeAnalysis?.offRouteSinceMs ?? null,
          offRouteSuspected: shapeAnalysis?.offRouteSuspected === true,
          passedTarget: shapeAnalysis?.passedTarget === true,
          leftBoardingFixes,
          leftPreviousFixes,
          updatedAt: nowMs,
          error: "",
        };

        gpsRef.current = next;
        setGpsState(next);
        applyProgress(runtimeRef.current, next);
      },
      (error) => {
        if (!active) return;
        commitGps((value) => ({
          ...value,
          status: "error",
          error:
            error?.code === 1
              ? msg("Location backup was not allowed.")
              : msg("Location backup is temporarily unavailable."),
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      }
    );

    return () => {
      active = false;
      globalThis.navigator?.geolocation?.clearWatch?.(watchId);
    };
  }, [
    applyProgress,
    commitGps,
    rideId,
    session?.options?.locationBackup,
    shapeRef,
  ]);

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

  // The vehicle leaving the target ends the alarm whether the passenger got
  // off or not. Repeating "get off now" at someone already standing on the
  // pavement is noise, and it cannot help anyone still aboard either. Once it
  // is sounding, two answers without the bus are enough: needing a sighting
  // of the bus standing at the stop first left the alarm running after a
  // reload, and after a dwell shorter than the poll.
  const targetVehicleGone =
    session?.stage === RIDE_STAGE.NOW && runtime.targetMissingCount >= 2;
  const nowStartedAt = Number(session?.stageChangedAt) || 0;

  useEffect(() => {
    if (session?.stage !== RIDE_STAGE.NOW || targetVehicleGone) {
      return undefined;
    }

    const id = window.setInterval(() => {
      if (Date.now() - nowStartedAt > NOW_REPEAT_LIMIT_MS) {
        window.clearInterval(id);
        return;
      }
      repeatNowRideSignal();
    }, NOW_REPEAT_MS);

    return () => window.clearInterval(id);
  }, [nowStartedAt, session?.stage, targetVehicleGone]);

  useEffect(
    () => () => {
      stopRideAlerts();
    },
    []
  );

  return {
    session,
    runtime,
    gps,
    wakeLockState,
    active: Boolean(session),
    startRide,
    endRide,
    testAlert,
  };
}
