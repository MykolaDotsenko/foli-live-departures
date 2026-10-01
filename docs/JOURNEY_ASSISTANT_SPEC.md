# Journey Assistant — canonical product & implementation specification

**Status:** canonical implementation spec  
**Product:** Turku Departures  
**Scope:** destination search → route choice → boarding → ride guidance → transfers → final arrival  
**Detailed appendix:** [Destination-aware Nearby design](DESTINATION_AWARE_NEARBY_SPEC.md)  
**Implementation priorities:** [Journey Assistant UX audit](JOURNEY_ASSISTANT_UX_AUDIT.md)

---

## 1. Product promise

The passenger should be able to tell the app only:

> **Where do you want to go?**

The destination may be:

- Home / Work / School;
- a Föli stop;
- a street address;
- a shop or other POI;
- a recent or saved destination.

The app should then answer:

1. Which nearby stop should I walk to?
2. Which concrete bus/trip should I take?
3. When will I realistically arrive?
4. What are the best alternative routes?
5. What should I do next?
6. When should I get off?
7. What should I do if the plan changes?

The UI must stay simple even when the routing logic is complex.

---

## 2. Core UX principle

**One destination → a few meaningful route choices → one next action at a time.**

Do not expose transport-system complexity unless it helps a decision.

The product should transform:

- stops,
- routes,
- trip sequences,
- realtime,
- delays,
- walking burden,
- disruptions,
- transfer risk,

into passenger actions.

---

## 3. Three primary surfaces

### A. Search / Home

Primary input:

> **Where do you want to go?**  
> Search address, place or stop

Quick actions:

- Home
- Work
- School
- Recent destinations

Secondary manual control:

> **Stops near me**

No wizard. No up-front mode selector such as “Address / Store / Stop”.

---

### B. Results

After destination resolution:

> **To: Prisma Itäharju ×**  
> From: My location

Show a small set of route choices:

- **Fastest**
- **Less walking**
- **Simpler / no transfer**
- **Easier to catch / more reliable**

Usually 2–3 options. Maximum 4 when genuinely different.

Below that:

> **Nearby boarding stops**  
> **Best for Prisma | Nearest**

The full nearby-stop list remains available.

---

### C. Active journey

The dominant UI answers:

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
- Walk to Prisma

The whole route remains available as a compact overview, but the next action dominates.

---

## 4. Destination search

The one search field accepts:

- stop name;
- stop number;
- full or partial address;
- POI/store/business name;
- saved-place name;
- recent destination.

### Search result groups

When useful:

**Saved places**
- Home
- Work

**Places**
- Prisma Itäharju
- Prisma Länsikeskus

**Addresses**
- Yliopistonkatu 20, Turku

**Stops**
- Kauppatori D2 · Stop 1234
- Kauppatori A1 · Stop 1235

### Ambiguous names

Never silently choose between multiple branches.

Show:
- branch/neighbourhood;
- address;
- municipality if needed;
- approximate distance when useful.

### Search quality

Support:
- partial input;
- case differences;
- missing accents;
- small typos;
- multilingual names when available.

Do not aggressively autocorrect without confirmation.

### External search interaction rule

Local public-stop matching may update as the passenger types.

External address/POI lookup must be different:
- no network request on every keystroke;
- passenger explicitly submits the query;
- debounce alone is not considered sufficient when provider policy forbids autocomplete;
- results may be cached only in-memory/session scope by default so private address queries are not silently persisted;
- requests are rate-limited according to provider policy;
- provider attribution is visible where required;
- the adapter can be replaced without changing the UI contract.

This preserves the backendless/privacy-first product model and prevents a search field from becoming an uncontrolled third-party data stream.

---

## 5. Destination model

All destination types resolve into one internal structure.

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

### Saved places

A saved place may contain:
- one primary stop;
- approved backup stops.

Primary is preferred in near-ties.

A backup may win when it is materially faster, more reliable, or the primary is disrupted.

Never silently substitute a backup without explanation.

---

## 6. Geocoding / POI provider boundary

Föli data is used for transit topology and realtime, not general address/POI lookup.

### Hard architecture constraint: no backend

Turku Departures remains a **static, browser-only PWA**.

The product must not require:
- an application backend;
- a proxy owned by this project;
- server-side sessions;
- a database;
- server-side storage of journey/location history;
- a secret API key embedded in the public frontend.

GitHub Pages compatibility remains a release requirement.

Arbitrary destination search must therefore use a **client-side provider adapter** whose production use is permitted directly from a browser, or degrade to stop/saved-place search when no acceptable provider is configured:

```ts
type DestinationSearchProvider = {
  search(query, context, signal): Promise<DestinationCandidate[]>;
  resolve(candidate, signal): Promise<ResolvedDestination>;
};
```

Provider choice must consider:
- Finland/Turku quality;
- address quality;
- POI coverage;
- Finnish/Swedish/English support;
- privacy;
- licensing and provider usage policy;
- cost/quota;
- browser/CORS constraints;
- whether a secret credential would be exposed;
- attribution;
- graceful provider replacement.

Do not couple UI components directly to one provider schema.

A provider that requires a confidential server-side credential is **not compatible** with this product architecture.

Public geocoding services with restrictive fair-use policies must be treated as optional capabilities, not as an unlimited autocomplete backend. If provider policy forbids autocomplete, external queries occur only after an explicit passenger action and are locally cached/throttled.

### Provider feasibility audit — 2026-10-01

This audit is a release contract, not a suggestion.

**Digitransit Geocoding / VARELY Routing**

- Digitransit production APIs require registration/subscription and issue API keys through the developer portal.
- The official portal exposes Geocoding v1 and Routing v2 VARELY, but the public documentation does not establish those subscription keys as browser-public identifiers that can be safely shipped by an unrelated static PWA and origin-restricted to this GitHub Pages site.
- Therefore Turku Departures does **not** embed a Digitransit subscription key and does not call those authenticated APIs directly from the frontend.
- The official Turku Digitransit journey planner remains an allowed external handoff because navigation to that service does not expose a project credential.

References:
- https://portal-api.digitransit.fi/products
- https://portal-api.digitransit.fi/api-details
- https://digitransit.fi/en/developers/apis/1-routing-api/

**Public OpenStreetMap Nominatim**

- end-user-triggered search is permitted for moderate use;
- autocomplete is forbidden;
- the documented maximum is one request per second for the application, not one request per user;
- requests must identify the application through a valid Referer/User-Agent and attribution must be visible;
- repeated requests should be cached;
- apps must be switchable away from the public service without requiring a software update.

Reference: https://operations.osmfoundation.org/policies/nominatim/

Current web-PWA controls:
- no request while typing;
- search only after explicit passenger submit;
- serialized network starts with a 1.1 second minimum interval per client;
- bounded session cache and request de-duplication;
- visible OpenStreetMap attribution;
- 429 cooldown and fail-closed provider errors;
- runtime provider config is excluded from the service-worker precache;
- a runtime `enabled: false` switch moves the session to the official-planner handoff instead of pretending the provider returned zero matches.

The local throttle cannot guarantee the provider's **aggregate** one-request-per-second limit across every user of a public site. Public Nominatim is therefore an optional low-volume capability, not a scale guarantee. If usage or provider policy makes direct use unsuitable, disable it through runtime config; local Föli-stop search remains functional and arbitrary address/POI search degrades to the official Turku journey planner.

**Packaged Android**

Direct public-Nominatim search is disabled. The packaged WebView keeps address/POI text local and offers the official Turku journey planner. Android emulator E2E records outbound requests and fails if the tested flow contacts `nominatim.openstreetmap.org`.

---

## 6A. Client-only architecture invariant

Turku Departures remains a static, privacy-first PWA.

**Hard constraint: this product does not gain its own backend.**

Do not introduce:
- application servers;
- serverless proxy functions;
- private API gateways;
- databases;
- authentication/account infrastructure;
- server-side session state;
- hidden backend persistence.

All core product logic remains in the browser.

External providers may be called directly only when their usage model is safe for a public web frontend.

### Provider eligibility

A third-party provider is eligible only when:

- browser/CORS access is officially supported;
- any browser key/token is explicitly intended for public frontend use;
- the key can be restricted by HTTP origin/referrer or equivalent;
- the key grants only the minimum read-only capability required;
- quotas/costs are bounded and observable;
- the app continues to work in a reduced mode when the provider is unavailable.

A provider that requires a confidential secret is **not eligible** for this product.

### Build-time keys

Browser-safe provider keys may be supplied through build-time environment variables.

Important:
- treat them as public identifiers, not secrets;
- restrict production keys to the production origin;
- use a separate development key;
- never rely on obscurity of the bundled JavaScript.

### No-backend fallback rule

If a feature cannot be implemented reliably and safely under this client-only model:

1. preserve the existing local/Föli capability;
2. explain the limitation truthfully;
3. provide an external handoff when useful;
4. do **not** add a backend merely to make the feature possible.

### Routing implication

Journey planning architecture must therefore support:

- product-owned client-side direct-route logic using Föli/GTFS/realtime data;
- bounded client-side transfer logic where practical;
- browser-safe external journey APIs only when their public-client authentication model is appropriate;
- external route handoff as the final fallback.

The static PWA architecture is a product strength and a non-regression requirement.

---

## 7. Privacy contract

Adding address/POI search must not silently weaken the existing privacy model.

Requirements:

- do not persist addresses automatically;
- retain public-stop-only Home/Work/School as a privacy-preserving option;
- disclose which provider receives address/POI queries;
- send only the context required for search;
- keep GPS local where possible;
- do not add destination-history analytics by default;
- preserve no-account/no-ads/no-analytics positioning unless deliberately changed.

---

## 8. Origin model

Default origin:

> **My location**

Fallback when GPS is unavailable or denied:

> **From where?**

Allow:
- public stop;
- address/place;
- saved place.

GPS is a convenience, not a hard dependency.

---

## 9. Two-sided stop discovery

For address/POI journeys, evaluate transit stops on both ends.

### Origin side

Candidate boarding stops around the passenger.

### Destination side

Candidate alighting stops around the destination point.

The nearest stop on either side is not automatically the best.

A farther boarding stop can win because:
- bus leaves much earlier;
- ride is shorter;
- service is more frequent;
- direction is correct.

A farther destination stop can win because:
- transit arrival is much earlier;
- route is direct;
- final walk is still reasonable.

---

## 10. Progressive search expansion

Do not use a rigid “nearest 6/8/12 stops” cutoff.

Algorithm:

1. evaluate the normal nearby set;
2. if no good route exists, expand the origin radius/candidate set;
3. if destination-side stop coverage is weak, expand there too;
4. stop at a conservative hard limit;
5. keep the original nearby stops visible.

This prevents dense hubs from hiding a better stop slightly farther away.

---

## 11. Concrete-trip correctness

A line number is never sufficient to prove suitability.

For every transit leg, use the concrete trip and stop sequence.

A trip is compatible only if:
- boarding occurrence is known;
- destination/transfer occurrence is downstream;
- branch/short-turn topology actually reaches it;
- loop/repeated stop IDs resolve to the correct occurrence;
- pickup/drop-off restrictions allow the action;
- trip is not cancelled;
- boarding stop is usable.

Wrong-direction decisions must be trip-aware.

---

## 12. Catchability

A theoretically fast bus is useless if the passenger cannot realistically reach it.

Inputs:
- current distance to boarding stop;
- GPS accuracy;
- departure time;
- realtime confidence;
- conservative walking assumptions;
- safety buffer.

States:
- At stop
- Comfortable
- Likely catchable
- Tight
- Probably too late
- Unknown

Do not encourage running or unsafe crossings.

If precise walking routing is unavailable, do not display falsely precise walk times.

---

## 13. Earliest realistic destination arrival

The main ranking signal is:

> **When will the passenger realistically reach the destination?**

Not:
- closest stop;
- earliest departure alone;
- shortest ride alone.

For a catchable route:

```text
destination arrival =
  selected transit arrival
  + final walk/egress
```

For direct stop destinations, egress may be zero.

For privacy-first Home represented only by public stops:

> **Home stop in ~27 min**

For exact POI/address with reliable egress routing:

> **Arrive at Prisma ~22:08**

---

## 14. Realtime arrival evidence hierarchy

Prefer:

1. fresh destination-stop realtime prediction for the same trip;
2. fresh boarding realtime prediction + downstream scheduled timing;
3. schedule;
4. unknown.

Repeated identical provider observations must age naturally and must not remain “fresh” merely because another HTTP response arrived.

### Delay propagation

If only boarding live data is fresh:

```text
boardingDelay =
  liveBoardingDeparture - scheduledBoardingDeparture

estimatedDestinationArrival =
  scheduledDestinationArrival + boardingDelay
```

Present this as approximate.

---

## 15. Final walking / egress

For addresses and POIs, the transit stop is not the final destination.

Model:

```text
current position
→ origin access
→ transit leg(s)
→ destination stop
→ final walk
→ destination point
```

The final walk influences ranking.

Do not choose a stop merely because it is transit-fast if it leaves an unreasonable last-mile walk.

For large POIs, a geocoder point may not represent the correct entrance. Keep claims approximate and offer external final-walk directions.

---

## 16. Journey candidate model

```ts
type JourneyLeg =
  | {
      type: "walk";
      from: LocationRef;
      to: LocationRef;
      durationSec: number | null;
      distanceM: number | null;
      confidence: "high" | "medium" | "low";
    }
  | {
      type: "transit";
      tripRef: string;
      lineRef: string;
      boardStopId: string;
      exitStopId: string;
      departAt: number | null;
      arriveAt: number | null;
      liveState: "fresh" | "delayed" | "schedule" | "unknown";
    };

type JourneyOption = {
  id: string;
  legs: JourneyLeg[];
  arrivalAtDestination: number | null;
  totalDurationSec: number | null;
  walkingDistanceM: number | null;
  transfers: number;
  reliability: "high" | "medium" | "low";
  risks: JourneyRisk[];
};
```

---

## 17. Ranking rules

Do not rank with one opaque weighted score alone.

Use stages.

### Stage 1 — reject invalid

Remove:
- impossible direction;
- already-passed destination;
- cancelled trip;
- closed boarding stop;
- impossible transfer;
- uncatchable first leg;
- invalid topology.

### Stage 2 — dominance pruning

Hide an option from the primary set when another is:
- no slower;
- no more walking;
- no more transfers;
- equally or more reliable;

and strictly better in at least one dimension.

### Stage 3 — earliest arrival

Materially earlier realistic destination arrival wins.

### Stage 4 — near-optimal band

If arrival times are close, prefer:
1. less walking;
2. fewer transfers;
3. stronger realtime;
4. primary saved-place stop;
5. more frequent backup service;
6. fewer disruptions;
7. current stable recommendation.

### Stage 5 — diversity

Choose a small set of meaningfully different alternatives.

---

## 18. Route alternative labels

Recommended default set:

### ★ Fastest
Earliest robust destination arrival.

### Less walking
Meaningfully lower access/egress burden.

### Simpler
Fewer transfers / easier mental model.

### Easier to catch
More time to reach the first boarding stop or larger transfer margin.

### More reliable
Used when reliability difference is more important than small ETA differences.

Do not show labels when they do not represent a meaningful trade-off.

---

## 19. Route card hierarchy

Example:

> **★ FASTEST**  
> Arrive **22:08 · ~31 min**  
> Walk 280 m → **18** → walk 120 m  
> Live · no transfer

Alternative:

> **LESS WALKING**  
> Arrive **22:13 · ~36 min**  
> Walk 70 m → **2** → walk 60 m  
> ~5 min slower · 270 m less walking

Primary information:
- arrival clock time;
- total duration;
- line(s);
- transfers.

Secondary:
- walking;
- time until boarding;
- realtime/reliability.

Expanded:
- exact platforms;
- transfer details;
- destination-side stop;
- final walk;
- disruptions;
- why recommended.

---

## 20. Nearby Stops remains complete

Journey Assistant does not replace Nearby.

Without destination:

> **Stops near me**  
> Sorted by nearest

With destination:

> **Nearby stops for Prisma**  
> **Best for Prisma | Nearest**

Keep all candidate stops visible.

Statuses may include:
- ★ Best for Prisma
- ✓ Goes to Prisma
- ! Timing may be tight
- ? Schedule only
- ↔ Other direction
- — No direct service
- ⚠ Disrupted
- × Cancelled / closed

Never hide manual exploration.

---

## 21. Destination-aware departure board

After opening a stop with a destination active:

### For Prisma

Concrete trips that serve the selected destination path.

### Other departures

All other departures.

The selected journey's departure is pinned/highlighted.

Do not make the passenger re-identify the bus from a generic list.

---

## 22. Transfers

A transfer is valid only when the connection is realistically achievable.

Evaluate:

```text
incoming predicted arrival
+ platform-change / walking allowance
+ safety buffer
<= outgoing predicted departure
```

A 1-minute timetable connection is not automatically valid.

### Transfer risk states

- Comfortable
- Acceptable
- Tight
- Unlikely
- Broken

Tight transfers are downgraded.

Broken transfers are removed/replanned.

---

## 23. Transfer recovery

If realtime delay threatens a connection:

> **Your connection is becoming tight**

If no longer credible:

> **This connection is unlikely now**  
> Finding the best alternative…

If missed/cancelled:
- keep final destination;
- recompute from current/transfer location;
- offer best new options;
- do not restart destination search.

---

## 24. Journey Mode

Journey Mode orchestrates the trip.

It does **not** replace Ride Mode.

For a direct trip:

```text
Walk to boarding stop
→ wait
→ board concrete trip
→ Ride Mode
→ final walk
```

For transfer:

```text
Walk
→ Ride Mode leg 1
→ transfer walk/wait
→ Ride Mode leg 2
→ final walk
```

---

## 25. Ride Mode remains authoritative

For every bus leg, preserve the hardened existing behaviour:

- remaining stops based on actual route progress when reliable;
- ETA freshness/fallback rules;
- repeated-stale-snapshot protection;
- Get Ready;
- Press STOP;
- Get Off Now;
- route matching;
- loop/repeated-stop correctness;
- conservative degraded behaviour;
- browser/background limitations.

Journey planning must not duplicate or weaken those rules.

---

## 26. Active journey UI

At any moment, show one dominant action.

The current direct-journey implementation is deliberately fail-closed:

- selecting a route pins one concrete trip and boarding occurrence;
- no automatic route replacement after commitment;
- “At stop” is never inferred merely from opening a stop board;
- the passenger explicitly confirms **I’m at the stop**;
- opening another stop pauses selected-trip monitoring instead of creating a second poll;
- provider/feed failure degrades confidence; it does not imply departure;
- a cancellation alert enters recovery even if the SIRI departure row has already disappeared;
- a cached board from before route selection cannot change selected timing or undo recovery;
- the selected trip remains visible even if a saved line filter would otherwise hide its line;
- in recovery the failed concrete trip is excluded from recommendation cards, while the full Nearby list and departure board remain available;
- Ride Mode remains the sole authoritative onboard safety engine.

Examples:

> **Walk to Kauppatori D2**

> **Wait for bus 18**

> **Board 18 toward Runosmäki**

> **Get ready — your stop is coming up**

> **Press STOP**

> **Get off now**

> **Walk 120 m to D4**

> **Board bus 7**

> **Walk to Prisma**

Secondary overview:

> Walk → **18** → **7** → Walk

Expanded on demand.

---

## 27. Commitment and hysteresis

Before route selection:
- alternatives may reorder when materially better information appears.

After route selection:
- pin the chosen journey;
- do not silently switch because another option is 1–2 minutes better;
- show material alternatives as opt-in.

Example:

> **Faster route available**  
> Saves ~9 min  
> Switch

If the selected route becomes invalid, enter recovery state.

---

## 28. Degraded states

### GPS denied
Ask for origin manually.

### Poor GPS
Reduce confidence in access/catchability. Avoid false distance precision.

### Realtime unavailable
Use schedule with clear semantics.

### Timetable unavailable
Keep geographic Nearby but do not fabricate route suitability.

### Offline
Do not present stale “Best route” as current. Preserve saved places/recovery information.

### Destination outside service area
Offer external full-route planning.

### Search provider unavailable
Keep stop search and saved places functional.

Capability should degrade progressively rather than collapse.

---

## 29. Accessibility

Requirements:

- text + icon, never colour alone;
- 44 px touch targets;
- 200% text scaling;
- keyboard-operable search and route cards;
- screen-reader-friendly route summaries;
- no focus loss during async updates;
- no continuous ETA announcement spam;
- do not move a focused card under the user;
- recommendation status must not rely only on list position.

Example accessible route summary:

> “Fastest route to Prisma Itäharju. Arrive approximately 22:08. Bus 18. No transfer. Approximately 400 metres walking.”

---

## 30. Performance and request discipline

The routing UI must remain responsive in dense hubs.

Requirements:

- bounded progressive search;
- deduplicated trip lookups;
- GTFS/static cache reuse;
- realtime freshness kept separate from static topology;
- abort superseded searches;
- request-generation IDs for race safety;
- concurrency limits;
- progressive rendering;
- no “Best” claim before required evidence is available.

User intent always wins over late async results.

---

## 31. Search/routing state machine

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

Interrupt/recovery states:
- LOCATION_UNAVAILABLE
- REALTIME_DEGRADED
- TRIP_DEPARTED
- TRIP_CANCELLED
- STOP_CLOSED
- TRANSFER_AT_RISK
- TRANSFER_MISSED
- OFFLINE
- ROUTE_NO_LONGER_VIABLE

Destination remains stable through recovery.

---

## 32. Canonical ranking pipeline

For each search:

1. Resolve origin and destination.
2. Discover origin candidate stops.
3. Discover destination candidate stops.
4. Generate transit candidates.
5. Resolve concrete trip topology.
6. Reject wrong-direction / invalid / cancelled candidates.
7. Compute catchability.
8. Compute transit arrival at destination-side stop.
9. Add egress/final-walk cost.
10. Reject impossible transfers.
11. Compute reliability/risk.
12. Apply dominance pruning.
13. Rank by realistic destination arrival.
14. Apply near-optimal tie-breaking.
15. Apply stability/hysteresis.
16. Select 2–4 diverse alternatives.
17. Derive Nearby stop statuses from the same evidence.
18. Render passenger explanations.

No UI component should independently reproduce this logic.

---

## 33. Recommended module boundaries

### Search
- `DestinationSearch`
- `useDestinationSearch`
- `destinationProviderAdapter`

### Intent
- `useDestinationIntent`
- `useOriginIntent`

### Discovery
- `useOriginStops`
- `useDestinationStops`

### Transit topology
- `destinationTripFit.js`
- `tripSequence.js`

### Access / transfers
- `catchability.js`
- `transferFeasibility.js`

### Ranking
- `journeyRanking.js`
- `journeyDominance.js`
- `journeyDiversity.js`

### Orchestration
- `useJourneySearch`
- `useActiveJourney`

### UI
- `JourneySearch`
- `JourneyResults`
- `JourneyOptionCard`
- `JourneyOverview`
- `ActiveJourney`
- existing `NearbyStops`
- existing `RideMode`

Business logic remains testable outside React.

---

## 34. Route-generation strategy

The product remains **backendless**. Two client-side-compatible paths are allowed:

### A. Product-owned browser-side GTFS routing

Good control and no external routing dependency, but transfer routing is complex.

Requires correct:
- service calendars;
- footpaths;
- transfer margins;
- realtime propagation;
- bounded client-side dataset size;
- low-end-phone performance.

### B. Direct browser call to a permitted external journey-planning API + Turku Departures decision layer

The external service may generate valid journey candidates only when:
- direct browser use is permitted;
- CORS supports the PWA;
- no confidential credential is exposed;
- privacy/licensing/attribution requirements are satisfied;
- failure leaves stop search, Nearby and Ride Mode usable.

Turku Departures then adds:
- truth/freshness semantics;
- passenger-friendly ranking;
- route diversity;
- Nearby integration;
- Ride Mode leg handoff;
- disruption/recovery behaviour.

No product-owned proxy/backend is introduced for routing.

Do not ship unreliable partial transfer logic merely to avoid using a permitted client-side journey-planning service.

---

## 35. Acceptance criteria — destination/search

1. User can enter a stop, address or POI in one field.
2. Duplicate POI branches are disambiguated.
3. Saved places appear as one-tap destinations.
4. GPS is optional.
5. Search-provider failure does not break stop search.
6. Address/POI queries are not silently persisted.
7. Destination stays selected through route recovery.

---

## 36. Acceptance criteria — routing

8. Nearest stop does not automatically win.
9. Farther origin stop can win when destination arrival is materially earlier.
10. Farther destination stop can win when final arrival is better.
11. Wrong-direction same-line trip never counts as valid.
12. Branch and short-turn variants are evaluated independently.
13. Loop/repeated stop IDs use sequence, not ID alone.
14. Uncatchable first departures do not win.
15. Tight transfers are downgraded or rejected.
16. Cancelled trips are immediately removed from recommended routes.
17. Closed boarding stops are not recommended.
18. Repeated stale provider snapshots do not remain live.
19. Destination ETA exposes appropriate confidence.
20. Final-walk cost is included for address/POI routing.

---

## 37. Acceptance criteria — alternatives/UI

21. Results show at most a few meaningfully different options.
22. Dominated duplicates are hidden from the primary list.
23. Fastest / less-walking / simpler labels are only used when true.
24. Route cards expose arrival time first.
25. Full Nearby list remains available.
26. Nearby can switch between suitability and geographic sorting.
27. Destination context persists into the board.
28. Other departures remain visible.
29. Explicit route choice is not silently replaced.
30. Materially better alternatives may be suggested.

---

## 38. Acceptance criteria — active journey

31. Selected boarding stop/departure is clearly identified.
32. Walking-to-stop state is distinct from waiting state.
33. The passenger sees one dominant next action.
34. Direct trips hand into existing Ride Mode.
35. Remaining-stop count retains hardened route-progress logic.
36. ETA retains stale-snapshot protection.
37. Get Ready / Press STOP / Get Off Now remain unchanged in safety semantics.
38. Transfer journeys use Ride Mode independently per transit leg.
39. Missed transfers recompute without losing final destination.
40. Final walk is shown after the last transit leg.
41. Offline/degraded states never claim current route certainty falsely.

---

## 39. Test matrix

### Search
- exact/partial address;
- typo;
- POI exact match;
- duplicate POI branches;
- stop name;
- duplicate stop name;
- stop number;
- multilingual names;
- no result;
- provider failure.

### Origin/destination discovery
- dense city centre;
- wrong side of road;
- farther origin wins;
- farther destination stop wins;
- progressive search expansion;
- GPS inaccurate;
- GPS denied.

### Routing
- direct;
- direct but slower than farther stop;
- no direct;
- one transfer;
- tight transfer;
- missed transfer;
- branch;
- loop;
- short-turn;
- schedule-only;
- stale live;
- cancellation;
- stop closure;
- disruption;
- sparse/night service.

### Active journey
- walk to stop;
- bus departs before arrival;
- delay changes best route;
- boarding;
- Remaining decreases;
- ETA updates;
- Get Ready;
- Press STOP;
- Get Off Now;
- transfer get-off;
- second leg;
- final walk;
- recovery.

### Accessibility/platform
- Chromium;
- Firefox;
- mobile WebKit;
- Android;
- Finnish;
- English;
- keyboard;
- screen reader semantics;
- 200% text;
- offline reopen.

---

## 40. Delivery plan

### Phase 1 — canonical destination intent
- one destination field;
- saved places;
- stop destination;
- address/POI adapter;
- disambiguation;
- privacy rules.

### Phase 2 — destination-aware Nearby
- concrete trip fit;
- Best/Nearest;
- all nearby stops retained;
- wrong-direction/no-direct statuses;
- destination-aware board.

### Phase 3 — direct journey ranking
- origin and destination candidate stops;
- catchability;
- earliest arrival;
- final walk;
- 2–3 route alternatives;
- ranking hysteresis.

### Phase 4 — active direct journey
- selected journey;
- walk-to-stop;
- at-stop;
- selected departure;
- Ride Mode prefill;
- final walk.

### Phase 5 — transfers
- robust transfer journey source;
- transfer feasibility;
- leg orchestration;
- missed-connection recovery.

### Phase 6 — validation/polish
- city-centre field tests;
- POI/store tests;
- delay/cancellation tests;
- native Finnish review;
- accessibility re-audit;
- low-end Android profiling;
- threshold tuning.

---

## 41. Final UX contract

A passenger should be able to type:

> **Prisma**

choose the intended branch, and receive:

> **★ Fastest — arrive 22:08**  
> Walk 280 m → Bus 18 → walk 120 m
>
> **Less walking — arrive 22:13**  
> Walk 70 m → Bus 2 → walk 60 m
>
> **Easier to catch — arrive 22:12**  
> Leaves later, more time to reach the stop

Then, after choosing:

> **Walk to D2**

then:

> **Wait for bus 18**

then:

> **Board 18 toward …**

then the existing hardened Ride Mode:

> **9 stops · ~14 min**

> **GET READY**

> **PRESS STOP**

> **GET OFF NOW**

then:

> **Walk to Prisma**

The passenger should never have to manually combine stop geography, route direction, timetable, realtime, transfers and destination walking in their head.

**The app should do the reasoning; the UI should show the decision.**


---

## 42. Non-regression contract — preserve what already works

Journey Assistant is an extension of the current product, not permission to replace proven flows with a heavier planner UI.

The following current strengths are release gates. A phase must not ship if it materially regresses them.

### 42.1 Fast manual stop lookup remains first-class

The passenger can still:
- type a stop name or number directly;
- open that stop without creating a journey;
- inspect its normal departure board;
- use the app when they already know the network.

Destination search may share the visual surface, but it must not force journey planning on a user who only wants a stop.

### 42.2 Pure Nearby remains available

Without destination intent:

> **Stops near me**

continues to be a simple geographical tool.

With destination intent:
- all nearby candidates remain visible;
- **Nearest** remains one tap away;
- unsuitable stops are explained rather than hidden.

The new recommendation layer must add context without removing manual exploration.

### 42.3 Departure board remains useful by itself

A stop board continues to:
- show normal upcoming departures;
- preserve line filtering;
- distinguish live/scheduled/degraded data truthfully;
- expose disruptions;
- remain usable with no destination selected.

Destination-aware grouping is additive:
- **For destination**
- **Other departures**

It must not delete or obscure unrelated departures.

### 42.4 Favourites and recents remain fast paths

Existing favourites and recent stops remain available for passengers who use the same stops repeatedly.

Do not replace one-tap stop reopening with a mandatory destination workflow.

Recent destinations may be added separately; stop recents remain valid.

### 42.5 Saved-place recovery remains independent

Home/Work/School journey planning must not remove:
- public-stop-only saved places;
- approved backup stops;
- Show to driver;
- printable/saveable backup information;
- external route handoff.

Recovery tools must remain usable even when routing/geocoding is unavailable.

### 42.6 Privacy-first behaviour remains a product strength

The new feature must preserve:
- no account requirement;
- no ads;
- no analytics by default;
- no silent location history;
- public-stop-only saved places as an option;
- explicit external-provider boundaries.

A convenience feature must not silently convert the product into a persistent location-history service.

### 42.7 Ride Mode safety is protected

Journey Assistant may prefill Ride Mode but may not weaken or duplicate its evidence rules.

Existing:
- Remaining;
- ETA freshness/fallback;
- stale-snapshot protection;
- route matching;
- Get Ready;
- Press STOP;
- Get Off Now;
- missed-stop recovery;
- sound test;
- conservative GPS degradation

remain authoritative.

### 42.8 Progressive degradation remains intact

If one dependency fails, preserve the smallest useful capability:

- geocoder fails → stop search still works;
- journey router fails → Nearby and stop boards still work;
- realtime fails → schedule fallback remains;
- GPS denied → manual origin/stop selection remains;
- offline → saved/recovery information remains;
- Ride Mode GPS fails → existing non-GPS alert fallback remains.

Do not build a single all-or-nothing loading/failure state around the new planner.

### 42.9 Passenger control remains stronger than automation

The current product generally lets the passenger choose rather than silently redirects them. Keep that property.

Rules:
- recommendation is not automatic selection;
- selected journey is not silently replaced;
- manual search edits beat late async results;
- focused cards are not moved under the user;
- destination can be cleared in one action;
- direct stop exploration remains possible.

### 42.10 Mobile simplicity remains a release gate

The new intelligence must not turn the first phone viewport into a dashboard.

Default first screen should still expose only:
- destination search;
- saved quick actions where useful;
- current essential context.

Advanced details, alternative routes, Nearby diagnostics and explanations use progressive disclosure.

### 42.11 Accessibility remains release quality

Existing accessibility discipline stays mandatory:
- keyboard support;
- focus preservation;
- live-region restraint;
- text + icon status;
- touch target size;
- 200% text scaling;
- mobile overflow checks;
- automated axe gates.

New async ranking must not regress these behaviours.

### 42.12 Performance remains perceptually fast

A destination planner may perform substantially more work internally, but:
- stop search must not wait for route planning;
- Nearby geography should render before full enrichment;
- already-open departure boards must not block on destination computations;
- route results should render progressively;
- expensive work must be cancellable.

The current lightweight utility feel must be preserved.

---

## 43. Non-regression acceptance criteria

42. A passenger can still use Turku Departures entirely as a stop/departure app without selecting a destination.
43. Manual stop search remains no more than one submit/selection away from the board.
44. Pure nearest-stop mode remains available without route calculation.
45. Every nearby stop that the bounded nearby discovery found remains inspectable in destination mode.
46. Favourites and recent stops remain accessible as fast paths.
47. The normal departure board remains complete when destination filtering/grouping is active.
48. Existing line filtering continues to work.
49. Saved Home recovery/driver-card/backup flows remain available if geocoding or journey search fails.
50. Ride Mode's existing safety-state tests continue to pass unchanged or with strictly equivalent semantics.
51. Journey planning failure cannot prevent direct stop search, Nearby or an already-open board from working.
52. No new feature requires an account or persistent private address.
53. Explicit user choices beat late ranking/GPS/provider updates.
54. First-screen mobile information density is not higher than the current design without a demonstrated user benefit.
55. New routing requests do not delay the existing stop-board critical path.
56. Existing accessibility, PWA, offline and localization gates remain release blockers.
57. No feature introduces an application backend, proxy, server-side session or private database.
58. No confidential API credential is shipped in the browser bundle.
59. Address/POI provider failure leaves saved-place and public-stop destination flows operational.
60. The production build remains deployable as static files on GitHub Pages.

---

## 44. Known residual risks after implementation

Even a fully implemented Journey Assistant will retain real limitations.

### External search quality
A geocoder/POI provider can return:
- the wrong branch;
- stale business information;
- an imprecise building centroid;
- incomplete multilingual names.

Mitigation: disambiguation, provider abstraction, visible context, no silent branch choice.

### Walking uncertainty
Without a dedicated pedestrian-routing source, straight-line distance cannot model crossings, entrances, barriers or indoor paths.

Mitigation: conservative catchability, truthful distance copy, external walking directions.

### Realtime uncertainty
A transit prediction may change after the recommendation.

Mitigation: freshness semantics, hysteresis, selected-journey recovery, no false guarantees.

### Transfer fragility
Transfers amplify delay uncertainty and platform-change complexity.

Mitigation: conservative buffers, downgrade tight transfers, continuous reassessment, recovery.

### Provider disagreement
Journey planner, GTFS and live provider may disagree temporarily.

Mitigation: explicit source hierarchy, static topology as route truth where appropriate, freshness checks, withhold claims when evidence conflicts.

### Search/ranking complexity
More internal states create more race-condition and stale-result risks.

Mitigation: request generations, cancellation, pure ranking functions, exhaustive state tests.

### Performance
Dense hubs and many candidates can increase network/CPU cost.

Mitigation: progressive bounded expansion, caching, deduplication, concurrency limits.

### Privacy expansion
Address/POI search introduces an external query provider.

Mitigation: minimised requests, disclosure, no automatic address persistence, public-stop-only saved-place mode.

### Browser limitations
Background execution and notification behaviour remain browser/OS dependent.

Mitigation: keep current Ride Mode disclosure and future Web Push phase separate.

### Recommendation trust
A mathematically good route can feel wrong if the explanation is opaque.

Mitigation: short reason labels such as **18 min faster**, **less walking**, **no transfer**, and **more time to catch**.

---

## 45. Design quality target

The target is not maximum feature count.

The target is:

- **simple first action;**
- **strong decision support when requested;**
- **complete manual control underneath;**
- **truthful uncertainty;**
- **safe ride guidance;**
- **graceful failure.**

The final experience should feel simpler to the passenger than the current product even though the implementation is substantially more capable.


## P2 — Transfer journeys

**Implementation status (2026-10-01): bounded one-transfer foundation implemented in PR #116; live second-leg revalidation implemented in PR #118; automatic direct replacement recovery is implemented in PR #119.**

Direct options remain preferred. If none are found after progressive nearby expansion, Journey Assistant may search for one conservative transfer using bounded client-side Föli SIRI/GTFS lookups. Ride Mode remains authoritative on each boarded leg; premature leg-1 termination fails closed into recovery and can never create final-walk guidance.

Live second-leg revalidation contract:
- monitor only the already committed second trip at its concrete transfer boarding stop;
- use live-only SIRI for revalidation, never timetable fallback disguised as live evidence;
- require trip identity plus planned/origin-time occurrence anchors when available;
- age repeated provider snapshots naturally;
- fresh delay/early-running evidence may update the transfer margin;
- cancellation is strong failure evidence even if the departure row has disappeared;
- provider failure or stale data degrades to unknown and must not create false missed/unsafe recovery;
- disappearance becomes missed only after the planned departure grace window plus repeated successful absence;
- once live evidence has put the committed transfer into recovery, Ride Mode completion cannot silently restore or advance that old plan.

Automatic recovery contract:
- recovery search may start only after Ride Mode authoritatively establishes the passenger at the selected transfer occurrence, or after leg 2 itself later fails;
- keep the original destination selected; never ask the passenger to re-enter it;
- derive recovery origins from the authoritative transfer stop and a bounded set of nearby platforms using static stop geometry; do not invent a new GPS position;
- if the passenger explicitly confirmed a later boarding stop before leg-2 failure, that confirmed stop becomes the recovery anchor;
- exclude the failed concrete second run before ranking while still allowing another run of the same line;
- search only bounded direct replacements in this release;
- never auto-commit or silently switch to a replacement: the passenger must explicitly choose one;
- hidden-tab / resumed recovery options fail closed until a fresh provider response refreshes them;
- board-refresh metadata changes that do not alter recovery identity must not clear already verified replacement cards.

Out of scope for this release: replacement journeys requiring another transfer, 2+ transfer routing, arrive-by/leave-at controls and full pedestrian street routing.
