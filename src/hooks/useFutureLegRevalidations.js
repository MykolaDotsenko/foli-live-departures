import { useMemo } from "react";
import { isCancelledHere } from "../components/departureBoard/departures";
import useStopAlerts from "./useStopAlerts";
import useTransferLegRevalidation from "./useTransferLegRevalidation";

/** @import { ActiveDirectJourney } from "../types/journey" */

function activeIndex(journey) {
  const value = Number(journey?.activeLegIndex);
  if (Number.isInteger(value) && value >= 0) return value;
  if (journey?.transferPlan && journey.transferLeg === 1) return 0;
  if (journey?.transferPlan && journey.transferLeg === 2) return 1;
  return null;
}

function legAt(journey, index) {
  if (journey?.itinerary?.legs?.[index]) {
    return journey.itinerary.legs[index];
  }
  if (index === 0 && journey?.transferPlan?.first) {
    return journey.transferPlan.first;
  }
  if (index === 1 && journey?.transferPlan?.second) {
    return journey.transferPlan.second;
  }
  return null;
}

function projectedArrival(leg, state) {
  const plannedArrival = Number(leg?.arrivalAt);
  const plannedDeparture = Number(leg?.departureAt);
  const liveDeparture = Number(state?.departureAt);
  if (!Number.isFinite(plannedArrival)) return null;
  if (
    state?.providerState !== "live" ||
    !Number.isFinite(plannedDeparture) ||
    !Number.isFinite(liveDeparture)
  ) {
    return plannedArrival;
  }
  return plannedArrival + (liveDeparture - plannedDeparture);
}

function liveStateForProjection(leg, state) {
  if (state?.providerState === "live") {
    const planned = Number(leg?.departureAt);
    const live = Number(state?.departureAt);
    return Number.isFinite(planned) &&
      Number.isFinite(live) &&
      Math.abs(live - planned) >= 30
      ? "delayed"
      : "live";
  }
  return leg?.liveState || "unknown";
}

function cancellationProbe(leg) {
  return leg
    ? {
        lineref: leg.lineRef,
        aimeddeparturetime: leg.aimedDepartureAt || leg.departureAt,
        originaimeddeparturetime:
          leg.originAimedDepartureAt || undefined,
      }
    : null;
}

function cancelledByAlerts(leg, alerts) {
  const probe = cancellationProbe(leg);
  return Boolean(
    probe &&
      isCancelledHere(
        probe,
        (alerts || []).filter((alert) => alert.type === "cancellation")
      )
  );
}

/**
 * At most three transit legs are supported, therefore two fixed live watchers
 * cover every committed future leg without dynamic hook invocation.
 *
 * @param {{
 *   enabled?: boolean,
 *   journey?: ActiveDirectJourney | null,
 *   routesById?: Map<string, any>,
 *   riding?: boolean,
 *   rideEtaSec?: number | null,
 *   rideEtaSource?: string,
 * }} input
 */
export default function useFutureLegRevalidations({
  enabled = true,
  journey = null,
  routesById = new Map(),
  riding = false,
  rideEtaSec = null,
  rideEtaSource = "",
} = {}) {
  const current = activeIndex(journey);
  const firstFutureIndex = current === null ? 1 : current + 1;
  const secondFutureIndex = firstFutureIndex + 1;
  const currentLeg = current === null ? null : legAt(journey, current);
  const firstFutureLeg = legAt(journey, firstFutureIndex);
  const secondFutureLeg = legAt(journey, secondFutureIndex);

  const firstLineRefs = useMemo(
    () => (firstFutureLeg?.lineRef ? [String(firstFutureLeg.lineRef)] : []),
    [firstFutureLeg?.lineRef]
  );
  const secondLineRefs = useMemo(
    () => (secondFutureLeg?.lineRef ? [String(secondFutureLeg.lineRef)] : []),
    [secondFutureLeg?.lineRef]
  );

  const { alerts: firstAlerts } = useStopAlerts(
    String(firstFutureLeg?.boardStopId || ""),
    firstLineRefs,
    routesById,
    {
      enabled: Boolean(enabled && firstFutureLeg),
      refreshIntervalMs: 60_000,
    }
  );
  const { alerts: secondAlerts } = useStopAlerts(
    String(secondFutureLeg?.boardStopId || ""),
    secondLineRefs,
    routesById,
    {
      enabled: Boolean(enabled && secondFutureLeg),
      refreshIntervalMs: 60_000,
    }
  );

  const firstIncomingArrivalAt =
    riding &&
    Number.isFinite(Number(rideEtaSec)) &&
    Number(rideEtaSec) >= 0
      ? Math.floor(Date.now() / 1000 + Number(rideEtaSec))
      : Number.isFinite(Number(currentLeg?.arrivalAt))
        ? Number(currentLeg.arrivalAt)
        : null;
  const firstIncomingLiveState = riding
    ? rideEtaSource === "live"
      ? "live"
      : rideEtaSource === "location"
        ? "delayed"
        : "schedule"
    : currentLeg?.liveState || "unknown";

  const first = useTransferLegRevalidation({
    enabled: Boolean(enabled && firstFutureLeg),
    journey,
    legIndex: firstFutureIndex,
    incomingArrivalAt: firstIncomingArrivalAt,
    incomingLiveState: firstIncomingLiveState,
    cancelled: cancelledByAlerts(firstFutureLeg, firstAlerts),
  });

  const firstProjectedArrivalAt = projectedArrival(firstFutureLeg, first);
  const firstProjectedLiveState = liveStateForProjection(firstFutureLeg, first);

  const second = useTransferLegRevalidation({
    enabled: Boolean(enabled && secondFutureLeg),
    journey,
    legIndex: secondFutureIndex,
    incomingArrivalAt: firstProjectedArrivalAt,
    incomingLiveState: firstProjectedLiveState,
    cancelled: cancelledByAlerts(secondFutureLeg, secondAlerts),
  });

  const states = [];
  if (firstFutureLeg && first.providerState !== "idle") {
    states.push({ legIndex: firstFutureIndex, state: first });
  }
  if (secondFutureLeg && second.providerState !== "idle") {
    states.push({ legIndex: secondFutureIndex, state: second });
  }

  return {
    states,
    immediate:
      firstFutureLeg && first.providerState !== "idle" ? first : null,
    firstFutureIndex,
    secondFutureIndex,
  };
}
