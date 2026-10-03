# Ride Mode — reliability-first product specification

## Product goal

Ride Mode exists for one job:

> Let a passenger put the phone away and still know when to get ready, when to press STOP, and when to leave the vehicle.

A missed stop is the primary failure. The design therefore optimizes for early, redundant warning while refusing to present weak evidence as certainty.

## Decision audit

| Decision | User value | Reliability | Engineering | Decision |
| --- | ---: | ---: | ---: | --- |
| Three-stage warning: SOON → NEXT → NOW | 100 | 98 | 96 | Ship |
| Missed-stop recovery | 99 | 97 | 94 | Ship |
| GTFS trip stop sequence as route plan | 98 | 96 | 98 | Ship |
| Poll target + previous stop through SIRI Stop Monitoring | 94 | 91 | 96 | Ship in client MVP |
| Match ride by dated journey → trip → vehicle → line+origin time | 97 | 96 | 97 | Ship |
| Schedule + observed delay as offline/degraded fallback | 95 | 78 | 95 | Ship, but never claim schedule-only NOW |
| GPS as local redundancy during an explicitly active ride | 93 | 86 | 89 | Ship as recommended opt-in toggle |
| Test alert before relying on Ride Mode | 100 | 98 | 95 | Ship |
| Wake Lock while Ride Mode is visible | 88 | 72 | 92 | Ship as progressive enhancement |
| System notification while the page is alive | 92 | 76 | 87 | Ship as progressive enhancement |
| Persist and restore active ride | 96 | 90 | 95 | Ship |
| Repeat NOW haptic/tone until confirmed or evidence changes | 96 | 93 | 91 | Ship |
| Media Session metadata without active media | 60 | 35 | 70 | Do not rely on it |
| Silent audio loop to keep a browser tab alive | 70 | 30 | 35 | Reject |
| Background JavaScript as a guaranteed lock-screen tracker | 100 | 20 | 25 | Reject |
| Full Föli Vehicle Monitoring feed from every phone | 90 | 85 | 45 | Reject for client; backend cache only |
| Web Push from a small ride-tracking backend | 100 | 96 | 90 | Phase 2 |
| “Any weak source says NOW → tell user to exit” | 70 | 55 | 60 | Reject |
| Wrong-bus detection from simple GPS trend only | 85 | 45 | 55 | Reject until route-shape/map-matching evidence exists |

## Why the state machine is asymmetric

Stages are monotonic during an active warning:

```text
BOARDED → SOON → NEXT → NOW
                    ↘ MISSED
```

GPS jitter, timetable drift and ordinary provider corrections never retract a warning the passenger has already acted on. There is one deliberately narrow exception: **MISSED may be corrected** when a distinct, matched SIRI observation for the same concrete ride arrives *after* MISSED was entered and proves the bus is still at the target or has a non-negative live ETA to it. The old snapshot, schedule-only evidence and GPS alone cannot reopen MISSED.

The important distinction is **strong vs weak evidence**:

- weak evidence may move the user earlier to **SOON** or **NEXT**
- **NOW** requires stronger live/location evidence
- **MISSED** requires evidence that the target was reached/passed, not merely that its timetable time elapsed

This avoids the two worst UX failures:

1. no warning until it is too late
2. confidently telling someone to exit while the bus is still several stops away

## Evidence model

### Strong live evidence

- target row reports `vehicleatstop`
- fresh provider vehicle position is very near the target after NEXT
- local GPS is very near the target after NEXT
- target was at stop and then disappears from the target board

### Conservative early evidence

- target live ETA <= 90 seconds
- previous-stop row was observed and then disappears on consecutive successful polls while the target is still listed
- schedule fallback <= 90 seconds
- planned route has one remaining stop before target

### Degraded/offline evidence

At ride start, GTFS stop times are anchored to the selected departure's current realtime/planned departure timestamp. Relative planned offsets can therefore continue locally if requests fail.

Schedule-only evidence may emit SOON/NEXT, but it does **not** emit a definitive NOW or MISSED.

## Ride matching

A SIRI row is matched to the selected ride in this order:

1. `datedvehiclejourneyref`
2. `__tripref`
3. `vehicleref`
4. `lineref + originaimeddeparturetime`

A line number alone is never sufficient because multiple vehicles on the same line can be close together.

A matched row is live evidence only when the feed is tracking it (`monitored: true`):

- ride polling requests the realtime feed alone, never the departure board's GTFS timetable fallback, because those rows carry the same trip id
- an untracked row counts as the bus not being in the live data, and it cannot later arm the previous-stop check by dropping off the board
- an answer without realtime data (`NO_SIRI_DATA`, `PENDING`) at the target stop means the bus is not in the live data: a stop with nothing more coming can answer that way once the bus has left it, so holding the last sighting would keep the get-off alarm repeating
- the same answer at the previous stop never counts as the bus leaving it: that count raises NEXT, so it only follows answers that carry realtime data

Everything read from the target stop's row is only as current as the answer it arrived in:

- its live ETA counts down from that moment, and stops counting as live 120 s after it, when the timetable takes over
- its vehicle position ages from that moment too, so a failed poll cannot keep an old position (a loop's first pass near the stop, say) fresh enough to raise NOW
- sightings at the previous stop keep the ride's tracking badge live, but never refresh the target's estimate
- the panel says "Your bus is confirmed" only while the target (or the stop before it) answered live within the last 45 s, the same window the badge calls live, and never while the phone is offline, when the badge has already gone back to the timetable
- going by the timetable alone, the ETA reads "running late" once the target's timetable time is more than 30 s past; the timetable's own count of stops left is never used for that, because it runs on the same clock

## Client MVP data flow

```text
selected departure
      │
      ├─ GTFS stop_times/trip → ordered route plan
      │
      ├─ SIRI target stop ─────┐
      ├─ SIRI previous stop ───┼─ progress evaluator → Ride stage
      │                        │
      └─ optional device GPS ──┘
                                   │
                                   ├─ tone / vibration
                                   ├─ speech
                                   └─ system notification if available
```

Polling is intentionally limited to two stop-monitoring endpoints. This avoids downloading the large Vehicle Monitoring feed on every handset.

Föli documents the VM response as large and recommends a dedicated cache server when selected-vehicle tracking is needed. That is the Phase 2 architecture:
https://data.foli.fi/doc/siri/v0/vm-en

GTFS trip stop order comes from:
https://data.foli.fi/doc/gtfs/v0/stop_times-en

## Alert semantics

### SOON

Trigger conservatively when one of these is true:

- <= 3 planned stops remain and the timetable puts the stop <= 7 minutes away (the count alone only when there is no time): three stops out can be eighteen minutes out where the last stops are far apart
- live ETA <= 5 minutes
- schedule fallback ETA <= 5 minutes

The timetable raises no stage, by count or by time, before the bus is due to leave the boarding stop. Before then every stop is still ahead, and a one-stop ride set up twenty minutes early was told its stop was next.

Location raises no stage until the phone has set off from the boarding stop: two fixes in a row on the trip's shape, past the boarding stop by at least 40 m and by their own accuracy, and not standing still (a reported speed under 2 m/s does not count), or the bus seen leaving the stop before the exit live. Someone waiting at the boarding stop for a one-stop ride is already "400 m from the exit": their location said "Your stop is next" there, and a step along the platform said "Press STOP now" twenty minutes before the bus came. Once set off, it stays so for the ride. Until then the stages go by live data and the timetable, as without location.

Message: **Get ready — your stop is coming up.**

### NEXT

Trigger when one of these is true:

- live target ETA <= 90 seconds
- previous stop was observed, then is absent for two successful polls, while target remains listed
- <= 1 planned stop remains
- schedule fallback ETA <= 90 seconds

What NEXT asks for depends on whether the bus has left the stop before the exit. Pressing STOP asks for the next stop: pressed before the bus leaves the stop before the exit, it stops the bus there, the request is spent, and a passenger who then waits for their own stop rides past it. City-centre stops are about 300 m apart, closer than the 600 m and 90 s that raise NEXT, so a near exit is not evidence of that. The bus counts as having left that stop when:

- it was observed there live, then is absent for two successful polls, while the target remains listed, or
- the phone has set off, and two fixes in a row on the trip's shape are past it by at least 40 m and by their own accuracy, and not standing still. One vague fix just past it was enough before, while the bus could still be standing there.

On a one-stop ride the stop before the exit is the boarding stop, so setting off and "Press STOP now" come together, as one alert.

Until then, on a bus: **Get ready to press STOP. Press STOP when the bus leaves {previous stop}.** Once it has: **Next stop is yours. Press STOP now.**, sounded as an alert of its own when NEXT has already begun. It stays said once known. Non-bus trips, where getting ready early costs nothing, get **Get ready to exit at the next stop.** throughout.

### NOW

Requires stronger evidence:

- target row reports `vehicleatstop`
- fresh provider vehicle position is <= 60 m from target after NEXT
- local GPS is <= 60 m from target after NEXT, or, when the trip's shape is in use, a fresh fix (at most 60 s old, accurate to 120 m) matched onto it from 30 m past the stop to 110 m before it along the route, near the end of the ride

Message: **This is your stop. Exit now.**

The alert repeats every 5 s until one of these ends it:

- the passenger confirms
- two answers from the target stop after NOW began no longer list the bus; no sighting of the bus standing at the stop is needed, because a reloaded page has none and a 20 s poll can miss a short dwell
  - an untracked row for the journey still lists it: the feed has lost the bus, not seen it leave, so at NOW it neither counts nor resets the count
- three minutes have passed, which also covers a network that can report nothing at all

### MISSED

Requires post-target evidence. Before NOW has fired:

- target was previously reported at stop and is then absent
- or local GPS passes the target along the route shape, from a fix at most 60 s old: an older one, kept through a GPS dropout, says nothing about where the bus is now
- or, when no route shape is available, local GPS was near the target and then moves > 250 m away, counting only fixes accurate to 50 m: two fixes 300 m wide once ended a ride a minute before its stop. With a shape, straight-line distance cannot raise NOW, and a loop swinging back past the stop looks the same as riding on, so it cannot raise MISSED either

After NOW, the bus leaving and the phone moving away is exactly what a successful exit looks like, so only GPS passing the target along the route counts, and only at riding pace: a reported speed of at least 3 m/s, or, when the phone reports no speed, within 90 s of NOW. Someone who got off and walks on down the same street is not told their stop is behind them.

Message: **It looks like your stop is behind you. Get off at the next stop.**

MISSED is fail-closed, not blindly permanent. A correction requires all of the following:

- the target-stop row still matches the committed concrete ride identity;
- the provider observation is distinct and was received after MISSED began;
- the row is live/monitored and still places the bus at the target or in the future of the target;
- the pass latch is no longer confirmed, and no fresh fix still places the phone past the target along the route.

A repeated pre-miss snapshot, timetable fallback, a network recovery without new transit evidence, or location alone cannot retract MISSED. When those conditions are met, the normal stage thresholds run again (BOARDED/SOON/NEXT/NOW) and any renewed actionable warning is announced normally.

## Browser reliability boundary

The client MVP deliberately does **not** promise guaranteed lock-screen/background tracking.

What it does:

- requests Screen Wake Lock while the Ride Mode page is visible
- persists ride state without storing GPS coordinates
- restores and immediately re-evaluates a ride when the app reopens
- can show system notifications while JavaScript is still executing
- explicitly labels tracking health: live, delayed, or schedule fallback

What it does not do:

- silent-media hacks
- claims that iOS/Android will keep JavaScript alive after the OS suspends the page
- claims that vibration works on iOS web
- claims that a browser notification is equivalent to server Web Push

Reliable “phone locked in pocket” operation requires Phase 2: a tiny backend cache + ephemeral ride session + Web Push.

## Privacy

GPS backup is presented during Ride Mode setup as a recommended checkbox.

When enabled:

- location starts only after the user presses Start ride
- coordinates are used only in memory
- coordinates are never added to the persisted ride record
- watchPosition is stopped when Ride Mode ends
- no coordinates are sent to a backend

The persisted ride contains public transit identifiers, target stop identity, route plan, already-emitted stage and expiry.

## Expiry and cleanup

- ride sessions expire automatically after six hours
- Turn off alert clears persisted ride state. It takes a second tap within four seconds, in the panel and in the off-route question alike: the screen is kept awake in a pocket, and one stray touch cancelled the alert the passenger was counting on
- ride notifications are off until the passenger asks for them, so Start does not raise a location prompt, a notification prompt and the test sound at once
- geolocation watch is stopped
- Wake Lock is released
- speech and repeated NOW alerts are cancelled
- notifications use one stable tag so a later alert replaces the previous ride alert

## Testing contract

### Pure unit tests

- trip matcher priority
- schedule anchoring
- active-warning stage monotonicity
- SOON/NEXT schedule fallback
- NOW strong-evidence requirement
- MISSED strong-evidence requirement, and no MISSED for someone walking on after NOW
- false-MISSED correction only from a newer matched live target observation; stale live, schedule and GPS evidence cannot reopen it

### Hook/component tests

- persisted ride restore
- GPS cleanup
- alert transition de-duplication
- NOW repeat stops after ride completion, once the bus has gone (including after a reload at NOW), and after three minutes
- target estimates count down and target positions age while polls fail
- the tracking badge and the "confirmed" row never disagree

### E2E

- select a trip
- choose a downstream stop
- start Ride Mode
- confirm test alert UX
- feed live target ETA <= 90 s
- verify NEXT state and “Press STOP now”
- finish ride and verify Ride Mode disappears

## Phase 2

For truly reliable pocket mode:

```text
Föli VM (3–5 s shared poll)
        ↓
small cache / ride worker
        ↓
ephemeral vehicle + target session
        ↓
Web Push
        ↓
lock-screen notification / wearable
```

The backend does not need user GPS. It needs only vehicle/trip identity, target stop, push subscription and expiry.
