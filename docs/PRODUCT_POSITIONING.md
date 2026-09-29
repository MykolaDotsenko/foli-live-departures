# Product positioning

This document defines how Turku Departures should be explained to passengers, engineering reviewers and product reviewers without overstating what has been validated.

## Position in one sentence

**A privacy-first transit companion for Turku that turns uncertain public-transport data into clear passenger actions before and during a ride.**

The product is intentionally positioned as a **decision and reassurance layer**, not as a replacement for official journey planning or ticketing.

## Product context

### Competitive alternatives

A passenger may already have access to:

- an official timetable or departure board;
- a journey planner;
- a map application;
- local knowledge or help from another person;
- no dedicated tool after boarding.

Those alternatives are useful. The product opportunity is the gap between **having transport data** and **knowing what to do next when that data or the situation is uncertain**.

### Best-fit situations

The current product is most valuable when one or more of these are true:

- the route or area is unfamiliar;
- the passenger is travelling in a second language;
- realtime and timetable data disagree;
- a disruption changes the normal trip;
- the passenger is worried about missing the stop;
- connectivity is weak;
- a child, visitor, newcomer or family member needs a simple recovery path;
- a passenger wants a lightweight departure experience rather than full journey planning.

### Deliberate non-goals

The product is not currently trying to replace:

- official ticket sales;
- a full multimodal journey planner;
- guaranteed background navigation;
- emergency services;
- a persistent location-history product.

## Differentiated capabilities

| Capability | Why it matters |
| --- | --- |
| Conservative live/scheduled semantics | A passenger can see when information is realtime, planned, stale or unknown instead of receiving false certainty. |
| Get-off alert | Converts trip order, realtime and optional device location into a concrete passenger action. |
| Multiple evidence sources | No single provider or GPS signal is trusted beyond what it can safely prove. |
| Disruption relevance | Notices appear in the context where the passenger is making the decision. |
| Privacy-first saved places | Home, School and Work can be represented by public stop identities rather than street addresses. |
| Recovery tools | Backup stops, route handoff, driver card and printable backup remain useful when the normal flow fails. |
| Local-first PWA | The application shell and selected recovery information remain available when connectivity drops. |
| Automated accessibility gates | Accessibility behaviour is treated as release quality, not presentation polish. |

## Value map

### Before the ride

**Uncertainty:** Which stop? Is the bus actually coming? Is there a disruption?

**Product response:** stop discovery, live/scheduled distinction, route-relevant notices and saved stops.

**Desired outcome:** a passenger can make the next travel decision with less interpretation.

### During the ride

**Uncertainty:** How close am I? Is the timetable still useful? When should I press STOP?

**Product response:** a get-off alert using realtime, exact GTFS stop order and optional on-device route-matched GPS.

**Desired outcome:** the passenger can pay attention to the journey instead of repeatedly checking a map.

### When something fails

**Uncertainty:** The network is gone, the usual stop is unavailable, or I am not sure how to get home.

**Product response:** explicit degraded state, recent same-stop data, saved public stops, backups, driver card and route handoff.

**Desired outcome:** failure removes capability progressively instead of collapsing the whole experience.

## Evidence and hypotheses

### Demonstrated in the repository

- deployed installable PWA;
- extensive unit/integration regression coverage;
- browser E2E across Chromium, Firefox, WebKit and mobile configurations;
- real service-worker and offline-reopen QA;
- accessibility automation with axe and text-scaling tests;
- live provider-contract smoke testing;
- explicit handling of stale data, request races, GPS uncertainty and browser lifecycle behaviour.

### Not yet demonstrated by repository evidence alone

- recurring passenger adoption;
- retention;
- quantitative reduction in missed stops or travel anxiety;
- product-market fit;
- a commercial model;
- reliable locked-phone alerts without the documented Web Push phase;
- portability to another transport network without adapter work.

These are hypotheses or future validation areas and should not be presented as established traction.

## Messaging hierarchy

### 10-second version

**Know what leaves next. Know when to press STOP.**

### 60-second version

Turku Departures is a privacy-first Turku transit companion for the moments when a normal timetable is not enough. It distinguishes realtime from planned and stale information, brings relevant disruptions into the departure flow, and offers an evidence-based get-off alert that combines Föli realtime, exact GTFS trip order and optional on-device GPS. It also keeps useful recovery tools available when connectivity or the normal travel flow fails.

### Technical-review version

The project is an exercise in product engineering around uncertain external data: provider-boundary normalization, bounded caches, request cancellation, stale-data isolation, GTFS dataset pinning, geospatial evidence, an asymmetric ride state machine, local-first PWA behaviour, accessibility gates and cross-browser regression testing.

## Audience-specific emphasis

### Passenger

Lead with the outcome:

- what leaves next;
- what changed;
- when to press STOP;
- how to get home if the normal flow fails.

Avoid API terminology unless it explains trust.

### Engineering reviewer

Lead with the product problem, then evidence:

- real external APIs and failure modes;
- state-machine and geospatial reasoning;
- cross-browser and offline behaviour;
- automated quality gates;
- privacy and accessibility constraints.

Avoid presenting test count alone as the product value.

### Product reviewer

Lead with:

- the underserved passenger problem;
- the alternatives and the gap between transport data and passenger action;
- differentiated capabilities;
- what has been technically validated;
- what still requires user and market validation;
- the expansion path without pretending that expansion is already proven.

## Communication guardrails

Do:

- keep the passenger as the protagonist;
- use concrete scenarios;
- state the competitive context;
- connect capabilities to passenger value;
- use engineering evidence as credibility;
- document limits before they become trust problems.

Do not:

- claim traction without usage data;
- claim a commercial market without validation;
- describe browser notifications as guaranteed background alerts;
- imply official Föli affiliation;
- equate high test coverage with product-market fit;
- use generic claims such as "revolutionary", "AI-powered" or "best-in-class" without evidence.

## Strategic expansion path

A plausible sequence is:

1. validate the get-off alert in real rides across representative routes and devices;
2. measure recurring use and identify the user segments that value the product most;
3. validate the locked-phone Web Push phase if background reliability is a real user need;
4. add Swedish and deepen accessibility validation;
5. isolate provider adapters and test portability to a second compatible transit network;
6. only then evaluate whether a commercial, civic-tech, white-label or public-service model is justified.

## Framework influences

The positioning approach intentionally borrows a few durable ideas from established product and communication frameworks:

- **Obviously Awesome — April Dunford:** start with alternatives, differentiated capabilities, value, best-fit users and market context.
- **Building a StoryBrand — Donald Miller:** keep the user as the protagonist and the product as the guide.
- **Made to Stick — Chip Heath & Dan Heath:** keep the core message simple, concrete and credible.
- **The Brand Gap — Marty Neumeier:** make the promise and the lived product experience reinforce the same idea.
- **Designing Brand Identity — Alina Wheeler:** keep naming, identity, launch surfaces and governance consistent across touchpoints.
- **Don't Make Me Think — Steve Krug:** prefer obvious labels and low-friction actions over cleverness.
- **INSPIRED — Marty Cagan:** distinguish technical feasibility from customer value, usability and business viability.

These frameworks inform the communication structure; they are not substitutes for direct passenger research or market validation.
