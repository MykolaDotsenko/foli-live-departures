# Stop Radar / Compass specification

## Goal

Help a passenger physically walk to the correct Föli stop without adding a map provider, backend, account, analytics or hidden route switching.

## Interaction

- **Open stop radar** is an explicit control inside **Near you**.
- Opening the radar starts a high-accuracy `watchPosition`; closing it unmounts the feature and clears the watch.
- Sensor/location work pauses while the document is hidden.
- Compass permission is requested only from the explicit button gesture.
- The target is frozen on open. Re-ranking Nearby or changing live departure evidence does not silently move the radar target.
- Tapping a radar marker/chip changes radar guidance only. It does not change the departure board or active itinerary.
- **Open target stop** is the explicit action that changes the board.

## Target choice

Initial target priority:

1. current destination-aware Best stop, when already known;
2. currently selected public stop, when it has coordinates;
3. nearest stop after the first live fix.

The radar shows the nearest eight stops and always includes the selected target even if it is outside that set.

## Direction model

1. Safari `webkitCompassHeading`, when available;
2. standards-based absolute device orientation, converted from alpha to compass heading;
3. GPS direction-of-travel after movement exceeds the accuracy/jitter floor;
4. north-up radar when no reliable heading exists.

Relative/uncalibrated orientation is never presented as north-referenced compass guidance.

## Distance and safety

- Distance is WGS84 straight-line distance, updated from live GPS.
- GPS accuracy is always visible.
- Arrival is claimed only within 30 m **and** with <=30 m reported accuracy.
- With poorer accuracy, the UI says the target is within GPS uncertainty instead of claiming arrival.
- Radar range adapts through 200 / 400 / 800 / 1200 / 2000 m.
- A farther target is pinned to the edge and labelled as outside scale.
- The feature explicitly says it is **not a safe walking route**; it does not tell the passenger where to cross a road.

## Privacy / battery

- No GPS sample, compass heading or radar target is persisted.
- GPS/orientation remains on-device.
- No new network destination or analytics event is introduced.
- The component is lazy-loaded so the main bundle does not pay the full radar UI cost until requested.

## Acceptance evidence

Automated acceptance covers geometry, compass semantics, GPS-jitter rejection, sensor cleanup, explicit target switching, arrival uncertainty, lazy UI integration, mobile E2E and the normal PWA/CSP/bundle/accessibility gates.

Physical Android/iPhone compass calibration and outdoor walking remain part of the existing physical-device manual gates.
