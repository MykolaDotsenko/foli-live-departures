import { useEffect } from "react";
import { fetchStopMonitor } from "../api/foliApi";
import { liveArrivalSnapshotSignature } from "../utils/rideFeedEvidence";
import { RIDE_STAGE, resolveRideArrivalMatch } from "../utils/rideProgress";
import { ridePollDelayMs } from "../utils/retry";

const REALTIME_ONLY = Object.freeze({ scheduleFallback: false });
const FRESH_PROVIDER_OBSERVATION_SEC = 120;

// What one stop's answer says about the ride. Only a row the feed is tracking
// is evidence of where the bus is. The feed also lists journeys it is not
// tracking, with the timetable time under the same trip id; counting those as
// sightings showed "Following your bus" and a timetable-timed "Press STOP now"
// just as live tracking was lost. "no-data" is an answer without realtime
// data at all (NO_SIRI_DATA, PENDING): the feed may be down, or the stop may
// simply have nothing more coming.
function rideSighting(answer, identity) {
  const resolution = resolveRideArrivalMatch(answer?.arrivals, identity);

  if (resolution.status === "matched") {
    const match = {
      arrival: resolution.arrival,
      matchedBy: resolution.matchedBy,
    };
    return match.arrival?.monitored === true
      ? { kind: "live", match }
      : { kind: "untracked" };
  }

  if (resolution.status === "ambiguous") {
    return { kind: "ambiguous" };
  }

  return { kind: answer?.realtimeAvailable === false ? "no-data" : "absent" };
}

// Föli realtime is the confirmation source that runs independently of the
// phone's own location: it watches the target stop, and the one before it,
// for the journey the passenger actually boarded.
export default function useRideProviderPoll({
  rideId,
  sessionRef,
  runtimeRef,
  rideIdentity,
  readArrivalSignals,
  onRuntime,
}) {
  useEffect(() => {
    if (!rideId) return undefined;

    let active = true;
    let timeoutId = null;
    let controller = null;
    let consecutiveFailures = 0;

    const schedule = () => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(
        runPoll,
        ridePollDelayMs(consecutiveFailures)
      );
    };

    async function runPoll() {
      if (!active) return;

      const current = sessionRef.current;
      if (!current) return;

      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;

      // Counted before the work, so a throw anywhere below still backs off
      // instead of retrying a broken poll at full speed.
      consecutiveFailures += 1;

      try {
        const [targetResult, previousResult] = await Promise.allSettled([
          fetchStopMonitor(current.targetStop.id, signal, REALTIME_ONLY),
          current.previousStop?.id
            ? fetchStopMonitor(current.previousStop.id, signal, REALTIME_ONLY)
            : Promise.resolve(null),
        ]);

        if (!active || signal.aborted) return;

        const before = runtimeRef.current;
        const next = { ...before, lastPollAt: Date.now(), lastError: "" };
        const identity = rideIdentity(current);

        if (targetResult.status === "fulfilled") {
          consecutiveFailures = 0;
          next.lastProviderSuccessAt = Date.now();

          // The planned time picks the right visit when a loop lists this
          // stop twice for one journey.
          const target = rideSighting(targetResult.value, {
            ...identity,
            plannedEpochSec: current.plan?.targetPredictedEpochSec ?? null,
          });

          if (target.kind === "live") {
            const targetMatch = target.match;
            const signature = liveArrivalSnapshotSignature(targetMatch.arrival);
            const snapshotAdvanced =
              !before.targetSnapshotSignature ||
              signature !== before.targetSnapshotSignature;

            next.targetListed = true;
            next.targetMatchBy = targetMatch.matchedBy;
            next.targetMissingCount = 0;

            // Receiving another HTTP response is not the same as receiving
            // newer transit evidence. Föli may repeat one SIRI snapshot for
            // several polls. Re-anchoring the ETA on every identical copy
            // freezes the displayed minutes and makes stale data look live.
            // Keep the original anchor until the provider observation itself
            // changes; agedLiveEtaSec() will keep counting it down meanwhile.
            if (snapshotAdvanced) {
              next.targetSnapshotSignature = signature;
              next.lastLiveMatchAt = Date.now();
              next.targetSeenAt = Date.now();

              const arrivalSignals = readArrivalSignals(
                targetMatch.arrival,
                targetResult.value.serverTime,
                current.targetStop
              );
              Object.assign(next, arrivalSignals);

              const observationAgeSec = Number(
                arrivalSignals?.providerPositionAgeSec
              );
              const freshObservation =
                arrivalSignals?.providerPositionAgeSec !== null &&
                arrivalSignals?.providerPositionAgeSec !== undefined &&
                Number.isFinite(observationAgeSec) &&
                observationAgeSec <= FRESH_PROVIDER_OBSERVATION_SEC;

              // vehicleatstop is a physical-state claim. Once a fresh one is
              // seen we keep it as historical evidence that the bus really
              // reached the target. A stale/undated row must never arm that
              // latch: otherwise one old observation can later turn "bus gone"
              // into a false passed-target confirmation.
              next.targetWasAtStop =
                next.targetWasAtStop ||
                (freshObservation &&
                  targetMatch.arrival.vehicleatstop === true);
            }
          } else if (target.kind === "ambiguous") {
            // The journey is present, but more than one visit fits and the
            // planned time cannot safely choose between them. This is not
            // evidence that the bus disappeared. Preserve the last state and
            // let its timestamps age naturally.
          } else {
            // Absent, untracked or no data: either way the bus is not in the
            // live data. A stop with nothing more coming can answer
            // NO_SIRI_DATA once the bus has left it, and holding the last
            // sighting then kept the get-off alarm repeating.
            //
            // While "get off now" is sounding, every answer without the bus
            // counts, sighting or not: a page reloaded at NOW has never seen
            // the bus, and a 20-second poll can miss a 15-second dwell
            // entirely. Either way the alarm must still learn it has gone.
            //
            // An untracked row is not such an answer. It is the journey still
            // listed, on its timetable time: the feed has lost the bus, not
            // seen it leave. Counted, it ended the alarm while the bus was
            // still due, just when location was the only evidence left.
            next.targetListed = false;
            next.targetMatchBy = "";
            // A later reappearance is new evidence even when Föli reuses the
            // same timestamps and prediction after a transient gap.
            next.targetSnapshotSignature = "";
            next.targetMissingCount =
              target.kind === "untracked" && current.stage === RIDE_STAGE.NOW
                ? before.targetMissingCount
                : before.targetListed ||
                    before.targetMissingCount > 0 ||
                    before.targetWasAtStop ||
                    current.stage === RIDE_STAGE.NOW
                  ? before.targetMissingCount + 1
                  : 0;
            next.liveEtaSec = null;
            next.providerDistanceM = null;
            next.providerPositionAgeSec = null;
          }
        } else {
          next.lastError =
            "Live target-stop tracking is temporarily unavailable.";
        }

        if (previousResult.status === "fulfilled" && previousResult.value) {
          next.lastProviderSuccessAt = Date.now();
          const previous = rideSighting(previousResult.value, {
            ...identity,
            plannedEpochSec: current.previousStop?.predictedEpochSec ?? null,
          });

          if (previous.kind === "live") {
            const signature = liveArrivalSnapshotSignature(previous.match.arrival);
            const snapshotAdvanced =
              !before.previousSnapshotSignature ||
              signature !== before.previousSnapshotSignature;
            if (snapshotAdvanced) {
              next.previousSnapshotSignature = signature;
              next.lastLiveMatchAt = Date.now();
            }
            next.previousSeen = true;
            next.previousMissingCount = 0;
          } else if (previous.kind === "ambiguous") {
            // Presence is known, visit identity is not. Do not turn
            // uncertainty into "the bus left this stop".
          } else if (previous.kind === "untracked") {
            // An untracked row leaves the board when its timetable time
            // passes, bus or no bus, so its disappearance cannot mean the bus
            // left. Only a fresh live sighting re-arms that check.
            next.previousSeen = false;
            next.previousMissingCount = 0;
            next.previousSnapshotSignature = "";
          } else if (previous.kind === "absent" && before.previousSeen) {
            next.previousSnapshotSignature = "";
            // This count becomes "Press STOP now", so only an answer that
            // carries realtime data may say the bus has left. Counting a
            // no-data answer (an outage, or a recovery that reached the exit
            // stop first) raised it before the bus had reached this stop.
            next.previousMissingCount = before.previousMissingCount + 1;
          } else if (previous.kind === "no-data") {
            next.previousSnapshotSignature = "";
          }
        } else if (previousResult.status === "rejected") {
          next.lastError =
            next.lastError ||
            "Previous-stop tracking is temporarily unavailable.";
        }

        onRuntime(next);
      } catch {
        // Everything the network can do is already absorbed by allSettled
        // above, so a throw here is a defect rather than an outage. It must
        // not escape as an unhandled rejection — nobody awaits this call —
        // and it must not end the ride: the panel keeps the state it had and
        // the next round is still booked below.
      } finally {
        // The next poll used to be booked only on the happy path, so one
        // unexpected throw ended live tracking for the rest of the ride with
        // nothing on screen to say so. A superseded poll still stays quiet:
        // the newer one owns the timer.
        if (active && !signal.aborted) schedule();
      }
    }

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timeoutId);
        void runPoll();
      }
    };

    const handleOnline = () => {
      // The gap that caused the backoff is over, so start the cadence again.
      consecutiveFailures = 0;
      window.clearTimeout(timeoutId);
      void runPoll();
    };

    void runPoll();
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
    };
  }, [
    onRuntime,
    readArrivalSignals,
    rideId,
    rideIdentity,
    runtimeRef,
    sessionRef,
  ]);
}
