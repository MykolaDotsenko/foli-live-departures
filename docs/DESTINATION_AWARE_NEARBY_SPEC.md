# Destination-aware Nearby — product and implementation specification

**Status:** proposed implementation specification  
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

## 12. Total journey utility

Among valid, catchable direct options, optimise the practical journey, not merely the next departure countdown.

A useful internal cost model considers:

```text
access burden
+ expected wait
+ ride duration
+ destination-stop penalty
+ uncertainty penalty
+ disruption penalty
+ fragility penalty
```

### Access burden

Prefer less walking when travel times are otherwise close.

### Wait

Use fresh live expected time when genuinely fresh. Otherwise use schedule with lower confidence.

### Ride duration

Use trip stop times / offsets for the selected downstream destination occurrence.

### Destination penalty

Primary saved-place stop receives preference.

Approved backup stops are allowed, but a backup should not replace primary for negligible gains.

### Reliability penalty

Examples:

- fresh live: lowest penalty;
- schedule only: modest penalty;
- delayed live: greater uncertainty;
- poor GPS: access/catchability uncertainty;
- disruption: substantial penalty;
- cancellation: disqualify.

### Fragility / frequency

A stop with several useful departures soon is more resilient than one with a single narrow opportunity.

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

Once the passenger taps **Walk there** / chooses an option, stop treating ranking as an unconstrained recommendation list.

Create a selected pre-boarding journey state.

Example:

> **Going to Kauppatori D2**
>
> 130 m away  
> 18 → Runosmäki  
> ~6 min · Live
>
> ✓ Direct to Home
>
> Walking directions  
> Change option

The selected option remains stable.

A better alternative may be surfaced non-disruptively:

> **Faster option available**
>
> A1 · saves about 7 min
>
> Switch

Never switch automatically after commitment unless the selected option becomes invalid and the UI clearly asks the passenger to choose a recovery option.

---

## 19. Arrival at boarding stop

When location evidence is strong enough:

> **✓ You’re at the right stop**
>
> 18 → Runosmäki  
> ~3 min · Live
>
> Goes to Home

Do not show “Walk there” once effectively at the stop.

If location is uncertain, use:

> **You appear to be near the stop**

rather than false certainty.

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
