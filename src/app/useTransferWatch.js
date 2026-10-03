import { useEffect, useMemo } from "react";
import useFutureLegRevalidations from "../hooks/useFutureLegRevalidations";
import { revalidateFutureJourneyLeg } from "../utils/activeJourney";
import { recordFieldDiagnosticObservation } from "../utils/fieldDiagnostics";

// The legs still ahead of a chosen transfer journey, watched against live
// data while the passenger waits or rides the leg before them: what they
// learn revalidates the selected journey and the one a ride carries on to.
export default function useTransferWatch({
  selectedJourney,
  pendingTransferJourney,
  ride,
  routesById,
  revalidateTransfer,
  updateRideContinuation,
}) {
  const activeRideSession = ride.session;
  const selectedFutureJourney =
    selectedJourney?.itinerary &&
    Number.isInteger(Number(selectedJourney.activeLegIndex)) &&
    Number(selectedJourney.activeLegIndex) <
      selectedJourney.itinerary.legs.length - 1 &&
    selectedJourney.phase !== "recovery"
      ? selectedJourney
      : null;
  const pendingFutureJourney =
    pendingTransferJourney?.itinerary &&
    Number.isInteger(Number(pendingTransferJourney.activeLegIndex)) &&
    Number(pendingTransferJourney.activeLegIndex) <
      pendingTransferJourney.itinerary.legs.length - 1 &&
    pendingTransferJourney.phase !== "recovery"
      ? pendingTransferJourney
      : null;
  const transferWatchJourney =
    selectedFutureJourney ||
    (ride.session ? pendingFutureJourney : null);

  const ridingSelectedTransfer =
    Boolean(ride.session) &&
    Boolean(transferWatchJourney) &&
    pendingTransferJourney?.id === transferWatchJourney?.id;
  const rideEtaSec = Number(ride.runtime?.etaSec);

  const futureLegWatch = useFutureLegRevalidations({
    enabled: Boolean(transferWatchJourney),
    journey: transferWatchJourney,
    routesById,
    riding: ridingSelectedTransfer,
    rideEtaSec:
      ridingSelectedTransfer &&
      Number.isFinite(rideEtaSec) &&
      rideEtaSec >= 0
        ? rideEtaSec
        : null,
    rideEtaSource: String(ride.runtime?.etaSource || ""),
  });
  const transferRevalidation = useMemo(
    () =>
      futureLegWatch.immediate || {
        providerState: "idle",
        decision: "unknown",
        departureAt: null,
        feasibility: null,
        missingSinceMs: null,
      },
    [futureLegWatch.immediate]
  );

  useEffect(() => {
    if (!transferWatchJourney || futureLegWatch.states.length === 0) {
      return;
    }

    for (const { legIndex, state } of futureLegWatch.states) {
      if (selectedJourney?.id === transferWatchJourney.id) {
        revalidateTransfer(state, legIndex);
      }

      if (
        activeRideSession &&
        pendingTransferJourney?.id === transferWatchJourney.id
      ) {
        updateRideContinuation((current) => {
          const currentJourney = current?.transferJourney || null;
          if (currentJourney?.id !== transferWatchJourney.id) return current;

          const nextJourney = revalidateFutureJourneyLeg(
            currentJourney,
            state,
            legIndex
          );
          return nextJourney === currentJourney
            ? current
            : { ...current, transferJourney: nextJourney };
        });
      }
    }
  }, [
    futureLegWatch.states,
    pendingTransferJourney,
    revalidateTransfer,
    activeRideSession,
    updateRideContinuation,
    selectedJourney,
    transferWatchJourney,
  ]);

  useEffect(() => {
    if (
      !ride.fieldDiagnosticsEnabled ||
      !ride.session ||
      transferRevalidation.providerState === "idle"
    ) {
      return;
    }
    recordFieldDiagnosticObservation({
      session: ride.session,
      runtime: ride.runtime,
      gps: ride.gps,
      transferRevalidation,
      futureLegRevalidations: futureLegWatch.states,
    });
  }, [
    ride.fieldDiagnosticsEnabled,
    ride.gps,
    ride.runtime,
    ride.session,
    transferRevalidation,
    futureLegWatch.states,
  ]);

  return transferRevalidation;
}
