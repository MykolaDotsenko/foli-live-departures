import { useEffect } from "react";
import { repeatNowRideSignal, stopRideAlerts } from "../utils/rideAlerts";
import { RIDE_STAGE } from "../utils/rideProgress";

const NOW_REPEAT_MS = 5_000;
// Long enough for any dwell and a door that is slow to open. Past it the bus
// has left, whether or not anything could report that: with the network
// gone, a phone in a pocket otherwise repeated "get off now" until the ride
// expired hours later.
const NOW_REPEAT_LIMIT_MS = 3 * 60_000;

// "Get off now" keeps sounding while the passenger may still be aboard, and
// no longer: it stops once the bus is known to have gone, once it has run
// long enough for any dwell, and whenever the ride screen goes away.
export default function useRideNowAlarm({
  stage,
  stageChangedAt,
  targetMissingCount,
}) {
  // The vehicle leaving the target ends the alarm whether the passenger got
  // off or not. Repeating "get off now" at someone already standing on the
  // pavement is noise, and it cannot help anyone still aboard either. Once it
  // is sounding, two answers without the bus are enough: needing a sighting
  // of the bus standing at the stop first left the alarm running after a
  // reload, and after a dwell shorter than the poll.
  const targetVehicleGone =
    stage === RIDE_STAGE.NOW && targetMissingCount >= 2;
  const nowStartedAt = Number(stageChangedAt) || 0;

  useEffect(() => {
    if (stage !== RIDE_STAGE.NOW || targetVehicleGone) {
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
  }, [nowStartedAt, stage, targetVehicleGone]);

  useEffect(
    () => () => {
      stopRideAlerts();
    },
    []
  );
}
