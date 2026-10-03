import { useEffect } from "react";
import { primeRideVoices, unlockRideAudio } from "../utils/rideAlerts";

// Two things are dead on arrival unless they are prepared before the alarm
// needs them. Autoplay policy leaves the audio context suspended on a fresh
// page load, and a ride restored after a reload never runs the start-up test
// alert that would have unlocked it — so every tone for the rest of the ride
// is silently dropped. The speech engine's voice list is likewise empty until
// it fires `voiceschanged`, which is after the first thing we ask it to say.
export default function useRideAudioReadiness(rideId) {
  useEffect(() => {
    if (!rideId) return undefined;

    // Every tap during the ride gets the chance, not only the first: a call
    // or Siri interrupts the context again after it was unlocked, and only
    // a later gesture can be sure to bring it back.
    const tryUnlock = () => {
      void unlockRideAudio();
    };

    primeRideVoices();
    tryUnlock();
    document.addEventListener("pointerdown", tryUnlock);
    document.addEventListener("keydown", tryUnlock);

    return () => {
      document.removeEventListener("pointerdown", tryUnlock);
      document.removeEventListener("keydown", tryUnlock);
    };
  }, [rideId]);
}
