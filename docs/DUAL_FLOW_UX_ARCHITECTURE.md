# Dual-flow UX architecture — destination-first + stop-first

**Status:** implementation plan  
**Product:** Turku Departures  
**Date:** 2026-10-06  
**Scope:** Home information architecture, destination-first journey guidance, stop-first departure workflow, flow convergence, standalone/journey Stop Radar, boarding handoff, Ride Mode, accessibility, failure states, rollout and regression gates  
**Canonical product spec:** [Journey Assistant](JOURNEY_ASSISTANT_SPEC.md)  
**Detailed nearby-routing appendix:** [Destination-aware Nearby](DESTINATION_AWARE_NEARBY_SPEC.md)  
**Radar contract:** [Stop Radar / Compass](STOP_RADAR_SPEC.md)  
**Ride contract:** [Ride Mode](RIDE_MODE_SPEC.md)

---

## 1. Decision

Turku Departures should support **two first-class passenger flows in parallel**:

1. **Destination-first**
   - passenger says where they want to go;
   - the app recommends the most useful boarding stop and concrete trip;
   - the app guides the passenger to the stop, onto the bus, through transfers and to the correct exit;
   - the UI emphasises the next passenger action rather than transport-system structure.

2. **Stop-first**
   - passenger already knows the stop;
   - the app opens the full departure board immediately;
   - all current strengths remain: realtime/scheduled truthfulness, disruptions, filtering, saved/recent stops, trip details and manual get-off alerts;
   - destination guidance remains optional.

These are **not two separate app modes** and must not be presented as tabs such as “Journey / Stops”.

The model is:

> **Two first-class entry flows, one shared journey intelligence layer.**

The flows can converge at any point without discarding context.

---

## 2. Product outcome

The destination-first path should answer:

> **What should I do next to get where I am going?**

The stop-first path should answer:

> **What leaves from this stop next?**

Both should remain excellent.

A user who knows the transport system must never be forced through journey planning.

A user who does not know the correct stop or platform must never be forced to interpret raw nearby-stop data before the app offers a recommendation.

---

## 3. Locked design principles

### 3.1 Guidance does not remove exploration

A recommendation may be prominent, but the passenger can still:

- inspect the full stop;
- inspect other departures;
- inspect other nearby stops;
- inspect alternatives;
- open the radar independently.

### 3.2 Exploration does not block guidance

If the passenger starts from a stop board and later adds a destination, the app should immediately use the open stop as the journey origin and add destination-aware guidance.

The passenger must not restart the flow.

### 3.3 No up-front mode selector

Do not add:

- Journey / Stops tabs;
- Planner / Departures tabs;
- a wizard asking which mode the passenger wants.

Use plain passenger-language entry points:

- **Where are you going?**
- **Find a stop**

### 3.4 One next action at a time after commitment

Before a journey is chosen, the app may compare options.

After a journey is chosen, the primary surface answers only the next action:

- Walk to D2
- Wait for line 18
- Board line 18
- Get ready
- Press STOP
- Get off
- Walk to transfer stop
- Board the next bus
- Walk to destination

Details remain available but secondary.

### 3.5 Do not silently request location

Choosing a destination is not consent to use GPS.

If the app has no recent position obtained from a prior explicit passenger action, show:

- **Use my location**
- **Choose starting stop**

Location remains on-device under the existing privacy contract.

### 3.6 Do not silently claim boarding

The app may infer that the selected bus is approaching, at the stop or likely departed.

It must not assert that the passenger boarded the bus without an explicit action.

Use an explicit confirmation such as:

> **I’m on the bus**

After confirmation, route/exit configuration may be automatic.

### 3.7 Never silently switch a committed journey

Before commitment, ranking can change as evidence improves.

After commitment, small ETA/GPS changes do not move the passenger to another stop or trip.

If the selected journey becomes invalid, enter explicit recovery.

### 3.8 Stop Radar remains a standalone product capability

Radar must continue to work with no destination and no selected journey.

Journey integration enhances Radar; it does not consume it.

---

## 4. Three user cases this architecture must satisfy

### A. Unfamiliar passenger

Intent:

> “I need to get to Prisma.”

The passenger should not need to know:

- which stop is closest;
- which platform serves the correct direction;
- whether a slightly farther stop is better;
- where to exit.

Success path:

> Search destination → choose best journey → walk to recommended stop → board selected bus → automatic exit target → final walk.

### B. Experienced commuter

Intent:

> “Show D2 departures.”

Success path:

> Find stop → D2 → departure board.

No destination, GPS or journey planning is required.

### C. Passenger under time pressure or uncertainty

Intent:

> “Tell me what to do now, but do not make unsafe assumptions.”

Success requires:

- conservative catchability;
- truthful live/scheduled/stale states;
- stable recommendations;
- no encouragement to run;
- explicit boarding confirmation;
- obvious recovery when a plan fails.

---

## 5. Top-level experience state

Do **not** introduce a global enum such as:

```text
mode = "destination" | "stop"
```

The app already has stronger state primitives.

The UI should derive its presentation from independent facts:

- `journey.destination`
- `stopId`
- `selectedJourney`
- `ride.session`
- `finalWalk`
- Radar overlay/session state

Conceptually:

| Facts | Experience |
| --- | --- |
| no destination, no stop | dual-entry Home |
| stop only | stop-first board |
| destination, no origin/position | origin resolution |
| destination + position | journey discovery |
| destination + stop, no committed journey | journey guidance from that stop |
| selectedJourney | active journey / next-action UI |
| ride.session | Ride Mode |
| transfer continuation | active journey for next leg |
| finalWalk | final walk |
| Radar open | overlay/inline guidance; does not replace core journey state |

Radar is orthogonal to the journey state machine.

---

## 6. Home information architecture

### 6.1 Default mobile Home

The first useful content should be compact enough that both main entry points are visible early on a normal phone.

Recommended hierarchy:

```text
Turku Departures

Where are you going?
[ Search destination, address or place ]

Home   Work   Recent

Find a stop
[ Stop name or number ]  [location shortcut where appropriate]

Favourite / recent stops

Near you
[ Find nearest stop ]   [ Open stop radar ]
```

Service/recovery content follows contextually rather than competing with both main entry points.

### 6.2 Destination entry

Heading:

> **Where are you going?**

Input contract remains the existing Journey Assistant contract:

- saved places;
- stops;
- local OSM POIs;
- local OSM addresses/streets;
- supported external fallback/handoff where applicable.

Quick choices should prioritise saved and recent destinations.

### 6.3 Stop entry

Heading:

> **Find a stop**

Keep the existing `BusStopForm` behaviour:

- stop number/name;
- fuzzy suggestions;
- keyboard/combobox accessibility;
- safe location shortcut;
- no unsafe auto-selection under poor accuracy or ambiguity.

Quick stops remain:

- favourites;
- recents.

### 6.4 Standalone Radar entry

Radar must remain explicitly available on Home through **Near you**.

Recommended action:

> **Open stop radar**

It must not require a destination.

If no target is already known, the existing target priority remains:

1. selected/open stop if suitable;
2. otherwise nearest stop after the first live fix.

The radar still offers surrounding stops and manual target switching.

---

## 7. Destination-first flow

### Step 1 — choose destination

Passenger chooses:

- saved place;
- POI;
- address;
- stop.

After selection, the destination field becomes compact context:

> To: Prisma Itäharju ×

Do not keep a large search form competing with results.

### Step 2 — resolve origin

Use this order:

1. open stop, if the destination was added from a stop board;
2. a sufficiently fresh in-session position obtained from an earlier explicit location action;
3. otherwise ask the passenger.

If origin is unresolved, show:

> **Start from where you are?**  
> [ Use my location ]  
> [ Choose a starting stop ]

Do not trigger the browser permission prompt merely because a destination was selected.

If GPS is denied/unavailable, stop-based origin remains a complete supported path.

### Step 3 — produce journey recommendations

When a position exists, run the existing destination-aware nearby logic.

The main answer should be **journeys**, not a generic stop grid.

Primary surface:

> **Best option**

Example:

```text
Walk 180 m to Kauppatori D2
Line 18 → Runosmäki
Leaves in 6 min
Get off at Piiparinpolku
Arrive about 17:32
[ Start journey ]
```

Then show at most a few genuinely different alternatives, for example:

- Less walking
- Easier to catch
- Simpler / fewer transfers
- Next bus

Do not show near-duplicate cards merely because the engine can produce them.

### Step 4 — nearby stops remain explorable

Below route recommendations:

> **Compare nearby stops**

Keep:

- Best for destination;
- Nearest;
- all useful nearby stops;
- non-fitting/other-direction stops when they help orientation;
- explicit uncertainty.

The passenger can open any stop board.

### Step 5 — no direct bus

Do **not** collapse into a raw stop list and leave the passenger to solve the route.

When direct service is absent or insufficient, the bounded transfer engine should become the next answer:

> **Best option with a change**

The existing one/two-transfer capability should remain conservative.

Nearby stops remain below as exploration/fallback.

### Step 6 — no reliable route

If neither direct nor bounded transfers produce a reliable option:

- say so plainly;
- keep nearby stop exploration;
- keep stop search;
- offer the existing external official-planner handoff where useful;
- never manufacture certainty.

---

## 8. Stop-first flow

### Step 1 — choose stop

Passenger uses:

- stop search;
- favourite;
- recent stop;
- safe nearest-stop shortcut;
- Radar → Open target stop.

Open the board immediately.

### Step 2 — preserve the board as the dominant surface

The full board remains unchanged in capability:

- realtime vs scheduled;
- stale/offline semantics;
- disruptions;
- line filtering;
- selected journey pinning;
- trip details;
- wheelchair information;
- get-off alert;
- refresh;
- saved stop behaviour.

Destination planning must not push the board off the first useful viewport for a returning commuter.

### Step 3 — optional bridge into destination guidance

Under or around the board, keep a compact prompt:

> **Going somewhere specific?**  
> Add destination

If the passenger adds a destination:

- the current `stopId` is the origin;
- do not ask for GPS;
- do not send the passenger back to Home;
- evaluate concrete departures from this stop toward the destination;
- highlight the best compatible trip;
- retain the full board.

### Step 4 — if another nearby stop is materially better

Do not silently switch.

Say, for example:

> **A better option leaves from D4, about 220 m away.**

Actions:

- Keep using this stop
- View D4 / compare route

The current board remains available.

---

## 9. Flow convergence rules

### 9.1 Stop → Destination

Input:

- active stop;
- destination added.

Result:

- active stop becomes explicit journey origin;
- destination-aware board sorting/badges activate;
- best concrete trip is highlighted;
- exit stop and arrival become available;
- passenger may commit to the journey;
- no location permission is required.

### 9.2 Destination → Stop

Input:

- journey recommendation;
- passenger opens boarding stop.

Result:

- open full board;
- preserve destination;
- preserve selected/preview journey context;
- highlight **Your bus** when a concrete journey is committed;
- do not discard route recommendation.

### 9.3 Destination → another stop

Opening another stop is exploration.

Do not silently replace a committed journey merely because the passenger inspected another board.

Any replan is explicit.

### 9.4 Clear destination

Clearing destination should:

- remove destination-specific rankings and guidance;
- preserve the currently open stop;
- return that surface to normal stop-first behaviour.

### 9.5 Clear/open another stop

Changing stops should not automatically clear destination unless existing safety/correctness rules require it.

A destination may remain useful while the passenger compares origins.

A committed journey, however, must not be silently rewritten to match a newly inspected stop.

---

## 10. Journey commitment

The passenger commits via an action such as:

> **Start journey**

After this point, `selectedJourney` is the authoritative journey contract.

It should represent enough concrete information to support:

- boarding stop;
- concrete trip occurrence;
- departure;
- line/headsign;
- exit occurrence;
- transfer legs;
- transfer stops;
- final walk;
- destination;
- confidence/evidence needed for recovery.

The exact storage structure may reuse the current direct/transfer models, but the UI must treat a committed journey as stable.

---

## 11. ActiveJourney becomes the next-action surface

The component should progressively evolve from a journey summary into a passenger action controller.

### Phase A — walk to stop

Primary:

> **Walk to D2**  
> 180 m

Actions:

- **Guide me with radar**
- walking directions handoff where available
- View stop

Secondary context:

- line;
- departure;
- destination;
- expected arrival.

### Phase B — near/at stop

The app may say:

> **You’re near D2**

Only claim arrival under existing accuracy rules.

If certainty is insufficient:

> **D2 is within your GPS uncertainty**

Do not automatically mark the passenger “at stop” based on weak evidence.

Existing manual confirmation remains available.

### Phase C — wait for selected bus

Primary:

> **Wait for line 18 → Runosmäki**

Show:

- due/live state;
- concrete selected bus;
- disruption/cancellation;
- catchability/revalidation.

The raw board remains reachable.

### Phase D — bus at/near stop

Primary:

> **Your bus is here / arriving**

Do not claim boarding.

Offer explicit passenger action.

### Phase E — boarding handoff

Use explicit confirmation:

> **I’m on the bus**

This may open/complete a compact get-off-alert confirmation.

No GPS/vehicle inference alone can move the app into Ride Mode.

---

## 12. Get-off alert handoff

### 12.1 Journey-driven alert

When the passenger came from a committed journey, the app already knows the intended exit.

Do not ask the same route question again.

Current `RideSetup` already supports preferred target stop/sequence; use that capability as the foundation.

Journey-driven setup should display:

> **Get-off alert**  
> Get off at Piiparinpolku  
> 7 stops

Primary:

> **Start get-off alert**

Secondary:

- Change stop
- Alert/settings details as needed

The downstream stop selector is revealed only when the passenger chooses **Change stop** or when the preferred exit cannot be proven.

### 12.2 Pure stop-first alert

If there is no destination/committed journey, preserve the current manual flow:

> **Where do you want to get off?**

The user chooses a downstream stop.

This is a critical non-regression.

### 12.3 Permission behaviour

Do not turn journey commitment into a chain of surprise permission prompts.

Keep the existing conservative notification/location capability model.

Route selection and exit selection should never depend on notification permission.

---

## 13. Radar architecture

Radar has **two first-class launch contexts**.

### 13.1 Standalone Radar

Purpose:

> “Help me physically find the right nearby stop.”

Available independently of a destination.

Entry points:

- Home → Near you → Open stop radar;
- existing Nearby surface;
- stop context where appropriate.

Initial target:

1. active/open stop when appropriate;
2. otherwise nearest stop after fresh fix.

Behaviour remains consistent with `STOP_RADAR_SPEC.md`:

- live high-accuracy position;
- compass / direction of travel / north-up fallback;
- surrounding stop markers;
- approximate street axes and building cues;
- accuracy halo;
- target frozen after selection;
- manual target switching;
- no hidden route switching;
- no claim of safe walking route.

### 13.2 Journey Radar

Purpose:

> “Guide me to the boarding stop for the journey I already chose.”

Entry:

> **Guide me to D2**

Initial target:

- committed journey’s current boarding/transfer stop.

Recommended target is therefore deterministic.

Manual marker/target switching remains allowed for orientation, but switching the Radar target **does not rewrite the committed journey**.

If the passenger opens another target stop, it is exploration.

Any action that changes the journey must be explicit and revalidated.

### 13.3 Shared Radar implementation

Do not create two Radar components.

Use the existing `StopRadar` and provide launch context:

Conceptually:

```ts
{
  source: "standalone" | "journey",
  initialTargetStopId,
  recommendedTargetStopId,
  activeStopId,
  returnFocusTarget
}
```

This is an interaction contract, not necessarily a persisted global object.

### 13.4 Radar is not a global app mode

Opening Radar must not discard:

- destination;
- selected journey;
- current board;
- nearby results.

Closing Radar returns the passenger to the surface that launched it.

### 13.5 Active ride

During active Ride Mode, Ride Mode remains authoritative.

Do not expose competing stop-navigation controls that can confuse the passenger or contend for location/wake-lock semantics.

Standalone Radar remains available before/after a ride, not as a competing in-ride mode.

---

## 14. Transfers

A committed transfer journey should remain one continuous passenger experience.

Example:

```text
Walk to D2
↓
Wait for line 32
↓
Ride / get off at Kauppatori
↓
Walk 120 m to E4
↓
Wait for line 7
↓
Ride / get off
↓
Final walk
```

After one ride ends:

- activate the next transfer leg;
- show the next action immediately;
- Journey Radar targets the next boarding stop when requested;
- next get-off target is preconfigured from the committed itinerary.

Do not return to generic planner Home between legs.

---

## 15. Recovery

Recovery must preserve the passenger’s destination and explain what changed.

Triggers may include:

- selected departure cancelled;
- selected trip departed before passenger reached the stop;
- selected transfer became impossible;
- selected stop unavailable;
- required route evidence no longer reliable.

Recovery sequence:

1. state the problem;
2. preserve destination;
3. search alternatives under existing bounded rules;
4. show replacement journeys;
5. passenger explicitly chooses replacement;
6. update `selectedJourney`.

Never silently jump to another platform or bus.

---

## 16. Journey card hierarchy

Current cards contain rich data. Keep the data, reduce simultaneous visual competition.

### Primary collapsed content

Show:

- option label when meaningful: Best / Faster / Less walking / Easier to catch;
- arrival time;
- line/headsign;
- boarding stop;
- access walk;
- exit stop;
- catchability / critical warning.

### Secondary content

Compact or expandable:

- ride duration;
- final walk;
- data source;
- live/scheduled evidence;
- confidence explanation;
- trade-off rationale;
- detailed timing.

The user’s first read should answer:

> “Which option should I take and what do I do first?”

---

## 17. Home/secondary-content hierarchy

The current product has many useful modules. The redesign must avoid making all of them equally loud.

### Before any stop/destination

Priority:

1. destination search;
2. stop search;
3. destination/stop quick chips;
4. Near you + standalone Radar;
5. recovery/service/supporting content.

### Stop-first board

Priority:

1. board;
2. stop-relevant alerts;
3. compact add-destination bridge;
4. nearby/standalone Radar;
5. saved/supporting content.

### Destination discovery

Priority:

1. destination context;
2. origin resolution / journey recommendations;
3. route alternatives;
4. compare nearby stops;
5. standalone exploratory controls.

### Active journey

Priority:

1. next action;
2. current selected trip;
3. recovery/critical warning;
4. route overview;
5. generic exploratory surfaces are visually demoted.

---

## 18. Component-level implementation direction

### `src/App.jsx`

Primary responsibility:

- orchestration;
- conditional ordering of surfaces;
- focus transitions;
- flow convergence.

Changes:

- render dual-entry Home in the idle state;
- move destination-first entry ahead of generic nearby planning;
- preserve board-first layout when `stopId && !destination`;
- derive journey-focused layout when destination/selected journey exists;
- keep Radar state non-destructive.

Avoid adding a giant “mode” state.

### `JourneySearch.jsx`

Changes:

- clear default Home presentation;
- compact selected-destination state;
- quick saved/recent destinations;
- preserve all local-first search semantics;
- support use from stop-first board without becoming visually dominant.

### `BusStopForm.jsx`

Minimal changes only.

Preserve its current safety/accessibility strengths.

Possible presentation-level work:

- Home heading/placement;
- compact bridge use when destination origin needs “Choose a stop”.

### `NearbyStops.jsx`

This is the biggest presentation refactor.

Keep its existing intelligence:

- one-time location;
- destination-aware fit;
- direct options;
- transfer search;
- Best vs Nearest;
- Radar lazy loading;
- all nearby stops.

Change hierarchy by state:

**No destination**
- Near you
- Find nearest stop
- Open Radar
- nearest stop list

**Destination selected**
- origin/location action if needed
- journey recommendations first
- transfer alternatives when needed
- Journey Radar/boarding-stop guidance after commitment
- Compare nearby stops lower
- generic grid secondary

Avoid duplicating routing logic into a second component unless extraction is required for maintainability.

### `JourneyOptions.jsx`

Implement progressive disclosure and stronger primary hierarchy.

Do not remove evidence; demote details.

### `ActiveJourney.jsx`

Evolve toward explicit phases:

- walk;
- at/near stop;
- wait;
- bus arriving;
- boarding confirmation;
- recovery;
- transfer continuation.

The primary CTA changes with the phase.

### `StopRadar.jsx`

Keep one component.

Add only what is required to make the launch contract explicit.

Do not regress standalone behaviour.

### `DepartureRow.jsx`

Preserve manual Get-off alert.

For selected journey:

- keep **Your bus** treatment;
- ensure journey-selected exit is handed into Ride setup;
- avoid asking the passenger to solve the exit twice.

### `RideSetup.jsx`

Add a journey-driven confirmation presentation when a preferred target is proven.

Manual mode remains the default fallback.

Do not duplicate trip-stop fetching/buildRidePlan logic.

### `RideMode.jsx`

No broad redesign required for this architecture.

It remains the authoritative in-ride surface.

Only ensure handoff/context copy agrees with the committed journey.

---

## 19. Accessibility contract

Every major transition needs a deterministic focus target.

Examples:

| Transition | Focus target |
| --- | --- |
| destination selected | destination context / origin decision |
| location results ready | journey recommendations heading |
| journey committed | ActiveJourney heading |
| Open stop | board heading |
| Radar opened | Radar heading |
| Radar closed | launching action |
| stop reached/confirmed | waiting state heading |
| boarding confirmed | get-off setup / Ride heading |
| ride completed with transfer | next ActiveJourney action |
| final ride completed | FinalWalk heading |
| recovery starts | recovery heading |

Additional requirements:

- keep semantic heading order;
- avoid mounting live regions only after the event they need to announce;
- throttle changing GPS/realtime announcements;
- no colour-only distinctions;
- preserve keyboard flow;
- preserve 320 px layout;
- preserve 200% text scaling;
- maintain practical touch targets;
- reduced-motion remains supported.

---

## 20. Privacy, offline and backendless constraints

This UX architecture does not change the product’s technical boundary.

Must remain:

- static;
- backendless;
- privacy-first;
- no account;
- no server-side journey/location history;
- no analytics dependency;
- no hidden provider secret.

Location:

- explicit passenger action unless already obtained within the current session under existing rules;
- on-device;
- no persistent GPS history.

Radar:

- same privacy model as current spec.

Offline/degraded:

- stop search and cached/local capabilities degrade progressively;
- journey search must say when route evidence is unavailable;
- manual stop-first remains available wherever underlying data permits;
- Ride Mode retains current truthful degraded semantics.

---

## 21. Back, reload and persistence

The new layout must be tested as a state system, not only as click paths.

### Required cases

- Home → destination → Back;
- Home → stop → Back;
- stop → add destination → Back;
- destination → open recommended stop → Back;
- destination → Start journey → reload;
- active journey → Radar → close;
- active journey → open stop board → Back;
- Ride Mode → reload;
- transfer ride → reload;
- final walk → Done.

### Rules

- URL remains canonical for open stop as today;
- do not encode private destination/location data into shareable URLs by default;
- active ride persistence keeps its current documented guarantees;
- selected journey persistence should be no broader than needed for reliable same-session/reload continuation;
- stale persisted route evidence must be revalidated before strong claims.

---

## 22. Error and edge-case matrix

### Location denied

Destination flow:

> Use starting stop instead.

Stop-first remains fully available.

Standalone Radar cannot run live without location; explain why without blocking the rest of the app.

### Poor GPS accuracy

Do not auto-select a stop from weak evidence.

Show approximate state and let the passenger compare.

Radar uses its existing uncertainty semantics.

### Two almost-equidistant platforms

Do not choose based only on distance.

Destination-aware usefulness may resolve the choice.

Without destination, ask the passenger to choose.

### Selected trip cancelled

Enter recovery.

Keep destination and committed intent.

### Passenger misses bus

Do not continue pretending the selected trip is catchable.

Offer replacement options.

### Passenger inspects another stop during active journey

Exploration only.

Do not silently rewrite itinerary.

### Destination has no bounded route

Say so.

Keep stop exploration and external handoff.

### Destination cleared while stop open

Return to normal board, preserving the stop.

### Radar target changed manually

Changes Radar guidance only.

No automatic journey replan.

### Preferred exit no longer provable

Fall back to manual RideSetup instead of guessing.

---

## 23. Non-regression contract

A release implementing this architecture must not lose:

- direct stop-number/name search;
- safe nearest-stop selection;
- favourite stops;
- recent stops;
- full departure board;
- destination/headsign translation;
- live/scheduled/stale semantics;
- offline board behaviour;
- disruptions;
- line filtering;
- trip details;
- manual get-off alert;
- existing Ride Mode safety semantics;
- destination-aware nearby ranking;
- transfer search;
- recovery;
- standalone Radar;
- Radar target switching;
- Radar street/building context;
- screen-reader behaviour;
- keyboard access;
- PWA/backendless architecture;
- Android/native provider boundaries;
- localization.

---

## 24. E2E acceptance matrix

At minimum, add/maintain journeys for:

### Destination-first

1. destination + explicit GPS → direct journey;
2. destination + GPS denied → choose starting stop;
3. destination + direct bus → Start journey;
4. destination + no direct bus → transfer recommendation;
5. destination → compare nearby stops;
6. destination → open recommended stop board;
7. committed journey → Journey Radar;
8. Journey Radar → manual target switch does not rewrite journey;
9. journey → selected bus highlighted;
10. journey → boarding confirmation → preferred exit;
11. journey → get-off alert;
12. journey → transfer continuation;
13. journey → final walk;
14. cancellation → recovery.

### Stop-first

15. stop search → board only;
16. favourite/recent stop → board;
17. board → manual Get-off alert with manual exit selection;
18. board → Add destination;
19. board + destination → selected compatible trip;
20. board + destination → materially better nearby stop recommendation without silent switch.

### Standalone Radar

21. Home → Open Radar with no destination;
22. Radar → nearest target;
23. Radar → manual target switch;
24. Radar → Open target stop;
25. Radar permission denial;
26. Radar poor accuracy;
27. Radar close restores focus/context.

### State/navigation

28. Back/Forward;
29. reload with open stop;
30. reload during active ride;
31. offline/degraded transitions;
32. 320 px mobile;
33. 200% text;
34. keyboard-only;
35. axe smoke.

Run across the project’s existing supported browser matrix where relevant.

---

## 25. Rollout plan

Do not ship this as one large redesign.

### Batch 0 — UX/state regression baseline

Before UI movement:

- codify golden stop-first journeys;
- codify destination-first golden journey;
- add tests for manual standalone Radar;
- add tests proving destination clear preserves open stop;
- add tests proving Radar target switch does not rewrite journey.

**Goal:** protect current strengths before changing information architecture.

### Batch 1 — Dual-entry Home

Implement:

- destination entry first;
- stop entry immediately alongside/below it;
- quick destinations;
- favourite/recent stops;
- Near you + standalone Radar entry.

No routing-engine changes.

**Acceptance:** experienced stop user still reaches a board as quickly as before.

### Batch 2 — Destination origin resolution

Implement:

- selected destination compact state;
- explicit Use my location;
- Choose starting stop;
- active open stop used as origin;
- no silent permission request.

**Acceptance:** destination flow works with and without GPS.

### Batch 3 — Journey-first results hierarchy

Implement:

- best route before raw nearby-stop grid;
- meaningful alternatives only;
- progressive JourneyOption details;
- transfer recommendation when direct route absent;
- Compare nearby stops secondary.

No ranking rewrite unless a bug is discovered.

### Batch 4 — Seamless stop ↔ destination convergence

Implement:

- stop board → Add destination;
- destination recommendation → Open stop;
- preserve context both ways;
- explicit better-nearby-stop suggestion;
- clearing destination preserves stop.

### Batch 5 — ActiveJourney next-action UX

Implement phase-oriented presentation:

- walk;
- near/at stop;
- wait;
- selected bus approaching;
- boarding confirmation;
- recovery;
- transfer continuation.

Keep raw board accessible.

### Batch 6 — Journey-driven Radar

Implement:

- `Guide me to <stop>`;
- committed boarding/transfer stop as initial target;
- same `StopRadar`;
- target switching remains local to Radar;
- close returns focus to ActiveJourney;
- standalone Radar tests remain green.

### Batch 7 — Boarding and RideSetup simplification

Implement:

- explicit boarding confirmation;
- journey-driven preferred exit confirmation;
- hide redundant exit list until Change stop;
- manual stop-first RideSetup unchanged;
- Ride Mode handoff and transfer continuation.

### Batch 8 — IA cleanup and accessibility hardening

Implement:

- demote duplicate supporting modules in journey states;
- final focus/live-region review;
- text scaling;
- 320 px;
- reduced motion;
- offline/degraded copy;
- localization.

### Batch 9 — Field validation

Real-device/manual scenarios:

- central Turku multi-platform hub;
- simple direct suburban trip;
- one-transfer trip;
- weak GPS;
- missed bus;
- cancellation;
- Android;
- iPhone/Safari;
- standalone Radar walking;
- journey Radar walking.

Do not call the new workflow fully validated until field evidence exists.

---

## 26. Suggested engineering sequence

Implementation should prefer orchestration and presentation changes over routing rewrites.

Recommended dependency order:

```text
golden tests
  ↓
Home IA
  ↓
origin resolution
  ↓
journey-results hierarchy
  ↓
stop/destination convergence
  ↓
ActiveJourney phases
  ↓
Journey Radar
  ↓
RideSetup simplification
  ↓
accessibility + field QA
```

Each batch should be mergeable independently and leave production usable.

---

## 27. Success criteria

### Destination-first

A passenger unfamiliar with the network should be able to answer these without interpreting a raw route map:

1. Where should I walk?
2. Which bus should I take?
3. Is it realistic to catch?
4. Where should I get off?
5. What do I do after I get off?
6. What happens if the plan fails?

### Stop-first

A regular passenger should still be able to:

1. open a known stop quickly;
2. see the next departures immediately;
3. ignore journey planning completely;
4. manually choose a get-off alert;
5. use Nearby/Radar independently.

### Cross-flow

A passenger must be able to:

- add a destination after opening a stop;
- open a stop from a destination recommendation;
- move between guidance and raw transit data without losing intent.

### Radar

A passenger must be able to:

- open Radar without a journey;
- use Radar for a committed journey;
- switch Radar target without silently switching journey;
- return to the previous flow cleanly.

---

## 28. Product quality target

This architecture is designed to improve the workflow from the current stop-centric experience without sacrificing the product’s strongest existing capability.

Conceptual target:

- destination-first guidance: excellent for unfamiliar passengers;
- stop-first board: unchanged or better for commuters;
- combined architecture: no forced mode choice and no duplicated transport logic;
- Radar: stronger through journey integration while remaining independently useful.

The release is successful only if **both primary jobs remain fast**:

> **“Where am I going, and what should I do next?”**

and

> **“What leaves from my stop?”**

Neither job is a fallback for the other.
