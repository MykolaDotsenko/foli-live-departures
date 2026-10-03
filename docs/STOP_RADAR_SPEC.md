# Stop Radar / Compass specification

## Goal

Help a passenger physically walk to the correct Föli stop without adding a map provider, backend, account, analytics or hidden route switching.

## Interaction

- **Open stop radar** is an explicit control inside **Near you**.
- Opening the radar starts a high-accuracy `watchPosition`; closing it unmounts the feature and clears the watch.
- Sensor/location work pauses while the document is hidden.
- A passing location error (no signal, or no fix within the timeout) keeps the last fix and its direction of travel on screen, marked **Waiting for a new GPS fix…**. Only a permission refusal ends the radar's location; before any fix, an error is shown as before.
- Compass permission is requested only from the explicit button gesture.
- The target is frozen on open. Re-ranking Nearby or changing live departure evidence does not silently move the radar target.
- Tapping a radar marker/chip changes radar guidance only. It does not change the departure board or active itinerary.
- **Open target stop** is the explicit action that changes the board.

## Target choice

Initial target priority:

1. current destination-aware Best stop, when already known;
2. currently selected public stop, when it has coordinates;
3. nearest stop after the first live fix.

The radar considers the nearest eight stops and always includes the selected target even if it is outside that set. Each marker carries its stop number, and the target chooser lists name, stop number and distance, so two stops sharing a name (platforms, opposite sides of a street) can be told apart. Markers closer than about 24 px to an already drawn one are drawn but not tappable; the chooser offers the same choice with full-size targets.

## Direction model

1. Safari `webkitCompassHeading`, when available;
2. standards-based absolute device orientation, converted from alpha to compass heading;
3. GPS direction-of-travel after movement exceeds the accuracy/jitter floor;
4. north-up radar when no reliable heading exists. North-up guidance names the compass point to walk towards, with the bearing: **Head west (257°)**.

With a compass or direction of travel, a soft cone marks the top of the radar as the way the passenger faces or walks.

Relative/uncalibrated orientation is never presented as north-referenced compass guidance.

## Distance and safety

- Distance is WGS84 straight-line distance, updated from live GPS.
- GPS accuracy is always visible, as text and as a circle drawn to the radar's scale.
- Arrival is claimed only within 30 m **and** with <=30 m reported accuracy.
- With poorer accuracy, the UI says the target is within GPS uncertainty instead of claiming arrival.
- Radar range follows the target: the smallest of 50 / 100 / 200 / 400 / 800 / 1200 / 2000 m that holds the target with a quarter to spare, so the last hundred metres get a 50–100 m scale. The scale widens at once when the target would leave it and narrows only when the target is within two thirds of the smaller scale, so it does not flip at a boundary. The outer ring is the scale and is labelled with it.
- Other stops beyond the scale are left off the radar (the chooser still lists them). A target beyond 2 km is pinned to the edge and labelled as outside scale.
- The feature explicitly says it is **not a safe walking route**; it does not tell the passenger where to cross a road.

## Privacy / battery

- No GPS sample, compass heading or radar target is persisted.
- GPS/orientation remains on-device.
- No new network destination or analytics event is introduced.
- The component is lazy-loaded so the main bundle does not pay the full radar UI cost until requested.

## Acceptance evidence

Automated acceptance covers geometry, compass semantics, GPS-jitter rejection, sensor cleanup, explicit target switching, arrival uncertainty, lazy UI integration, mobile E2E and the normal PWA/CSP/bundle/accessibility gates.

Physical Android/iPhone compass calibration and outdoor walking remain part of the existing physical-device manual gates.
