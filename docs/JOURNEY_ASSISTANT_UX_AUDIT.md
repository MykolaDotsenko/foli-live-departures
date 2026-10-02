# Journey Assistant UX implementation audit

**Status:** historical implementation-priority audit; current source has progressed through pre-field batches #137 and #139  
**Canonical product spec:** [JOURNEY_ASSISTANT_SPEC.md](JOURNEY_ASSISTANT_SPEC.md)  
**Detailed edge-case appendix:** [DESTINATION_AWARE_NEARBY_SPEC.md](DESTINATION_AWARE_NEARBY_SPEC.md)

---

## 1. Executive summary

The current product is strong when the passenger already knows the stop they need. It is much weaker when the passenger only knows the destination.

The main product gap is therefore not another departure-board feature. It is the missing decision layer between:

> **I am here**

and:

> **I am waiting at the correct stop for the correct bus.**

The Journey Assistant should close that gap without replacing the current strengths:

- fast direct stop lookup;
- pure Nearby;
- favourites and recents;
- complete departure boards;
- privacy-first saved places;
- recovery tools;
- hardened Ride Mode;
- graceful degraded states.

The implementation should therefore be additive and staged.

---

## Architecture guardrail — backendless by design

Journey Assistant must preserve the current deployment and privacy model:

- static browser-only PWA;
- GitHub Pages-compatible production build;
- no application backend;
- no project-owned proxy;
- no server-side session/database;
- no secret API key embedded in frontend code;
- no silent server-side journey/location history.

Address/POI and transfer capabilities may use only client-side providers whose terms, CORS model and credential requirements are compatible with a public PWA. If a provider is unavailable or unsuitable, the product must degrade to saved-place/public-stop workflows rather than adding infrastructure that changes the product concept.

This is a **release gate**, not an implementation preference.

---

## 2. Baseline UX assessment

### Current overall UX

**Estimated current end-to-end UX: ~84/100**

This is not a repository benchmark measurement. It is a design assessment based on the current implementation and product audit.

### Current strengths

1. **Fast stop lookup**
   - name or stop number;
   - no routing workflow required.

2. **Clear departure-board model**
   - live/scheduled distinctions;
   - line filtering;
   - disruptions;
   - refresh/favourites.

3. **Useful pure Nearby**
   - one-time location;
   - privacy-conscious;
   - manual stop comparison remains available.

4. **Strong Ride Mode**
   - remaining stops;
   - ETA fallback hierarchy;
   - stale-live protection;
   - route matching;
   - Get Ready / Press STOP / Get Off Now.

5. **Graceful degradation**
   - GPS, realtime and offline failures do not necessarily collapse the whole app.

6. **Manual passenger control**
   - explicit passenger choices generally beat background automation.

7. **Privacy**
   - no account;
   - no ads;
   - no analytics by design;
   - saved places can remain public-stop-only.

8. **Accessibility engineering**
   - focus management;
   - live-region restraint;
   - keyboard behaviour;
   - touch targets;
   - automated accessibility gates.

### Current weaknesses

1. Nearby answers **what is close**, not **what is useful for the destination**.
2. The geographically nearest stop can be the wrong direction.
3. The passenger must mentally combine stop, line, direction and timetable.
4. No destination-wide ETA.
5. No address/POI search.
6. Home routing is not deeply integrated into the app's own transit intelligence.
7. No route alternatives with meaningful trade-offs.
8. No pre-boarding active journey.
9. No transfer orchestration.
10. Pre-boarding intent does not yet flow seamlessly into Ride Mode.

### Worst current scenario

Dense unfamiliar hub:

> “I am here, I want to go Home, there are many nearby stops — which one should I use?”

**Estimated UX: ~55–65/100**

This is the highest-value gap to close.

---

# 3. Priority model

## P0 — product-critical

Without these, the Journey Assistant does not solve the core city-centre problem.

P0 must be correct before adding sophisticated transfers or visual polish.

## P1 — high-value completion

These make the core direct-journey experience substantially better and more resilient.

## P2 — expansion / polish

These improve completeness, convenience and edge-case quality after the core decision flow is trustworthy.

---

## Architecture guardrail — no backend

Journey Assistant must preserve the current deployment model:

- static GitHub Pages application;
- installable PWA;
- all product state and ranking logic in the browser;
- direct Föli/open-data access;
- no application server;
- no serverless proxy;
- no database;
- no account/auth infrastructure.

Address/POI and routing providers must be browser-safe. Public frontend keys are acceptable only when the provider explicitly supports frontend use and the key can be restricted to the production origin.

If a future capability requires a confidential secret, that provider/capability is rejected rather than adding a backend.

This rule is part of the product non-regression contract, not an implementation preference.

---

# 4. P0 priorities

## P0.1 — Destination intent

### Problem

The app currently knows location and stop context but not the passenger's travel goal.

### Deliverable

One persistent destination model supporting initially:

- Home;
- Work;
- School;
- public Föli stop.

### UX

> **Where do you want to go?**

Quick actions:

- Home
- Work
- School
- Choose stop

Persistent context:

> **To: Home ×**

### Acceptance criteria

- destination remains selected while inspecting stops;
- destination can be cleared in one action;
- changing destination invalidates stale route results;
- late async results from the previous destination are discarded;
- direct stop exploration remains possible without destination intent.

### Expected UX gain

**Very high.**  
This creates the foundation for all useful ranking.

---

## P0.2 — Concrete-trip direction validation

### Problem

Line number alone cannot prove a departure goes toward the destination.

### Deliverable

For each candidate departure:

- resolve boarding occurrence;
- resolve destination downstream occurrence;
- reject destination already passed;
- support repeated stop IDs / loops;
- support branch and short-turn variants;
- respect pickup/drop-off restrictions where available.

### UX

A departure can safely show:

> ✓ Goes to Home

or:

> ↔ Other direction

### Acceptance criteria

- same route number in opposite direction never receives the destination marker;
- loop route matches correct downstream occurrence;
- short-turn trip does not claim unreachable destination;
- sequence is source of truth.

### Expected UX gain

**Critical trust gain.**

---

## P0.3 — Destination-aware Nearby

### Problem

Current Nearby is proximity-only.

### Deliverable

Keep the full nearby list but add:

> **Best for Home | Nearest**

Statuses:

- ★ Best for Home
- ✓ Goes to Home
- ↔ Other direction
- — No direct service
- ? Checking / uncertain

### Non-regression

- all discovered nearby stops remain inspectable;
- pure Nearest remains available;
- no destination → current proximity behaviour remains.

### Acceptance criteria

- farther useful stop can rank above nearer wrong-direction stop;
- nearest mode restores geographic ordering;
- no stop is hidden solely for not serving the destination;
- manual stop opening remains available.

### Expected UX gain

Dense-hub scenario:

**~60 → ~85+ immediately**, even before full arrival-time ranking.

---

## P0.4 — Earliest realistic arrival

### Problem

The passenger cares about when they reach the destination, not only when the bus leaves.

### Deliverable

For each valid/catchable direct candidate derive:

- destination arrival time;
- total time to destination stop;
- confidence/source.

Evidence hierarchy:

1. fresh destination-stop live prediction;
2. propagated boarding live delay;
3. schedule;
4. unknown.

### UX

> **Home stop in ~27 min**  
> Arrive about **22:04**

### Acceptance criteria

- farther stop can win when it produces materially earlier arrival;
- earlier-departing bus can lose when ride is much slower;
- schedule-only arrival is visibly lower confidence;
- repeated identical live snapshot does not remain fresh.

### Expected UX gain

**Very high.**

This is the feature that makes ranking feel intelligent instead of cosmetic.

---

## P0.5 — Conservative catchability

### Problem

The theoretically fastest bus may be impossible to reach.

### Deliverable

Classify:

- At stop
- Comfortable
- Likely catchable
- Tight
- Probably too late
- Unknown

Use:

- distance;
- GPS accuracy;
- departure time;
- safety buffer;
- conservative walking assumptions.

### UX

Do not show an impossible departure as Fastest.

Possible copy:

> **Timing may be tight**

or:

> **Probably too late to catch**

### Acceptance criteria

- uncatchable departure cannot win;
- later catchable departure from same stop can still make the stop useful;
- low GPS accuracy reduces confidence;
- never encourage unsafe rushing.

### Expected UX gain

**High trust and safety gain.**

---

## P0.6 — Stable ranking / hysteresis

### Problem

Realtime and GPS jitter can make recommendations constantly reorder.

### Deliverable

Recommendation stability rules.

Do not change top option for:

- small GPS changes;
- a few seconds of ETA movement;
- insignificant ranking differences.

Change when:

- selected trip departs;
- cancellation/closure appears;
- option becomes uncatchable;
- another option becomes materially better.

### Acceptance criteria

- top card remains stable under GPS jitter;
- focused card is not moved under keyboard/screen-reader user;
- repeated live refresh does not create visible list thrash.

### Expected UX gain

**High perceived-quality gain.**

---

## P0.7 — Destination-aware departure board

### Problem

After choosing a suitable stop, the passenger can still face a generic list and must rediscover the correct bus.

### Deliverable

When destination exists:

### For Home
- matching concrete trips.

### Other departures
- everything else.

Selected departure is pinned/highlighted.

### Non-regression

- normal board remains complete;
- line filters remain;
- unrelated departures remain accessible.

### Acceptance criteria

- destination-relevant rows are correct by concrete trip;
- no unrelated departure is silently removed;
- direct board use without destination remains unchanged.

### Expected UX gain

**High continuity gain.**

---

## P0.8 — Ride Mode non-regression integration

### Problem

New journey planning must not weaken the already-hardened onboard experience.

### Deliverable

Prefill Ride Mode from selected journey:

- trip;
- boarding stop;
- exit stop;
- destination context.

Do not duplicate Ride Mode safety logic.

### Required preserved behaviour

- Remaining;
- ETA freshness;
- stale snapshot protection;
- Get Ready;
- Press STOP;
- Get Off Now;
- route GPS;
- loop/repeated-stop correctness;
- sound test;
- degraded fallback.

### Acceptance criteria

Existing Ride Mode regression suite stays green with equivalent safety semantics.

### Expected UX gain

**Critical continuity and trust gain.**

---

# 5. P1 priorities

## P1.1 — Address and POI destination search

**Implementation status (2026-10-01): implemented and in provider-hardening.** The unified stop/address/POI flow shipped through PR #113. Current work hardens provider-policy degradation, browser E2E and packaged-Android trust boundaries without changing the backendless architecture.

### Deliverable

One search field accepts:

- address;
- shop/business;
- POI;
- stop;
- saved place.

Provider adapter must isolate the external geocoder schema. Direct browser calls are allowed only where provider policy and public-client credential rules permit them; otherwise the feature must fail closed to local stop search plus an external official-planner handoff. No proxy/backend is allowed.

### Key risks

- duplicate branches;
- incorrect business centroid;
- stale POI data;
- privacy expansion;
- public-client key/origin restrictions;
- browser CORS availability.

### UX

Search result disambiguation:

> Prisma Itäharju  
> Kalevantie … · Turku

> Prisma Länsikeskus  
> Viilarinkatu …

### Acceptance criteria

- duplicate branches are not silently resolved;
- address search failure does not break stop search;
- provider credentials are browser-safe/public-client credentials only;
- no confidential secret is bundled or proxied;
- addresses are not silently persisted;
- provider/privacy disclosure exists;
- typing never triggers third-party geocoding;
- provider failure is distinct from a valid zero-result response;
- a runtime provider kill switch degrades to an external official-planner handoff;
- packaged Android makes no direct public-Nominatim request.

### Expected UX gain

**Very high product usefulness gain.**

---

## P1.2 — Destination-side stop discovery

### Problem

The nearest stop to a POI is not necessarily the best arrival stop.

### Deliverable

Discover several plausible alighting stops around destination coordinates.

Rank route outcome using:

- transit arrival;
- final walk;
- reliability.

### Acceptance criteria

- farther destination stop can win when total destination arrival is better;
- unreasonable final walk prevents a transit-fast option from dominating;
- exact stop destination has zero egress.

---

## P1.3 — Route alternatives

### Deliverable

Return a small diverse set:

- ★ Fastest
- Less walking
- Simpler
- Easier to catch / More reliable

Usually 2–3.

### Avoid

- duplicate timetable combinations;
- 10 nearly identical routes;
- opaque numeric ranking.

### Acceptance criteria

- dominated routes removed;
- each shown alternative has a meaningful difference;
- labels are truthful.

---

## P1.4 — Pre-boarding active journey

### Deliverable

After route choice:

> **Walk to D2**

then:

> **You’re at the right stop**

then:

> **Wait for bus 18**

then:

> **Board 18 toward …**

### Acceptance criteria

- selected concrete trip is pinned;
- saved line filters cannot hide the selected trip;
- small ranking changes do not redirect the user;
- no silent switch to a materially better option;
- **I’m at the stop** is an explicit passenger confirmation, not inferred physical-location truth;
- opening another stop pauses selected-trip live monitoring and offers return to the selected stop;
- provider failure degrades confidence rather than producing false “departed” recovery;
- cancellation triggers recovery even if the departure row has already disappeared;
- confirmed disappearance after the departure grace window triggers recovery;
- recovery alternatives exclude the failed concrete trip while preserving the full Nearby list and departure board;
- starting Ride Mode clears the pre-boarding journey so stale state cannot return when the ride ends.

---

## P1.5 — Recovery before boarding

### Cases

- bus departs;
- cancellation;
- stop closure;
- live data changes materially.

### UX

> **18 has departed**  
> Next fastest option…

or:

> **D2 is closed**  
> Use E1 instead…

### Acceptance criteria

- final destination remains unchanged;
- user does not restart the search;
- old invalid trip no longer appears as selected.

---

## P1.6 — Progressive search expansion

### Problem

Rigid nearest-N candidate limits can hide the best stop.

### Deliverable

Expand candidate radius/count only when needed.

### UX

> **Better option a little farther away**

### Acceptance criteria

- nearby list remains available;
- expansion has hard bounds;
- no unbounded request fan-out.

---

## P1.7 — Reliability-aware near-optimal ranking

### Problem

A route one minute faster may be much worse operationally.

### Deliverable

Inside a near-optimal arrival band prefer:

- less walking;
- fewer transfers;
- fresh live;
- primary destination;
- higher frequency;
- fewer disruptions;
- stable recommendation.

### UX

Potential reasons:

> Same arrival time, less walking

> More frequent buses

> More time to catch

---

# 6. P2 priorities

## P2.1 — Transfer routing

**Status (2026-10-02): implemented through PR #137 and generalized/recovery-expanded in PR #139.**

Current implementation:
- bounded direct, one-transfer and two-transfer itinerary search;
- concrete trip and exact stop-occurrence identity on every leg;
- conservative same-stop/cross-platform transfer walking/buffers;
- authoritative Ride Mode handoff leg by leg;
- fresh-only live revalidation for every committed future leg;
- distant future-leg failure is recorded without interrupting the active Ride Mode;
- recovery is explicit, destination-preserving and may include one additional bounded transfer;
- no cancellation, disappearance, delay or recovery path silently switches the committed journey.

---

## P2.2 — Multi-leg Journey Mode

**Status (PR #137): implemented.**

Ride Mode is used independently for each committed transit leg.

Example:

> Walk → 18 → transfer → 7 → final walk

Active UI still shows only the next action.

---

## P2.3 — Arrive-by / leave-at

**Status (PR #139): implemented.**

Default remains:

> Leave now

Do not clutter first run.

---

## P2.4 — User routing preferences

**Status (PR #139): implemented for the bounded preferences the engine can faithfully honor.**

Current settings:

- less walking;
- fewer transfers;
- larger transfer buffer.

Default ranking should work without configuration.

---

## P2.5 — Entrance-aware POI routing

**Status (PR #139): implemented when trustworthy provider geometry/bounds are available; otherwise the app keeps the explicit fail-closed external handoff.**

Useful for:

- malls;
- hospitals;
- campuses;
- arenas.

Only if a trustworthy provider exposes entrance-level data.

Otherwise continue to show approximate final walk and external Maps handoff.

---

## P2.6 — Swedish

Important local completeness improvement, but not prerequisite for solving the current core destination-choice problem.

---

# 7. Recommended implementation order

Do not parallelise every area at once.

### Sprint / milestone 1
- P0.1 Destination intent
- P0.2 Concrete-trip fit
- tests

### Milestone 2
- P0.3 Destination-aware Nearby
- P0.7 destination-aware board
- non-regression UI tests

### Milestone 3
- P0.4 Earliest arrival
- P0.5 Catchability
- P0.6 Ranking hysteresis

### Milestone 4
- P0.8 Ride Mode integration
- field test direct Home journey

### Milestone 5
- P1.1 Address/POI search
- P1.2 destination-side stops

### Milestone 6
- P1.3 route alternatives
- P1.4 active pre-boarding
- P1.5 recovery
- P1.6 progressive search

### Milestone 7
- field validation;
- tune thresholds;
- accessibility/native Finnish review.

### Later
- transfers / multi-leg Journey Mode.

---

# 8. Expected UX progression

| Stage | Estimated end-to-end UX |
|---|---:|
| Current | ~84 |
| P0.1–P0.3 | ~88–90 |
| + earliest arrival / catchability | ~91–93 |
| + board / Ride integration | ~93–94 |
| + address/POI + route alternatives | ~95 |
| + active pre-boarding / recovery | ~95–96 |
| + proven transfer UX / polish | ~96–97 |

These are design targets, not measured usability-study scores.

---

# 9. Release gates for every milestone

Every milestone must preserve:

- static GitHub Pages deployment;
- no backend/proxy/server-side storage;
- no confidential credential in the browser bundle;
- direct stop search;
- pure nearest-stop mode;
- complete nearby-stop access;
- favourites/recents;
- full departure board;
- line filters;
- saved-place recovery;
- driver card / printable backup;
- privacy-first saved places;
- no-account use;
- offline/degraded behaviour;
- accessibility;
- PWA behaviour;
- existing Ride Mode safety.

If a new feature causes regression in one of these, the milestone is not ready.

---

# 10. Highest-value field tests

Before calling P0 complete, test real journeys in:

1. **Dense central hub**
   - several nearby platforms;
   - same line in both directions.

2. **Farther-stop wins**
   - nearest useful bus is much later;
   - farther stop produces earlier arrival.

3. **Bus too soon**
   - fastest theoretical bus is not realistically catchable.

4. **Delayed realtime**
   - recommendation changes materially.

5. **Poor GPS**
   - recommendation remains stable.

6. **Loop/branch route**
   - exact trip direction must stay correct.

7. **Home primary vs backup**
   - backup only wins when materially better.

8. **Ride handoff**
   - selected journey enters Ride Mode without reselecting exit.

---

# 11. Product-level success definition

The P0/P1 programme succeeds when a passenger unfamiliar with the area can start with:

> **I want to go Home**

or:

> **I want to go to Prisma**

and understand, without transport expertise:

- where to walk;
- which stop is correct;
- which bus is correct;
- why another nearby stop is not better;
- when they are likely to arrive;
- what alternatives exist;
- what to do if the plan changes;
- when to get off.

At the same time, an experienced passenger who only wants a departure board should still be able to use the app almost exactly as quickly as today.

**The new product must be more capable without feeling heavier.**


### Multi-leg journey UX — 2026-10-02

Status: implemented as a bounded fallback after direct journey search, with up
to two transfers and explicit multi-leg recovery.

Passenger sequence:
1. direct journey options are checked first;
2. bounded one-transfer and then two-transfer candidates are considered when needed;
3. cards expose the committed lines, transfer context, walking allowance and reliability trade-offs;
4. selecting an option locks concrete trip/stop occurrences for every leg;
5. Active Journey shows the current leg within the ordered itinerary;
6. Ride Mode controls only the boarded/current leg;
7. only authoritative arrival at the exact committed alighting occurrence advances a handoff;
8. premature termination enters recovery instead of silently continuing;
9. every future committed leg is revalidated from fresh-only SIRI evidence;
10. a distant future-leg problem cannot displace the current urgent Ride Mode action;
11. at each transfer, same-stop/cross-platform instructions use the committed stop context;
12. a failed connection may offer bounded recovery choices, but nothing changes until the passenger explicitly selects one;
13. final walking guidance is possible only after the final leg.

UX constraints:
- never hide the full nearby-stop list;
- never present a broken/unknown transfer as a recommendation;
- never imply that timetable-only second-leg timing is live;
- never auto-switch the committed transfer itinerary;
- transfer recovery must return the passenger to fresh choices.
