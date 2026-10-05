# Destination-aware Nearby — product and implementation specification

> **Canonical implementation contract:** [Journey Assistant specification](JOURNEY_ASSISTANT_SPEC.md). This document is the detailed UX/edge-case appendix.

**Status:** canonical design appendix; core destination-aware routing is implemented through PR #139, while field tuning/manual validation remains open  
**Scope:** pre-boarding decision support from “I am here” to “I am waiting at the right stop for the right bus”  
**Primary design principle:** show every useful nearby stop, rank by actual usefulness for the passenger’s destination, explain why, and never hide uncertainty.

---

## 1. Problem

The existing **Near you** feature answers a geographical question:

> Which Föli stops are closest to me?

That is useful, but it does not answer the passenger’s more important travel question:

> Which nearby stop should I use to reach where I actually want to go?

This fails most visibly in dense hubs such as central Turku, where several platforms may be physically close while serving different directions, branches or journeys. A passenger can receive six nearby stops and still not know which one to walk to.

The product must preserve the current “find nearby stops” capability while adding a destination-aware decision layer.

The intended result is:

- no destination selected → sort by proximity;
- destination selected → sort by usefulness for that journey;
- keep all nearby stops visible;
- clearly mark which stops/trips fit the destination and which do not;
- use concrete trip order, not route number alone;
- favour stable, realistic, catchable options over mathematically fastest-but-fragile ones;
- hand the chosen journey cleanly into the existing get-off alert.

---

## 2. Product boundary

### In scope

- Home / Work / School as saved destinations.
- Any selected public Föli stop as a destination.
- Current device location as the origin when permission is available.
- Nearby stop discovery.
- Direct-trip suitability.
- Direction validation using exact trip stop order.
- Catchability estimation.
- Fresh live vs scheduled-data semantics.
- Disruption-aware ranking.
- Primary vs approved backup saved-place stops.
- Stable ranking and recovery when a bus departs, is cancelled or a stop becomes unusable.
- Destination-aware departure-board ordering.
- Handoff to walking directions and Ride Mode.

### Explicitly not required for phase 1

- Full multimodal journey planning.
- Transfer optimisation.
- Arbitrary street-address geocoding.
- A proprietary pedestrian-routing engine.
- Guaranteed background navigation.
- Automatic switching to a different stop after the passenger has committed to one.
- Hiding nearby stops that do not fit the current destination.

Complex journeys continue to hand off to Google Maps or another external journey planner.

---

## 3. Mental model

The UI must keep three concepts distinct.

### Near

A stop is physically close to the passenger.

### Useful

At least one concrete upcoming trip from that stop can serve the chosen destination later in the same trip.

### Best

Among useful stops, this is currently the strongest practical option after considering:

- whether it is catchable;
- total expected journey time;
- live-data confidence;
- disruption state;
- primary vs backup destination;
- walking burden;
- frequency / backup departures;
- stability of the recommendation.

A stop can therefore be:

- **nearest but not useful**;
- **useful but not best**;
- **best even when it is not nearest**.

The UI must make this difference obvious.

---

## 4. Top-level interaction model

### 4.1 No destination selected

The section is:

> **Stops near me**

Default sort:

> **Nearest**

The current nearby-stop behaviour remains available.

Each card shows:

- stop/platform name;
- stop ID;
- approximate straight-line distance;
- nearest badge where applicable;
- open stop;
- walking directions where available.

No route suitability language is shown because there is no destination context.

### 4.2 Destination selected

The section becomes:

> **Nearby stops for Home**

or:

> **Nearby stops for Work**  
> **Nearby stops for School**  
> **Nearby stops for Turun linna**

Default sort:

> **Best for Home**

A segmented control allows:

> **Best for Home | Nearest**

Every nearby stop remains visible. The sort mode changes ordering, not membership.

A persistent destination chip remains visible:

> **To: Home ▾  ×**

The passenger can:

- change destination;
- clear destination;
- switch to geographic sorting;
- open any stop regardless of recommendation status.

---

## 5. Entry points

Destination intent can be created from several surfaces.

### 5.1 Primary everyday actions

At the top of the pre-ride experience:

> **Where are you going?**

Quick actions:

- Home
- Work
- School
- Choose destination

Only configured saved places appear as one-tap actions.

### 5.2 Existing Home feature

The normal action becomes:

> **Go Home**

This sets destination = Home and opens the destination-aware nearby flow.

The existing recovery functions remain separate:

- Show to driver
- Print / save Home backup card
- Full route in Google Maps

Normal travel and emergency/recovery language must not be conflated.

### 5.3 Stop search

When a passenger searches and chooses a stop, offer:

> **Go to this stop**

This sets the chosen stop as the destination.

Opening a stop merely to inspect departures must remain possible without changing destination intent.

### 5.4 Destination selector

The selector contains:

- Home / Work / School when configured;
- saved place destinations;
- search for a Föli stop;
- clear destination.

Phase 1 does not require arbitrary addresses.

---

## 6. Destination representation

A destination is not necessarily one stop.

### Saved place

A saved place may contain:

- one primary stop;
- zero or more approved backup stops.

The ranking engine evaluates all approved destination stops but preserves their semantics.

Primary receives a preference. A backup can win only when it offers a materially better journey or the primary option is degraded.

### Public stop destination

A manually selected Föli stop is a single target.

### Required derived destination shape

Conceptually:

```text
DestinationIntent
  id
  kind: saved-place | public-stop
  label
  primaryStopId
  acceptableStopIds[]
  createdAt
```

No private street address is required.

---

## 7. Nearby discovery

### 7.1 Candidate set

Do not reduce the feature to one or three stops.

Use a bounded candidate set large enough for dense hubs, for example:

- closest 8–12 stops;
- or all stops inside a sensible local radius with a hard cap.

The exact cap is an implementation parameter and should be validated against Turku city-centre density.

### 7.2 Grouping

Stops with the same public place name may be visually grouped under a hub heading while remaining distinct stop IDs.

Example:

> **Kauppatori**
>
> D2 · Best for Home  
> A1 · Also works  
> B3 · Other direction  
> C1 · No direct trip

Grouping is presentational only. Trip matching always uses concrete stop IDs and stop sequence.

### 7.3 Distance semantics

Current nearby distance is straight-line distance, not pedestrian-route distance.

The UI must keep that claim truthful.

Use wording such as:

> **160 m away**

Do not present:

> **2 min walk**

unless a real walking-route estimate is available.

For catchability, an internal conservative estimate may use straight-line distance with a safety factor and buffer, but this must not be presented as precise walking navigation.

---

## 8. Trip suitability — hard validation

A route number is never enough.

For each upcoming departure from a nearby stop, the system must determine whether the **specific trip** serves an acceptable destination stop later in that trip.

A trip is destination-compatible only when all applicable conditions hold:

1. the boarding stop can be resolved to the concrete trip occurrence;
2. the destination stop occurs downstream of that boarding occurrence;
3. for loop routes, the selected destination occurrence is the first valid downstream occurrence;
4. a short-turn trip must not be treated as serving a destination beyond its actual end;
5. branch variants are evaluated independently;
6. the destination occurrence permits alighting when GTFS data exposes a restrictive `drop_off_type`;
7. a cancelled trip is not usable;
8. a closed or unusable boarding stop is not recommended;
9. stale or missing live data affects confidence, not the underlying GTFS trip topology.

Conceptually:

```text
compatible =
  boardingSequence is known
  AND destinationSequence > boardingSequence
  AND destination is reachable on this concrete trip
  AND trip/stop is not disqualified
```

For loops and repeated stop IDs, sequence is authoritative; stop ID alone is insufficient.

---

## 9. Stop-level evaluation

A stop is evaluated from its upcoming departures.

For each candidate stop derive:

- best suitable departure;
- additional suitable departures inside a near-term horizon;
- first catchable suitable departure;
- destination stop served;
- primary vs backup destination;
- expected departure;
- scheduled departure;
- live freshness;
- ride duration;
- disruption state;
- catchability state;
- reason if no suitable departure exists.

A stop can therefore contain both:

- useful departures;
- unrelated departures.

The stop itself is not labelled “wrong direction” if it has at least one suitable departure.

---

## 10. Suitability tiers

Do not rely on one weighted score to decide eligibility.

Use ordered semantic tiers first.

### Tier A — Best-capable

A direct trip is:

- destination-compatible;
- realistically catchable;
- not cancelled;
- boarding stop usable;
- confidence acceptable.

These are candidates for **Best** or **Good**.

### Tier B — Direct, lower confidence

A direct trip is valid but:

- schedule-only;
- live data delayed;
- location confidence weaker;
- timing is less certain.

Still useful, but visually less confident.

### Tier C — Direct service, next immediate trip not catchable

The stop has direct service, but the earliest relevant trip is likely too soon. A later suitable trip may still make the stop useful.

The card should rank using the **first catchable** suitable departure, not the impossible one.

The too-soon departure may be shown as context.

### Tier D — Direct but materially inferior

The stop works but is clearly worse than stronger options due to:

- much longer total time;
- much more walking;
- poor frequency;
- backup destination with little benefit;
- significant uncertainty.

Still visible.

### Tier E — No direct service

No evaluated upcoming trip from this stop reaches an acceptable destination downstream.

### Tier F — Other direction

Relevant route numbers may be present, but the concrete departures do not serve the destination downstream.

This is especially valuable for opposite-side-of-road and hub-platform scenarios.

### Disqualified

Examples:

- cancellation;
- stop closure;
- known impossible boarding;
- invalid/corrupt trip topology.

Disqualified options remain visible only when useful for explanation, never as recommended choices.

---

## 11. Catchability model

Catchability must be conservative.

### Inputs

- straight-line distance to stop;
- GPS accuracy;
- time to departure;
- whether departure is live or scheduled;
- whether passenger is already effectively at the stop;
- safety buffer.

### Internal estimate

A conservative model may use:

```text
effectiveDistance =
  straightLineDistance × detourFactor
  + locationUncertaintyAllowance

estimatedAccessTime =
  effectiveDistance / conservativeWalkingSpeed
  + crossingAndDecisionBuffer
```

Exact constants should be tuned with field tests rather than presented as objective walking times.

### States

- **At stop** — strong confidence the passenger is already at/very near the boarding stop.
- **Comfortably catchable** — large margin.
- **Likely catchable** — positive but smaller margin.
- **Tight** — uncertainty may consume the margin.
- **Probably too late** — should not be the recommended departure.
- **Unknown** — insufficient location/time confidence.

The product must never encourage unsafe rushing.

Avoid copy such as:

> Run — you can still make it.

Use:

> **Timing may be tight**

or:

> **Probably too late to catch**

---

## 12. Earliest-arrival engine and total journey utility

The primary practical question is not “which stop is closest?” or even “which bus leaves first?”. It is:

> **Which realistic option gets me to my destination earliest from where I am now?**

This is the central ranking signal.

### 12.1 Absolute arrival time is the key quantity

For every catchable suitable departure derive an estimated destination-arrival timestamp.

Conceptually:

```text
now
→ reach boarding stop
→ catch concrete departure
→ ride
→ arrive at selected destination stop
```

For a fixed departure, walking time and waiting time overlap: if a bus leaves in 10 minutes and the stop takes about 5 minutes to reach, the passenger walks for about 5 minutes and then waits about 5 minutes. Therefore the fastest-arrival calculation must not double-count access time.

For a catchable direct trip:

```text
timeToDestination ≈ expectedDestinationArrival - now
```

Access time is primarily used to decide whether that departure is realistically catchable and how burdensome the option is.

### 12.2 Destination-arrival evidence hierarchy

Prefer the strongest available evidence for the concrete trip:

1. **Fresh destination-stop live prediction for the same trip**, when the destination stop's realtime data can be matched safely.
2. **Fresh boarding live prediction + GTFS downstream timing**, propagating the currently observed delay to the destination as an estimate.
3. **GTFS scheduled downstream arrival**, explicitly lower confidence.
4. If none of these can be established safely, do not invent a destination ETA.

A repeated identical realtime snapshot does not become fresh merely because another HTTP response arrived.

### 12.3 Delay propagation

If the boarding stop has a trustworthy live expected departure but the destination stop does not have a fresh matched prediction, derive a provisional downstream arrival using the trip's scheduled timing relationship.

Conceptually:

```text
observedBoardingDelay =
  liveBoardingDeparture - scheduledBoardingDeparture

estimatedDestinationArrival =
  scheduledDestinationArrival + observedBoardingDelay
```

This is an estimate, not a guarantee: a bus may recover or lose more time later. The UI should present it as approximate.

If a fresh destination-stop prediction becomes available, it replaces the propagated estimate.

### 12.4 Example: farther stop wins decisively

Current position:

- Stop A: 80 m away.
- Suitable bus from A: departs in 30 min.
- Stop B: 280 m away.
- Suitable bus from B: departs in 10 min.
- B takes roughly 5 min more effort to reach than A.
- Both trips have similar ride duration.

Stop B should rank first because the passenger reaches Home substantially earlier.

The UI should explain the trade-off:

> **★ FASTEST TO HOME**  
> Kauppatori D2 · 280 m away  
> 18 · leaves in ~10 min  
> **Home stop in ~27 min**  
> About **18 min faster** than the closest-stop option

The geographically nearest stop remains in the list:

> **CLOSER, BUT SLOWER**  
> Kauppatori A1 · 80 m away  
> Next suitable bus in ~30 min  
> Home stop in ~45 min

This directly answers why a farther stop ranks higher.

### 12.5 Example: farther stop should *not* win for a trivial gain

- Stop A: 80 m away, destination arrival in ~24 min.
- Stop B: 450 m away, destination arrival in ~23 min.

The one-minute theoretical gain is not worth a much longer walk for most passengers.

Both belong to the same near-optimal band. Prefer A because it has lower access burden and is less fragile.

### 12.6 Example: earlier departure can still be slower

- Stop A: bus leaves in 4 min, ride to destination ~31 min.
- Stop B: bus leaves in 8 min, ride ~15 min.

If B is catchable, B should rank first because its destination arrival is much earlier.

Never rank solely by departure countdown.

### 12.7 Example: fast bus that cannot be caught

- Stop A: bus leaves in 3 min, stop is far enough away that timing is unsafe/tight.
- Stop B: bus leaves in 9 min and is comfortably catchable.

A must not rank first merely because its theoretical destination arrival is earlier.

Use the first realistically catchable suitable departure for each stop.

### 12.8 Arrival time shown to the passenger

When confidence is sufficient, the top card should show both relative and clock-time information:

> **Home stop in ~27 min**  
> Arrive about **22:04**

This is more actionable than showing only:

> Bus in 10 min

because it lets the passenger compare complete outcomes.

For saved places represented only by public stops, the truthful wording is **Home stop**, **Work stop**, etc. The app does not know the private door-to-door endpoint.

For a manually chosen public stop:

> **Turun linna in ~24 min**

Do not claim exact door-to-door arrival without a real final-walk route.

### 12.9 Journey breakdown

The expanded best card may explain:

> 280 m to D2  
> Bus 18 in ~10 min  
> ~17 min on the bus  
> Arrive Home stop ~22:04

If access time is only inferred from straight-line distance, prefer distance over a falsely precise walking duration.

A real external walking route may provide a better walking estimate once the passenger opens it.

### 12.10 Comparison copy

For meaningful differences, show why the recommendation wins:

- **Fastest to Home**
- **About 18 min faster**
- **Closer, but longer wait**
- **Shorter walk**
- **More frequent buses**
- **Leaves later, arrives sooner**
- **Same arrival time, less walking**

Do not expose the internal numerical score.

### 12.11 Saved primary vs backup destination

Compare absolute arrival at each approved destination stop, but do not silently treat every backup as equivalent to the primary.

If an approved backup produces a materially earlier arrival:

> **Faster Home option**  
> Arrives at your backup Home stop about 9 min earlier

If the difference is trivial, prefer the primary stop.

Because the app stores public stop identities rather than a private address, it cannot precisely calculate the walk from a backup stop to the user's door. Do not hide this limitation.

### 12.12 Frequency and missed-bus resilience

Fastest arrival is not the only signal.

Example:

- Stop A: arrival Home ~22:00 if one bus is caught; next suitable bus is 35 min later.
- Stop B: arrival Home ~22:02; suitable buses also leave in 9 and 16 min.

These are practically near-equivalent. B may rank first because it is much less fragile.

The card can show:

> **Frequent Home service**  
> More suitable buses follow

### 12.13 Live delay can change the winner

Ranking must update when trustworthy live data materially changes destination arrival.

Example:

- A was fastest by schedule.
- A becomes +12 min delayed.
- B is running normally.

B may become the new top recommendation.

Apply hysteresis: only move the recommendation when the benefit is meaningful, not for small prediction noise.

### 12.14 Destination live prediction can improve accuracy

Because there are usually only one to a few acceptable destination stops, fetching/matching destination-stop realtime may be much cheaper than multiplying live requests across every route candidate.

Where architecture permits:

- fetch the acceptable destination stop(s) once;
- match candidate trip identities there;
- use a fresh matched expected arrival as the strongest destination ETA.

This should be bounded, cached and deduplicated.

### 12.15 Dynamic search expansion

A fixed “nearest 8” or “nearest 12” cap can still miss the best option in a hub.

Example:

- twelve very close platforms do not serve Home;
- a direct Home stop is 450 m away.

Destination-aware discovery should support bounded progressive expansion:

1. evaluate the normal nearby set;
2. if no good/catchable option exists, expand radius/candidate count;
3. stop at a conservative hard limit;
4. surface the farther useful option without removing the original nearby stops.

UI example:

> **Better option a little farther away**  
> D2 · 450 m  
> Direct bus in 8 min

The pure **Nearest** view should still preserve geographical ordering.

### 12.16 Internal utility after arrival time

Among options whose destination-arrival times are meaningfully different, earlier arrival dominates.

Among options inside the near-optimal band, use secondary utility:

```text
lower access burden
+ stronger realtime confidence
+ primary destination preference
+ more backup departures
+ fewer disruptions
+ current recommendation stability
```

This preserves human-friendly choices instead of over-optimising seconds.

### 12.17 Confidence-aware destination ETA

Every destination ETA needs a source/confidence state:

- **live destination prediction**
- **live delay propagated**
- **schedule**
- **unknown**

The UI may simplify these to passenger language:

- **Live**
- **Estimated from live progress**
- **Schedule**
- **Arrival time unavailable**

Do not collapse these into a single equally confident-looking number.

---

## 13. Near-optimal band

Do not reorder options for trivial mathematical gains.

If two choices are within a small practical arrival-time band, treat them as effectively equivalent and prefer:

1. primary destination stop;
2. lower walking burden;
3. stronger live confidence;
4. more useful departures soon;
5. fewer disruptions;
6. current stable recommendation.

This prevents a 30–60 second theoretical gain from making the UI less stable or asking the passenger to walk much farther.

Exact thresholds should be field-tested, but the principle is mandatory.

---

## 14. Stable ordering / hysteresis

A live list that constantly reorders is unusable.

The current top recommendation should remain pinned unless another option becomes materially better or the current one degrades.

A recommendation may change when:

- the selected departure leaves;
- cancellation/closure appears;
- the trip becomes no longer catchable;
- a new option moves to a better semantic tier;
- total benefit exceeds a meaningful threshold;
- the current recommendation loses its direct-service validity.

Do **not** reorder for:

- small GPS jitter;
- a few metres of distance difference;
- a few seconds of ETA variation;
- repeated identical provider snapshots.

While keyboard/screen-reader focus is inside the list, avoid moving the focused card under the user.

---

## 15. Card anatomy

### 15.1 Best card — expanded

Example:

> **★ BEST FOR HOME**  
> **Kauppatori D2**  
> Stop 1234 · 160 m away
>
> **18 → Runosmäki**  
> **5 min · Live**
>
> Direct to Home · about 17 min on the bus  
> 2 more suitable departures soon
>
> **Walk there**  
> Open stop

The exact destination/headsign must come from provider/GTFS data, not invented labels.

### 15.2 Good card — medium

> **✓ GOOD FOR HOME**  
> Kauppatori A1 · 90 m
>
> **2 → Runosmäki · 10 min**
>
> Direct to Home

### 15.3 Wrong-direction card — compact

> **↔ OTHER DIRECTION**  
> Kauppatori B3 · 55 m
>
> Current departures from this stop do not continue to Home.
>
> Open stop

### 15.4 No-direct-service card

> **— NO DIRECT BUS TO HOME**  
> Kauppatori C1 · 75 m
>
> Open stop

### 15.5 Tight card

> **! TIMING MAY BE TIGHT**  
> Kauppatori D2 · 260 m
>
> 18 · 3 min

A later catchable suitable departure should be shown when known.

### 15.6 Schedule-only card

> **✓ GOES TO HOME**  
> 18 · scheduled 20:14
>
> Live tracking unavailable

### 15.7 Disruption card

> **⚠ DISRUPTED**  
> Kauppatori D2
>
> This stop is currently affected.
>
> **Use E1 instead · 170 m**

Only provide a replacement when the evidence actually supports it.

---

## 16. Status language

Use text + icon; never colour alone.

Recommended vocabulary:

- **Best for Home**
- **Good for Home**
- **Goes to Home**
- **At the right stop**
- **Timing may be tight**
- **Probably too late to catch**
- **Other direction**
- **No direct bus to Home**
- **Live**
- **Schedule only**
- **Live information delayed**
- **Disrupted**
- **Cancelled**
- **Stop closed**

Avoid:

- “wrong stop” when the passenger may intentionally inspect it;
- developer terminology such as SIRI, stop sequence, provider snapshot;
- numeric suitability scores exposed to the passenger.

---

## 17. Destination-aware departure board

Destination context must continue after a stop is opened.

If destination = Home, split or reorder the board into:

### For Home

Trips that concretely serve an acceptable Home stop downstream.

### Other departures

Everything else.

Do not hide other departures.

Example:

> **For Home**
>
> ✓ 18 → Runosmäki · 4 min  
> ✓ 7 → Runosmäki · 11 min
>
> **Other departures**
>
> 32 → Pansio · 7 min  
> 18 → Harittu · 15 min

A route number alone must never receive the “For Home” marker.

---

## 18. Selected journey state

Once the passenger chooses a concrete option, stop treating ranking as an unconstrained recommendation list.

Create a selected, session-only pre-boarding journey state.

Example:

> **Walk to Kauppatori D2**
>
> 130 m to the selected boarding stop  
> 18 → Runosmäki  
> leaves in ~6 min · Live
>
> Walking directions  
> Choose another route

The selected concrete trip remains stable. Small ranking changes never replace it automatically.

The identity of a selected journey is the concrete trip plus boarding occurrence. The trip reference is primary; planned boarding time is an additional occurrence anchor for loop routes and repeated stop visits.

The selected trip is pinned above other destination-compatible departures. A saved line filter must not hide it, but the filter still applies normally to every other departure.

If the passenger opens another stop board, do not start a second background poll. Keep the journey, mark live monitoring as paused, and offer **Return to selected stop**. If the selected stop feed fails, mark monitoring as degraded rather than implying that the countdown is current.

Only a board response received after selection may refresh the active journey. A cached pre-selection snapshot may be displayed by the normal board, but it must not overwrite selected timing or undo recovery.

Never silently switch the selected journey. If it becomes invalid, keep the destination stable and enter recovery so the passenger explicitly chooses a replacement.

---

## 19. Arrival at boarding stop

The app does **not** infer “you are at the stop” merely because the stop board is open.

In the current backendless/privacy-first implementation there is no continuous pre-boarding GPS tracking. The passenger explicitly confirms:

> **I’m at the stop**

Only then does the state move from WALKING_TO_BOARDING_STOP to WAITING_FOR_SELECTED_TRIP.

This confirmation is UI guidance, not proof of physical location. It must never be used as safety evidence for Ride Mode.

If a future version adds optional live pre-boarding location, it may prefill or suggest this transition only with fresh, high-quality evidence and must still fail closed when location is stale or uncertain.

---
## 20. Missed departure recovery

If the chosen bus departs before boarding:

> **18 has departed**
>
> **Next from this stop**  
> 7 · 6 min · Goes to Home

If a materially better nearby stop exists:

> **Another option is faster**
>
> A1 · 90 m away  
> 2 · 5 min
>
> Switch

The old departure must not remain highlighted as if catchable.

---

## 21. Cancellation / closure recovery

### Trip cancellation

> **18 cancelled**
>
> **Best alternative**  
> 7 · same stop · 8 min

### Boarding stop closure

> **D2 is temporarily closed**
>
> **Use E1 instead · 170 m**

A closed/cancelled option must immediately leave the recommendable tiers.

---

## 22. Opposite-direction scenario

This is a first-class design case.

Example:

- Stop A: 25 m, route 18 travels away from Home.
- Stop B: 45 m, route 18 serves Home downstream.

Destination-aware ranking:

1. B — **Best for Home**
2. A — **Closer, but other direction**

Never describe this purely from route number.

---

## 23. Loop-route scenario

If the route passes physically near the destination before serving it, proximity does not imply usefulness.

Use trip sequence and the first valid downstream destination occurrence.

If a trip contains the same destination stop more than once:

- identify the boarding occurrence;
- select the first valid destination occurrence after boarding;
- compute ride duration to that occurrence;
- do not match an earlier occurrence.

---

## 24. Branch / short-turn scenario

Two departures with the same line number may have different reachable stops.

Each departure is evaluated independently.

A short-turn departure that terminates before Home must appear under **Other departures** even if later departures of the same line serve Home.

---

## 25. Primary vs backup saved-place stops

Primary is preferred when options are close.

A backup can become the recommended destination when:

- primary has no valid direct service;
- primary is disrupted/closed;
- backup provides a materially faster or more reliable journey;
- the benefit is large enough to justify any extra last-mile burden.

When recommending a backup, explain it:

> **Faster Home option**
>
> This bus serves your approved backup Home stop.  
> About 9 min faster · roughly 300 m farther from Home.

Never silently substitute a backup.

---

## 26. Nearby destination itself

If the saved destination stop is already very close, the product may surface:

> **Your Home stop is about 450 m away**

Do not claim that walking is faster unless actual walking-route evidence supports it.

External Maps can offer walking directions.

---

## 27. GPS states

### Permission denied

Keep destination intent.

Show:

> Location is off. Choose the stop you’re near.

Destination-aware departure-board filtering still works once a boarding stop is chosen manually.

### Location unavailable

Same fallback as permission denied.

### Low accuracy

Show:

> **Your location is approximate**

Avoid false precision between stops whose distances are within the GPS error radius.

Ranking should weight trip suitability more heavily than tiny distance differences.

### Location jumps

Use hysteresis and do not reorder from one poor fix.

### Outside Föli area

Keep current truthful boundary warning.

Do not present a confident “best stop” outside a reliable service-area determination.

---

## 28. Realtime-data states

### Fresh live

May drive expected departure and confidence.

### Repeated identical snapshot

Receiving the same provider observation again does not make it fresh.

Age it naturally.

### Delayed live

Keep the trip topology, lower confidence, and label appropriately.

### Realtime unavailable

Use schedule where available.

### Schedule unavailable too

Keep nearby geography and destination intent, but do not infer service.

Example:

> Departure information is temporarily unavailable. Nearby stops are still shown.

---

## 29. Disruptions

Disruption relevance must be incorporated before recommendation.

Examples:

- trip cancelled → disqualify;
- boarding stop closed → disqualify;
- route detour that makes destination compatibility uncertain → downgrade or withhold claim;
- informational notice with no route-impact evidence → show notice without automatically demoting.

The system must never infer a rerouting path from free-form disruption text unless there is structured evidence.

---

## 30. Offline state

Offline cannot provide current ranking reliably.

Preserve:

- destination intent;
- saved Home/Work/School stops;
- cached nearby stop catalogue;
- last known public stop information where valid;
- recovery / driver card.

UI:

> **Live route search is unavailable offline**
>
> Your saved Home stops are still available.

Do not continue presenting stale “Best for Home” as current.

---

## 31. No direct service

When no nearby stop has a valid direct trip:

> **No direct bus to Home from the nearby stops**

Keep the whole nearby list.

Offer:

> **Find a route with transfers**

This opens the external planner.

Do not fake a transfer planner.

---

## 32. Last service / sparse service

Only claim:

> **Last direct bus tonight**

when the data horizon is demonstrably complete.

Otherwise use weaker wording:

> **No later direct departure is shown in the available timetable window.**

Sparse service increases the value of frequency/resilience in ranking.

---

## 33. Ranking stability after user interaction

Background updates must never override explicit passenger actions.

Examples:

- user changes Home → Work while GPS request is in flight;
- user starts typing a stop while ranking request is running;
- user chooses a stop while live enrichment is still loading;
- old destination request completes after a newer one.

Use a request generation / destination token so stale async results are discarded.

User intent always wins over background suggestions.

---

## 34. Loading strategy

Do not block the whole UI until every candidate is fully enriched.

Recommended sequence:

1. show nearby geography quickly;
2. show “Checking which stops go to Home…”;
3. progressively enrich cards;
4. apply stable suitability order once enough evidence exists;
5. avoid repeated full-list jumps as individual requests finish.

The first confident recommendation may appear before every low-priority card is fully evaluated, but unexplored cards must remain labelled as checking/unknown rather than assumed unsuitable.

---

## 35. Data-fetch strategy

Dense-hub UX must not trigger unbounded network work.

Engineering requirements:

- bounded nearby candidate count;
- deduplicate identical trip lookups;
- cache GTFS trip stop order;
- reuse stop-monitor responses already loaded by the board;
- abort superseded destination/location requests;
- batch or parallelise with concurrency limits;
- cache immutable/static GTFS data separately from live observations;
- freshness must be based on provider observation timestamps, not HTTP receipt time.

No candidate should become “Best” until the data needed for that claim has resolved.

---

## 36. Proposed derived model

Illustrative, not binding TypeScript:

```ts
type DestinationIntent = {
  id: string;
  kind: "saved-place" | "public-stop";
  label: string;
  primaryStopId: string;
  acceptableStopIds: string[];
};

type Catchability =
  | "at-stop"
  | "comfortable"
  | "likely"
  | "tight"
  | "too-late"
  | "unknown";

type SuitabilityTier =
  | "best-capable"
  | "direct-lower-confidence"
  | "direct-later-trip"
  | "direct-inferior"
  | "no-direct"
  | "other-direction"
  | "disqualified";

type DepartureFit = {
  tripRef: string;
  lineRef: string;
  boardingStopId: string;
  destinationStopId: string | null;
  boardingSequence: number | null;
  destinationSequence: number | null;
  direct: boolean;
  catchability: Catchability;
  liveState: "fresh" | "delayed" | "schedule" | "unknown";
  expectedDepartureSec: number | null;
  rideDurationSec: number | null;
  disruptionState: "clear" | "warning" | "cancelled" | "unknown";
};

type NearbyStopFit = {
  stopId: string;
  distanceM: number | null;
  tier: SuitabilityTier;
  bestDeparture: DepartureFit | null;
  suitableDepartures: DepartureFit[];
  explanation: string;
};
```

The UI should consume derived semantic state, not re-implement ranking rules inside components.

---

## 37. Recommended architecture

Separate concerns:

### Discovery

`useNearbyStops`

- current position;
- candidate stops;
- geographic distances.

### Destination intent

`useDestinationIntent`

- Home/Work/School/public stop;
- persistence policy;
- clear/change.

### Trip fit

`destinationTripFit.js`

- boarding occurrence;
- downstream destination matching;
- loop/branch/short-turn logic;
- drop-off restrictions.

### Catchability

`catchability.js`

- conservative access estimate;
- GPS uncertainty;
- departure margin.

### Ranking

`nearbySuitability.js`

- semantic tier;
- total utility;
- near-optimal tie-breaks;
- stability/hysteresis.

### Enrichment hook

`useDestinationAwareNearby`

- fetch orchestration;
- caching;
- cancellation;
- progressive state.

### UI

- `DestinationSelector`
- `DestinationContextBar`
- `NearbyStops` enhanced rather than replaced
- `NearbyStopFitCard`
- destination-aware `BusStopDisplay`
- `PreBoardingJourney`

This keeps ranking testable outside React.

---

## 38. Visual hierarchy

On a phone:

1. destination context;
2. best recommendation;
3. next good alternatives;
4. remaining nearby stops;
5. details/explanations.

Only the best card should initially carry the full information density.

Lower-priority cards should stay compact.

Do not turn every stop into a large card with multiple buttons.

---

## 39. Actions per card

Primary recommended card:

- **Walk there** when online and not already at stop;
- **Choose this stop** when walking directions are unavailable;
- **Open stop** as secondary.

Non-recommended cards:

- entire card opens details;
- avoid duplicating several CTA buttons.

Wrong-direction / no-direct cards must remain openable.

---

## 40. “Why this stop?”

Provide optional explanation for the top recommendation:

> **Why this stop?**
>
> Direct to Home  
> Nearby  
> Live bus expected soon  
> More suitable buses follow  
> No known disruption

Only include claims backed by current evidence.

This is a trust feature, not an engineering-debug panel.

---

## 41. Accessibility

Requirements:

- status must be communicated with text, not colour alone;
- each card has one coherent accessible name;
- screen readers hear destination context;
- recommendation changes are announced only when materially useful;
- do not continuously announce ETA updates;
- no focus loss when async enrichment reorders cards;
- preserve 44 px touch targets;
- support 200% text scaling;
- status icons are decorative when text repeats their meaning;
- segmented sort control is keyboard-operable;
- “Best for Home” must not be conveyed solely by DOM position.

Example accessible summary:

> “Kauppatori D2, stop 1234, 160 metres away. Best for Home. Bus 18 expected in approximately five minutes. Direct to Home.”

---

## 42. Localisation

All visible copy must support Finnish and English from first implementation.

Avoid translating internal technical concepts literally.

Passenger-facing language should describe action and confidence.

A native Finnish review is required before treating the flow as polished for public promotion.

Destination names saved by the user are labels, not translated content.

---

## 43. Privacy

Preserve the current privacy model.

- current location used only when requested;
- ranking can be computed client-side;
- Home/Work/School remain represented by public stop identities, not addresses;
- no location history;
- no analytics requirement;
- external Maps receives destination/stop only when the passenger taps a route link.

The privacy copy should be updated only if implementation introduces new network requests that materially change what data.foli.fi receives.

---

## 44. Integration with Ride Mode

This feature should reduce setup friction for the get-off alert.

When the passenger chooses a concrete departure that already has:

- trip identity;
- boarding stop;
- destination stop;
- route/shape metadata;

Ride Mode setup should prefill those values.

Ideal flow:

```text
Choose Home
→ Best nearby stop
→ Choose departure
→ Walk to stop
→ You’re at the right stop
→ Bus arrives
→ Start get-off alert
→ Ride Mode already knows Home destination
```

Do not force the passenger to choose the same exit stop again.

---

## 45. Recovery after boarding uncertainty

If the system cannot prove the passenger boarded the selected vehicle, it must not silently assume so.

The selected departure can offer:

> **Start get-off alert**

The current Ride Mode safety rules remain authoritative.

Pre-boarding recommendation logic must never weaken the conservative get-off state machine.

---

## 46. State model

High-level UI states:

```text
NO_DESTINATION
  ↓ choose destination
DESTINATION_SELECTED
  ↓ location available
CHECKING_NEARBY
  ↓ enough evidence
RANKED_NEARBY
  ↓ choose option
OPTION_SELECTED
  ↓ location says at stop
AT_BOARDING_STOP
  ↓ selected departure unavailable
RECOVERY
  ↓ choose replacement
OPTION_SELECTED
  ↓ board/start alert
RIDE_MODE
```

Independent degraded substates:

- GPS unavailable
- GPS approximate
- offline
- realtime unavailable
- timetable unavailable
- disruption
- no direct service

The system should degrade capability, not collapse the whole flow.

---

## 47. Acceptance criteria — core UX

The implementation is not complete until all are true:

1. With no destination, nearby stops can still be sorted by nearest exactly as a pure proximity feature.
2. With destination selected, all nearby candidates remain visible.
3. A farther stop with a valid direct, catchable trip can rank above a nearer wrong-direction stop.
4. Wrong-direction status is based on concrete trip order, not route number.
5. A same-number opposite-direction trip is never marked as serving the destination.
6. Loop routes use downstream sequence correctly.
7. Short-turn trips do not claim destinations beyond their endpoint.
8. The first uncatchable trip does not make an otherwise useful stop unusable if a later catchable trip exists.
9. Cancellation immediately removes a trip from recommendable options.
10. Stop closure immediately removes a stop from recommendable options.
11. Fresh live data outranks equivalent schedule-only confidence.
12. Repeated stale provider snapshots do not stay “fresh”.
13. Minor GPS jitter does not repeatedly reorder the top recommendation.
14. Explicit user selection is never automatically replaced by a small ranking improvement.
15. Destination context persists into the departure board.
16. Other departures remain visible.
17. Choosing a trip can prefill Ride Mode destination/setup.
18. GPS denial leaves a manual path.
19. Offline mode does not present stale “Best” claims as current.
20. Screen-reader and keyboard interaction survive async enrichment and reorder.
21. Ranking compares realistic destination-arrival time, not merely stop distance or departure countdown.
22. A farther catchable stop can outrank a nearer stop when it gets the passenger to the destination materially earlier.
23. A farther stop does not outrank a nearer one for a trivial arrival-time gain inside the near-optimal band.
24. An uncatchable departure cannot win the fastest-arrival ranking.
25. Destination ETA exposes whether it comes from fresh live destination data, propagated live delay or schedule.
26. Saved-place UI says “Home stop” / equivalent when the app cannot know the private final walk to the door.
27. If the initial nearby candidate set has no useful option, bounded search expansion can surface a slightly farther useful stop without hiding the original nearby list.

---

## 48. Regression test matrix

### Unit tests

Trip fit:

- direct normal route;
- opposite direction;
- same line, different trip;
- loop;
- repeated stop ID;
- branch;
- short-turn;
- destination already passed;
- restrictive drop-off;
- missing sequence;
- corrupt stop order.

Catchability:

- at stop;
- comfortable;
- tight;
- too late;
- bad GPS;
- no GPS;
- live expected time;
- schedule fallback.

Ranking:

- nearest is wrong direction;
- farther direct wins;
- tiny ETA difference prefers lower burden;
- frequency breaks near-tie;
- primary beats backup in near-tie;
- materially faster backup wins with explanation;
- stale live loses confidence;
- cancellation disqualifies;
- disruption penalty;
- stable recommendation under small jitter.

### Component tests

- sort toggle;
- destination chip;
- grouped hub;
- all stops retained;
- card status copy;
- progressive loading;
- selected option pinned;
- recovery card;
- board “For Home / Other departures”.

### E2E

At minimum:

1. city-centre hub with opposite-direction platforms;
2. saved Home with primary + backup;
3. first bus too soon, next bus catchable;
4. live data disappears;
5. cancellation after option selected;
6. GPS permission denied;
7. approximate GPS;
8. offline reopen;
9. mobile WebKit;
10. keyboard and screen reader semantics;
11. Finnish mobile layout;
12. 200% text scaling.

---

## 49. Field-test scenarios

Automated tests are insufficient for this feature.

Run real rides covering:

- Kauppatori / dense city-centre hub;
- opposite sides of one road;
- same route number in two directions;
- delayed bus;
- schedule-only period;
- evening sparse service;
- primary vs backup Home stop;
- poor GPS among buildings;
- passenger already standing at correct stop;
- bus departs while walking toward stop;
- route with loop/branch if available.

For each test record:

- what the app recommended;
- what the passenger chose;
- whether the claimed direction was correct;
- whether catchability felt realistic;
- whether ranking remained stable;
- whether another option would clearly have been better;
- whether handoff into Ride Mode was frictionless.

---

## 50. Phased delivery

### Phase 1 — destination-aware truth

Implement first:

- destination intent;
- Home/Work/School/public-stop selection;
- trip downstream compatibility;
- semantic stop statuses;
- Best/Nearest sorting;
- keep all nearby stops;
- destination-aware board;
- schedule/live confidence;
- unit regression coverage.

This already solves the core city-centre problem.

### Phase 2 — practical ranking

Add:

- conservative catchability;
- total journey utility;
- primary vs backup preference;
- frequency/resilience;
- near-optimal band;
- hysteresis;
- disruption-aware ranking.

### Phase 3 — guided pre-boarding

Add:

- selected journey state;
- Walk there;
- At the right stop;
- missed-departure recovery;
- better-option suggestion;
- seamless Ride Mode prefill.

### Phase 4 — validation and polish

- real city-centre rides;
- Finnish native review;
- accessibility re-audit;
- performance profiling on low-end Android;
- tune thresholds from field evidence;
- re-score product audit.

---

## 51. Product-success criteria

The feature succeeds when a passenger in a dense unfamiliar hub can answer, without understanding stop IDs or route topology:

1. **Where should I go?**
2. **Which bus from there actually goes where I want?**
3. **Can I realistically catch it?**
4. **Why is this option recommended?**
5. **What should I do if it leaves or changes?**
6. **How do I continue into the get-off alert?**

The user should not have to mentally combine a location list, route number, timetable and map to answer those questions.

---

## 52. Final design principle

**Nearby must remain a complete proximity tool, but destination context changes it from a list into a decision aid.**

Do not hide options.  
Do not equate route number with direction.  
Do not call stale data live.  
Do not optimise tiny theoretical gains at the cost of stability.  
Do not replace an explicit passenger choice in the background.  
Do not claim walking certainty the app does not have.  
Do explain why a recommendation fits.

The intended passenger experience is:

> **I tell the app where I want to go. It shows every nearby stop, makes the useful ones obvious, ranks the realistic choices, explains the best one, helps me reach it, and then carries the same destination into the ride.**


---

# Part II — arbitrary destinations and multi-option journey guidance

## 53. New product goal

The passenger should be able to start with only a destination concept:

- a saved place such as Home, Work or School;
- a public transport stop name or number;
- a street address;
- a shop, restaurant, clinic, office, school, venue or other place name;
- a previously used destination;
- a shared destination point.

The product should translate that intent into the same internal question:

> **From where I am now, which realistic route gets me to this destination best?**

The passenger should not need to know:

- which boarding stop to use;
- which side of the road is correct;
- which platform of a hub is relevant;
- whether a farther stop produces an earlier arrival;
- which destination-side stop is closest to the final point;
- which route number is travelling in the correct direction;
- whether a transfer is worthwhile.

The interface must keep this intelligence behind a simple destination-first flow.

---

## 54. One destination field

The primary pre-trip control should be a single field:

> **Where do you want to go?**

Quick actions can sit above or below it:

- Home
- Work
- School
- Recent destinations

The search field accepts all supported destination types without asking the passenger to choose a mode first.

Examples:

- `Yliopistonkatu 20`
- `Prisma`
- `Turun linna`
- `Kauppatori`
- `164`

Avoid a first step such as:

> Address / Shop / Stop — choose one

The system should infer and disambiguate instead.

---

## 55. Destination search results

Search results should be grouped semantically when useful:

### Saved places

> Home  
> Work

### Places

> Prisma — Itäharju  
> Hypermarket · Kalevantie …

### Addresses

> Yliopistonkatu 20, Turku

### Stops

> Kauppatori D2 · Stop 1234  
> Kauppatori A1 · Stop 1235

The user sees human-recognisable context, not provider IDs.

A stop result remains a concrete transit stop. A place/address result becomes a geographic destination point and may map to several viable alighting stops.

---

## 56. Ambiguous place names

A POI name such as “Prisma”, “Lidl”, “K-Citymarket” or “McDonald's” may match several branches.

Never silently select a branch solely because it is geographically nearest.

Show enough context to distinguish results:

- branch/neighbourhood;
- street address;
- municipality when necessary;
- approximate distance from current location when location is available.

Example:

> **Prisma Itäharju**  
> Kalevantie … · ~3.2 km
>
> **Prisma Länsikeskus**  
> Viilarinkatu … · ~5.1 km

If one result is overwhelmingly likely from an exact address/name match, it may be placed first but still remains a user selection.

---

## 57. Search tolerance

Destination search should tolerate normal passenger input:

- missing accents;
- case differences;
- partial names;
- minor typos;
- Finnish/Swedish/English naming variants where provider data supports them;
- stop number input;
- copied addresses.

Do not aggressively autocorrect to a different place without confirmation.

---

## 58. Destination provider boundary

Föli's currently documented API gives transit stops, trips, stop times, routes, shapes, realtime and alerts; it is not the product's general-purpose address/POI geocoder.

Arbitrary destination support therefore needs a **geocoding / place-search adapter** behind a product-owned interface.

Conceptually:

```ts
type DestinationSearchProvider = {
  search(query, context, signal): Promise<DestinationCandidate[]>;
  resolve(candidate, signal): Promise<ResolvedDestination>;
};
```

The UI must not depend directly on one external provider's schema.

Provider choice is an implementation decision and should be evaluated separately for:

- Finland/Turku coverage;
- POI quality;
- address quality;
- language support;
- privacy;
- licensing/attribution;
- quotas/cost;
- browser/CORS constraints;
- result freshness.

---

## 59. Privacy for address and POI search

Arbitrary place search changes the privacy model because the query may be sent to a third-party search provider.

Requirements:

- send only what is needed for the search;
- do not silently persist private addresses unless the passenger explicitly saves one;
- do not add destination-history analytics;
- clearly document which external service receives place/address searches;
- keep current GPS local where possible;
- if GPS context must be sent to improve search results, disclose that clearly before release;
- saved Home/Work may continue to use public stop identities if the user prefers the existing privacy-first model.

A privacy-preserving saved-place mode should remain possible even after arbitrary address search is added.

---

## 60. Resolved destination model

All search result types should resolve into one internal structure.

Illustrative model:

```ts
type ResolvedDestination = {
  id: string;
  kind: "saved-place" | "stop" | "address" | "poi" | "coordinate";
  label: string;
  subtitle?: string;
  lat: number | null;
  lon: number | null;
  exactStopId?: string;
  acceptableStopIds?: string[];
  source: string;
};
```

A stop destination may already have a stop ID.

An address/POI destination primarily has coordinates and requires destination-side stop discovery.

---

## 61. Two-sided stop discovery

For arbitrary destinations, routing must search **both ends** of the journey.

### Origin side

Find plausible boarding stops around the passenger's current location.

### Destination side

Find plausible alighting stops around the destination point.

This is essential.

The physically closest destination stop is not automatically the best destination stop, just as the physically closest boarding stop is not automatically the best origin stop.

Example:

- Destination stop X: 80 m from the shop, but only slow service reaches it.
- Destination stop Y: 230 m from the shop, but a direct frequent bus reaches it much earlier.

Y may produce the earliest real arrival to the shop.

---

## 62. Final-walk / egress cost

For an address or POI, arrival at a transit stop is not the final destination.

The route model becomes:

```text
current location
→ access to boarding stop
→ transit leg(s)
→ alighting stop
→ final walk to destination point
```

The final walk must influence route ranking.

A bus that reaches a stop 10 minutes earlier but leaves a 1.5 km final walk may be worse than a slightly later bus that stops beside the destination.

If only straight-line distance is known, label it truthfully and apply conservative uncertainty.

Do not claim exact door-to-door arrival without a credible pedestrian-route estimate.

---

## 63. True destination ETA

For an address/POI, the ideal metric is:

> **Estimated arrival at the destination point**

Conceptually:

```text
routeArrival =
  selected transit arrival
  + final access/egress time
```

For a stop destination, final-walk time is zero.

For a saved privacy-first Home represented only by stops, use the truthful wording already defined:

> **Home stop in ~27 min**

For an exact address/POI with reliable walking data:

> **Arrive at Prisma about 22:08**

---

## 64. Full route candidates

A candidate journey should be a sequence of legs.

```ts
type JourneyLeg =
  | { type: "walk"; from; to; durationSec; distanceM; confidence }
  | { type: "transit"; tripRef; lineRef; boardStop; exitStop; depart; arrive; confidence };

type JourneyOption = {
  legs: JourneyLeg[];
  arrivalAtDestination: number | null;
  totalDurationSec: number | null;
  walkingDistanceM: number | null;
  transfers: number;
  reliability: "high" | "medium" | "low";
  risks: JourneyRisk[];
};
```

This model allows direct trips now and transfers later without changing the UI contract.

---

## 65. Direct routes and transfers

### Direct route

Preferred when it is near-optimal because it is simpler and less failure-prone.

### One or more transfers

May win when it materially improves arrival time or is the only viable option.

Transfers introduce additional requirements:

- transfer-stop occurrence resolution;
- platform-to-platform access time;
- minimum safe transfer buffer;
- realtime delay propagation from the incoming leg;
- risk that an incoming delay causes a missed connection;
- recovery if connection is missed.

A journey planner that cannot model transfer feasibility should not present a tight connection as confidently valid.

---

## 66. Routing provider strategy

There are two viable architectural paths.

### A. Product-owned GTFS routing

Pros:

- complete control over ranking semantics;
- strong integration with existing GTFS / Ride Mode logic;
- privacy can remain local/client-heavy.

Costs:

- transfer routing is substantially more complex;
- service calendars, footpaths, transfer buffers and realtime propagation must all be correct;
- browser performance and dataset size become important.

### B. External journey-planning engine + product ranking layer

The external engine supplies valid journey candidates; Turku Departures then:

- validates/reconciles them with its live semantics;
- explains alternatives;
- chooses passenger-friendly options;
- hands transit legs into Ride Mode.

This may be the safer way to obtain full transfer journeys while keeping the product's differentiated decision/reassurance layer.

The UI specification should support either architecture.

---

## 67. Multiple route options — do not show duplicates

The passenger asked for several optimal alternatives, not a dump of every timetable combination.

Return a small set of **meaningfully different Pareto-optimal options**.

Default target: 3 options, occasionally 4 when there is genuine value.

Examples:

1. **Fastest**
2. **Less walking**
3. **Simplest / no transfer**
4. **More time to catch / more reliable**

Do not show three options that are effectively the same route with buses two minutes apart unless frequency itself is the useful distinction.

In the current implementation, direct options fill up to three with a backup whenever one exists:

- **Next bus**: the bus after the fastest, at least two minutes later, with its cost, e.g. "If you miss the first one · about 7 min later".
- **Earlier bus**: when arriving by a time, the bus before the latest departure, for margin.

The same bus boarded at another stop never counts as a second choice. Here frequency is the useful distinction, and one backup is the limit.

A label and a count appear only when there is something to compare. A lone option says instead that it is the only bus found.

Each card shows the bus's sign, where to get off and about how long on the bus, and when it leaves ("Leaves in 5 min").

With a single direct bus, options with a change of bus are searched too. They are shown only when they arrive sooner or leave later than the direct bus.

---

## 68. Dominance pruning

A route should normally be hidden from the primary alternatives if another option is:

- no slower;
- no more walking;
- no more transfers;
- equally or more reliable;

and is strictly better in at least one dimension.

This removes noise before any subjective ranking.

The passenger can still access **More options** if needed.

---

## 69. Suggested route cards

### Fastest

> **★ FASTEST**  
> Arrive **22:08 · ~31 min**  
> Walk 280 m → D2  
> **18** → destination stop  
> Walk 120 m
>
> Live · no transfer

### Less walking

> **LESS WALKING**  
> Arrive **22:13 · ~36 min**  
> Walk 70 m  
> **2** → destination stop  
> Walk 60 m
>
> ~5 min slower · 270 m less walking

### Simpler

> **NO TRANSFER**  
> Arrive **22:16 · ~39 min**  
> One bus · easier journey

### More time to catch

> **EASIER TO CATCH**  
> Arrive **22:12**  
> Bus leaves in 12 min  
> ~4 min slower than fastest

The labels explain the trade-off without exposing an internal score.

---

## 70. Route-card information hierarchy

The passenger should be able to compare routes in 2–3 seconds.

Primary row:

- arrival clock time;
- total duration;
- line(s);
- transfer count.

Secondary row:

- walk distance;
- time until boarding;
- reliability/live status.

Expanded details:

- exact boarding stop/platform;
- intermediate transfer stop;
- destination-side stop;
- final walk;
- why this option was recommended;
- disruptions.

Do not show every stop of the journey by default.

---

## 71. Simple home screen

Despite the richer engine, the default interface can become simpler:

```text
Where do you want to go?
[ Search address, place or stop ]

[ Home ] [ Work ] [ School ]

Recent
Prisma Itäharju
Turun linna
...
```

After destination selection:

```text
To: Prisma Itäharju   ×
From: My location

Best routes
★ Fastest       Arrive 22:08
  18 · no transfer · 420 m walking

  Less walking  Arrive 22:13
  2 · no transfer · 130 m walking

  Simpler       Arrive 22:16
  1 transfer? [only if simpler meaningfully applies]

Nearby boarding stops
[ Best for this trip | Nearest ]
...
```

The advanced intelligence stays behind clear outcomes.

---

## 72. “Nearby stops” remains a first-class surface

Journey options do not replace Nearby.

Below route options, or behind a nearby-stops section, keep the existing full list with destination-aware ranking.

This serves passengers who:

- know the local network;
- want to inspect another stop;
- changed their mind;
- are meeting someone;
- prefer manual control.

The route planner and nearby-stop explorer must share the same destination intent.

---

## 73. Board view after route selection

When a journey option is selected and its boarding stop opened:

- selected departure is pinned/highlighted;
- other departures to the same destination remain visible;
- unrelated departures remain available below;
- the destination context remains visible;
- walking-to-stop / at-stop status remains visible when location is enabled.

Do not make the passenger re-identify the selected bus from a generic board.

---

## 74. Journey Mode wraps Ride Mode; it does not replace it

The existing Ride Mode's core safety logic remains authoritative for each bus leg.

For a direct journey:

```text
Pre-boarding
→ selected concrete trip
→ Start get-off alert
→ existing Ride Mode
→ exit at destination stop
```

The existing functionality must continue to provide:

- reliable remaining-stop count;
- ETA source/fallback semantics;
- Get Ready;
- Press STOP;
- Get Off Now;
- stale-live protection;
- GPS route matching;
- offline/degraded fallbacks already supported.

Do not reimplement these inside the journey planner.

---

## 75. Multi-leg Journey Mode

For a transfer journey, orchestrate several existing-style leg states.

Example:

```text
Walk to A
→ Board bus 18
→ Ride Mode targets transfer stop X
→ GET OFF / transfer
→ Walk to platform B if needed
→ wait for bus 7
→ Ride Mode targets destination stop Y
→ GET OFF
→ final walk to POI
```

Each transit leg has its own:

- trip identity;
- boarding stop;
- exit stop;
- remaining stops;
- ETA;
- get-off alert state.

The journey wrapper tracks which leg is active.

---

## 76. Transfer UX

The passenger should not need to understand the entire journey while riding the first leg.

During leg 1, show only the next critical action:

> **Get off at Kauppatori**  
> Then walk to D2 for bus 7

After exiting:

> **Next: bus 7**  
> D2 · 120 m  
> Leaves in ~8 min

This follows the product principle of reducing interpretation under stress.

---

## 77. Missed transfer prevention

A transfer becomes unsafe when incoming realtime delay consumes the transfer buffer.

The system should continuously reassess:

```text
predicted arrival of incoming leg
+ platform-change / walking allowance
+ safety buffer
<= predicted departure of outgoing leg
```

If the connection becomes risky:

> **Your connection is becoming tight**

If it is no longer credible:

> **This connection is unlikely now**  
> Finding the best alternative…

Do not wait until the passenger reaches the transfer stop to reveal a known missed connection.

---

## 78. Recovery after a missed connection

After a missed or cancelled connection:

- keep the passenger's final destination unchanged;
- recompute from current/transfer location;
- offer the best new alternatives;
- do not restart the whole search experience.

Example:

> **Bus 7 has departed**  
> Next fastest option: 32 in ~6 min  
> Arrive Prisma ~22:24

This is a core Journey Mode recovery path.

---

## 79. Destination-side multiple stops

For a POI/address, several alighting stops may be plausible.

Evaluate:

- transit arrival time;
- final walking burden;
- stop accessibility/closure;
- route reliability;
- whether a slightly farther stop produces a much earlier arrival.

Do not automatically choose the physically closest destination-side stop.

This mirrors origin-side ranking.

---

## 80. Large POIs and ambiguous entrances

Shopping centres, campuses, hospitals, arenas and large stores can have multiple entrances.

A geocoder point may represent the centre of the building, not the useful entrance.

When the final walking difference could be material:

- keep the claim approximate;
- allow **Open final walk in Maps**;
- do not invent an entrance;
- consider entrance-aware provider data later if available.

---

## 81. Destination already nearby

If the passenger is already close to the destination point, transit may be unnecessary.

Show:

> **You’re already near Prisma**  
> About 350 m away

Offer walking directions.

Do not recommend a bus that adds waiting and riding unless it is materially useful and pedestrian routing supports the comparison.

---

## 82. Destination outside service area

If the destination is outside Föli coverage:

> **This destination appears outside the Föli area**

Preserve the destination and offer an external full-route planner.

Do not fabricate partial transit guidance as a complete journey.

If a partial Föli leg is useful, show it only when the routing engine can truthfully model the remaining journey.

---

## 83. No GPS / manual origin

The destination-first model must still work without location permission.

Fallback:

> **From where?**

Allow:

- current stop search;
- address/place origin search if geocoding supports it;
- saved place origin.

Once origin is resolved, the same routing engine runs.

In the current implementation the origin without location is a stop chosen by name. With a destination set and no stop open, Nearby offers **Choose a stop by name** beside **Find nearest stop**, and it stays there after location is refused. The chosen stop's board then answers for the destination: of the listed buses checked to go there, the one that reaches it first (its departure at this stop plus the timetable's ride), where to get off and about when. Otherwise it says that none of the listed buses goes there, or that some could not be checked. The answer says nothing about catching the bus, because without location that is not known. A saved place is an origin through its stop's board. Address/place origins and transfer options from a chosen stop remain open.

---

## 84. Reverse trip

Saved places should naturally support reverse use:

- From Home to Work
- From Work to Home

If the passenger is not currently at either, current location remains the default origin.

Avoid hard-wiring Home only as a destination.

---

## 85. Time preferences — advanced, not default clutter

The default is:

> **Leave now**

Optional advanced controls may later support:

- Leave at…
- Arrive by…

These should not clutter the main screen.

They are useful for planned journeys but unnecessary for the core “I am here now” scenario.

---

## 86. Preferences — gradual expansion

Do not put a large preference form in front of every search.

Potential optional preferences:

- fewer transfers;
- less walking;
- wheelchair/stroller needs when trustworthy data supports it;
- avoid a specific mode;
- maximum walking distance.

The default ranking should already produce sensible choices without configuration.

---

## 87. Route diversity algorithm

After generating valid journey candidates:

1. remove invalid / uncatchable candidates;
2. remove dominated candidates;
3. cluster near-duplicate journeys;
4. choose the fastest robust candidate;
5. choose at most one meaningfully less-walking candidate;
6. choose at most one meaningfully simpler / more reliable candidate;
7. optionally add one leave-later/easier-to-catch candidate when useful.

This produces a compact set of alternatives instead of timetable noise.

---

## 88. Reliability-aware route comparison

A route arriving two minutes earlier is not automatically better if it contains:

- a 90-second transfer;
- stale realtime;
- a long platform change;
- the last bus of a low-frequency connection.

Each route needs a reliability assessment informed by:

- live freshness per leg;
- transfer margin;
- cancellation/disruption state;
- service frequency after each fragile connection;
- GPS/access uncertainty;
- whether a backup journey exists.

Passenger language can remain simple:

- **Reliable option**
- **Tight transfer**
- **Schedule only**
- **More backup buses**

---

## 89. Route updates without UI chaos

Before the passenger selects a route, alternatives may reorder when arrival differences become meaningful.

After selection:

- pin the selected journey;
- show material changes inside it;
- offer a switch only when a materially better/recovery route emerges;
- never silently replace the trip the passenger is walking toward or riding.

The same hysteresis principles as Nearby apply to full journeys.

---

## 90. Search-to-ride state model

```text
NO_DESTINATION
→ SEARCHING_DESTINATION
→ DESTINATION_RESOLVED
→ ROUTES_LOADING
→ ROUTES_READY
→ JOURNEY_SELECTED
→ WALKING_TO_BOARDING_STOP
→ AT_BOARDING_STOP
→ TRANSIT_LEG_ACTIVE
→ TRANSFER
→ TRANSIT_LEG_ACTIVE
→ FINAL_WALK
→ ARRIVED
```

Recovery states can interrupt any stage:

- location unavailable;
- trip departed;
- trip cancelled;
- stop closed;
- transfer missed;
- provider stale;
- offline;
- route no longer viable.

The final destination remains stable through recovery.

---

## 91. Minimal screen count

Do not create a wizard with many pages.

A simple architecture can use three primary surfaces:

### Search / home

> Where do you want to go?

### Results

> Best routes + nearby stops

### Active journey

> Only the next action and current leg

Ride Mode lives inside Active journey rather than becoming a disconnected product flow.

---

## 92. Active journey UI principle

At every moment, one question dominates:

> **What should I do next?**

Examples:

- Walk to D2
- Wait for bus 18
- Board 18 toward Runosmäki
- Get ready to exit
- Press STOP
- Get off now
- Walk 120 m to D4
- Board 7
- Get off at destination
- Walk to Prisma

Secondary information remains available but does not compete with the next action.

---

## 93. Route overview without overload

An active route can expose a collapsed overview:

> Walk → **18** → Walk

or:

> Walk → **18** → **7** → Walk

Tapping expands the details.

The user should not need a dense timeline visible at all times.

---

## 94. Existing stop-count and alert correctness are release gates

Adding route planning must not regress the recently hardened Ride Mode.

For every selected transit leg:

- remaining stops must track actual route progress when reliable GPS/shape evidence exists;
- ETA must not freeze on repeated stale provider snapshots;
- live estimates must age correctly;
- route-progress fallbacks must remain conservative;
- Get Ready / Press STOP / Get Off Now thresholds remain governed by the existing Ride Mode evidence model;
- loop/repeated-stop correctness remains sequence-based;
- background/browser limitations remain disclosed.

A new journey-planning feature is not releasable if it weakens these behaviours.

---

## 95. Journey-level test matrix

### Destination search

- exact address;
- partial address;
- typo;
- POI exact match;
- multiple POI branches;
- duplicate stop names;
- stop number;
- no results;
- result outside service area;
- language variants.

### Origin/destination stop discovery

- nearest origin stop is wrong direction;
- farther origin stop wins on arrival time;
- nearest destination stop is slower overall;
- farther destination stop wins after final-walk trade-off;
- low GPS accuracy;
- no GPS;
- dense hub progressive expansion.

### Route alternatives

- fastest direct;
- slower but less walking;
- direct vs faster one-transfer;
- tight transfer rejected/downgraded;
- near-duplicate routes collapsed;
- dominated route hidden;
- sparse service / last-available trip;
- schedule-only route;
- stale live route;
- cancellation;
- closure;
- disruption.

### Active journey

- walk to boarding stop;
- selected bus departs early;
- selected bus delayed;
- selected trip cancelled;
- Ride Mode direct journey;
- remaining stops update;
- ETA updates;
- correct get-off alert;
- transfer-stop get-off alert;
- missed transfer recovery;
- second-leg Ride Mode;
- final walk;
- destination reached.

---

## 96. Phased delivery for the broader Journey Assistant

### Phase A — destination search foundation

- one search field;
- stop/saved-place/address/POI result model;
- geocoder adapter;
- destination disambiguation;
- privacy copy.

### Phase B — arbitrary-point direct journeys

- destination-side candidate stops;
- origin-side candidate stops;
- direct-trip routing between candidate stop sets;
- earliest destination arrival;
- final-walk penalty;
- 2–3 diverse route alternatives.

### Phase C — full transfer routing

Either:

- integrate a robust journey-planning backend/provider;
- or implement/test a product-owned routing engine.

Do not ship partial transfer logic that is less trustworthy than external planners.

### Phase D — Journey Mode orchestration

- selected journey;
- walking-to-stop state;
- Ride Mode leg integration;
- transfer transitions;
- missed-connection recovery;
- final-walk state.

### Phase E — field validation

- city centre;
- shopping centres;
- duplicate store branches;
- direct vs transfer journeys;
- night/sparse service;
- poor GPS;
- delays/cancellations;
- Android and iPhone browser behaviour;
- Finnish language review;
- accessibility review.

---

## 97. Final UX contract

The passenger should be able to type only:

> **Prisma**

or:

> **Yliopistonkatu 20**

or:

> **Kauppatori**

and receive a small, understandable set of answers such as:

> **Fastest — arrive 22:08**  
> Walk 280 m → D2 · 18 · final walk 120 m
>
> **Less walking — arrive 22:13**  
> Walk 70 m → A1 · 2 · final walk 60 m
>
> **Easier to catch — arrive 22:12**  
> Bus leaves later, with more time to reach the stop

Then, after choosing one, the interface should guide only the next action and reuse the existing hardened Ride Mode for every bus leg.

The ideal experience is:

> **I tell the app where I want to go. It figures out which stop, which direction, which bus, which destination-side stop and which route make the most sense; gives me a few meaningful alternatives; guides me through the chosen one; and reliably tells me when to get off.**
