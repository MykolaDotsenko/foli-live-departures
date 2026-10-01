import { useCallback, useRef, useState } from "react";
import {
  activeJourneyFromOption,
  confirmActiveJourneyAtStop,
  observeActiveJourney,
} from "../utils/activeJourney";

/** @import { ActiveDirectJourney, DestinationIntent, DirectJourneyOption } from "../types/journey" */

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
    confirmAtStop,
    clearJourney,
    observeStopFeed,
  };
}
