import { useCallback, useRef, useState } from "react";
import { applyTransferRevalidation } from "../utils/transferRevalidation";
import {
  activeJourneyFromOption,
  activeJourneyFromTransferOption,
  completedTransferJourney,
  confirmActiveJourneyAtStop,
  observeActiveJourney,
  recoverTransferJourneyAfterRide,
} from "../utils/activeJourney";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption, TransferJourneyOption } from "../types/journey" */

export default function useActiveJourney() {
  /** @type {[ActiveDirectJourney | null, import("react").Dispatch<import("react").SetStateAction<ActiveDirectJourney | null>>]} */
  const [journey, setJourneyState] = useState(null);
  const journeyRef = useRef(journey);
  journeyRef.current = journey;

  /**
   * @param {ActiveDirectJourney | null | ((current: ActiveDirectJourney | null) => ActiveDirectJourney | null)} nextOrUpdater
   */
  const commit = useCallback((nextOrUpdater) => {
    setJourneyState((current) => {
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current)
          : nextOrUpdater;
      journeyRef.current = next;
      return next;
    });
  }, []);

  /**
   * @param {DirectJourneyOption} option
   * @param {DestinationIntent} destination
   */
  const selectDirectJourney = useCallback(
    (option, destination) => {
      const next = activeJourneyFromOption(option, destination);
      if (!next) return false;
      commit(next);
      return true;
    },
    [commit]
  );

  /**
   * @param {TransferJourneyOption} option
   * @param {DestinationIntent} destination
   */
  const selectTransferJourney = useCallback(
    (option, destination) => {
      const next = activeJourneyFromTransferOption(option, destination);
      if (!next) return false;
      commit(next);
      return true;
    },
    [commit]
  );

  /**
   * @param {ActiveDirectJourney | null | undefined} pending
   * @param {any} rideSession
   */
  const continueTransferAfterRide = useCallback(
    (pending, rideSession) => {
      const next = completedTransferJourney(pending, rideSession);
      if (!next) return null;
      commit(next);
      return next;
    },
    [commit]
  );

  /**
   * @param {ActiveDirectJourney | null | undefined} pending
   * @param {any} rideSession
   */
  const recoverTransferAfterRide = useCallback(
    (pending, rideSession) => {
      const next = recoverTransferJourneyAfterRide(pending, rideSession);
      if (!next) return null;
      commit(next);
      return next;
    },
    [commit]
  );

  /**
   * @param {import("../types/journey").TransferRevalidationState} revalidation
   */
  const revalidateTransfer = useCallback(
    (revalidation) => {
      commit((current) => applyTransferRevalidation(current, revalidation));
    },
    [commit]
  );

  const confirmAtStop = useCallback(() => {
    commit((current) => confirmActiveJourneyAtStop(current));
  }, [commit]);

  const clearJourney = useCallback(() => {
    commit(null);
  }, [commit]);

  const observeStopFeed = useCallback(
    /**
     * @param {{
     *   stopId: string,
     *   arrival: any | null,
     *   referenceTimeSec: number | null,
     *   receivedAtMs: number | null,
     *   feedError?: boolean,
     *   cancelled?: boolean,
     * }} observation
     */
    (observation) => {
      commit((current) => observeActiveJourney(current, observation));
    },
    [commit]
  );

  return {
    journey,
    selectDirectJourney,
    selectTransferJourney,
    continueTransferAfterRide,
    recoverTransferAfterRide,
    revalidateTransfer,
    confirmAtStop,
    clearJourney,
    observeStopFeed,
  };
}
