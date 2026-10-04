# Stop Radar / Compass specification

## Goal

Help a passenger physically walk to the correct Föli stop without adding a map provider, backend, account, analytics or hidden route switching.

## Interaction

- **Open stop radar** is an explicit control inside **Near you**.
- Opening the radar starts a high-accuracy `watchPosition`; closing it unmounts the feature and clears the watch.
- Opening brings the radar's top into view and moves focus to its heading, so it does not open unseen below the fold on a phone. If the passenger has moved focus elsewhere while the radar loaded, neither happens.
- While it has a fix to guide from, the radar holds a screen wake lock, as Ride Mode does, so a walk is not cut short by the screen's auto-lock. The lock goes when the radar closes or the page is hidden.
- Sensor/location work pauses while the document is hidden. The last fix stays on screen and, back in the foreground, is marked **Waiting for a new GPS fix…** until the new watch answers. No direction of travel is read across the pause.
- A passing location error (no signal, or no fix within the timeout) keeps the last fix and its direction of travel on screen, marked **Waiting for a new GPS fix…**. Only a permission refusal ends the radar's location; before any fix, an error is shown as before.
- Compass permission is requested only from the explicit button gesture.
- The target is frozen on open. Re-ranking Nearby or changing live departure evidence does not silently move the radar target.
- Tapping a radar marker/chip changes radar guidance only. It does not change the departure board or active itinerary.
- **Open target stop** is the explicit action that changes the board. It closes the radar and moves focus to the board's heading.
- The radar seeds **Near you** from its first fix only, so destination-aware planning is not restarted by every step. While the radar is open, those one-time results (with their now-stale distances) are hidden; closing the radar seeds them again from its last fix.

## Target choice

Initial target priority:

1. current destination-aware Best stop, when already known;
2. currently selected public stop, when it has coordinates;
3. nearest stop after the first live fix.

The radar considers the nearest eight stops and always includes the selected target even if it is outside that set. Each marker carries its stop number, and the target chooser lists name, stop number and distance, so two stops sharing a name (platforms, opposite sides of a street) can be told apart. So that numbers stay readable, a marker is drawn only at least 10.5% of the radar's width from markers already drawn (13% from the larger target marker) and 6% from the passenger's own dot; the target is always drawn. Stops left off come back as the scale narrows, and the chooser offers every stop with full-size targets.

## Direction model

1. Safari `webkitCompassHeading`, when available;
2. standards-based absolute device orientation, converted from alpha to compass heading;
3. GPS direction-of-travel: the browser's own heading while moving at 0.5 m/s or more; otherwise the bearing from where the walk was last measured, once the passenger has moved past the accuracy/jitter floor (at least 8 m) within 15 s. Measured from that point rather than from the previous fix, a walker's 1.4 m between fixes a second apart adds up instead of never reaching the floor;
4. north-up radar when no reliable heading exists. North-up guidance names the compass point to walk towards, with the bearing: **Head west (257°)**.

Both compass sources give the heading of the phone's top edge held upright; the screen's orientation angle is added, so the radar stays correct with the phone on its side.

With a compass or direction of travel, a soft cone marks the top of the radar as the way the passenger faces or walks.

Relative/uncalibrated orientation is never presented as north-referenced compass guidance.

## Offline spatial context

The radar adds a lightweight map-like background without introducing a map SDK or a new network destination:

- it reuses the already-shipped OpenStreetMap address pack;
- the pack is loaded lazily only after the radar has a live position;
- a small in-memory grid index prevents scanning all 33k+ address rows on every GPS fix;
- nearby address points become subtle **building cues** rather than claimed building footprints, kept about 6% of the radar's width apart so they spread over the scale instead of piling up around the passenger's dot;
- the address points of each of the six nearest named streets are reduced to an approximate **street axis**: the line they lie along, across their extent within the scale. Addresses that do not line up (a square, a block around a courtyard) draw no axis, so no line crosses a square as if it were a street;
- the context is chosen once per fix and scale, and only rotated by the compass/motion heading, so roads do not remain north-up while the radar rotates and a compass turning many times a second does not choose it again;
- at most 40 building cues and 6 street axes are drawn, and the context is capped to the closest 500 m so it cannot turn into a dense general-purpose map;
- the arrow from the passenger points at the target and ends at its marker's edge. It is a straight-line orientation cue, **not** a walking route, and no separate line is drawn that could be read as one more street;
- all context SVG is `aria-hidden` and `pointer-events: none`, so stop markers remain the only interactive objects inside the radar.

The context fails open: if the address pack cannot be loaded, the GPS/compass radar continues to work exactly as before.

## Distance and safety

- Distance is WGS84 straight-line distance, updated from live GPS.
- GPS accuracy is always visible, as text and as a circle drawn to the radar's scale.
- Arrival is claimed only within 30 m **and** with <=30 m reported accuracy. Once claimed, it holds until the distance or the accuracy passes 40 m, so GPS noise at the threshold does not make it come and go.
- With poorer accuracy, the UI says the target is within GPS uncertainty instead of claiming arrival.
- Radar range follows the target: the smallest of 50 / 100 / 200 / 400 / 800 / 1200 / 2000 m that holds the target with a quarter to spare, so the last hundred metres get a 50–100 m scale. The scale widens at once when the target would leave it, and narrows to the closest scale that holds the target within two thirds of it, so it does not flip at a boundary. A newly chosen target gets its own scale at once, and so does the first fix: the 200 m shown before it does not hold. The outer ring is the scale and is labelled with it.
- Other stops beyond the scale are left off the radar (the chooser still lists them). A target beyond 2 km is pinned to the edge and labelled as outside scale.
- The feature explicitly says it is **not a safe walking route**; it does not tell the passenger where to cross a road.
- A screen reader hears the distance and the way to go (`120 m. Slightly left`) from a polite status, when the distance has changed by a quarter (at least 10 m), on arrival or a new target, and on a new direction no sooner than 8 s after the last announcement. The line of mode, accuracy and scale is not a live region.

## Privacy / battery

- No GPS sample, compass heading or radar target is persisted. The last fix is kept in memory only while the radar is open, including through a background pause.
- GPS/orientation remains on-device.
- No new network destination or analytics event is introduced.
- Street/building context reuses the same-origin ODbL address pack that the destination search already ships and caches.
- The component is lazy-loaded so the main bundle does not pay the full radar UI cost until requested.

## Acceptance evidence

Automated acceptance covers geometry, compass semantics, GPS-jitter rejection, sensor cleanup, explicit target switching, arrival uncertainty, offline street/building context, lazy UI integration, mobile E2E and the normal PWA/CSP/bundle/accessibility gates.

Physical Android/iPhone compass calibration and outdoor walking remain part of the existing physical-device manual gates.
