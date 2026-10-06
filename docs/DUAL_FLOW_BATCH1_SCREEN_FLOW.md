# Batch 1 screen-flow specification — Dual-entry Home + standalone Stop Radar

**Status:** implementation-ready UX specification  
**Product:** Turku Departures  
**Date:** 2026-10-06  
**Parent architecture:** [Dual-flow UX architecture](DUAL_FLOW_UX_ARCHITECTURE.md)  
**Canonical journey contract:** [Journey Assistant](JOURNEY_ASSISTANT_SPEC.md)  
**Radar contract:** [Stop Radar / Compass](STOP_RADAR_SPEC.md)  
**Scope:** Batch 1 only — idle/Home information architecture, destination entry, stop entry, quick choices, Near you, standalone Radar, return/focus behaviour and regression gates  
**Out of scope:** journey-result redesign, selected-journey phases, journey-driven Radar, boarding handoff, RideSetup simplification

---

## 1. Batch 1 objective

Change the first-use and idle Home experience from a stop-led page with a planner below it into a **dual-entry Home** where both primary passenger intents are immediately obvious:

> **Where are you going?**

and

> **Find a stop**

At the same time, preserve the current fast stop workflow and preserve **Stop Radar as an independent capability**.

Batch 1 is intentionally an information-architecture and presentation change.

It should not rewrite:

- routing algorithms;
- destination-aware ranking;
- transfer search;
- Ride Mode;
- trip matching;
- Radar geometry/sensors;
- stop auto-selection safety rules.

The safest implementation is to reuse current components and change **ordering, grouping, density, labels and transition focus**.

---

## 2. UX basis

The specification follows these interaction principles.

### Progressive disclosure

Show common actions immediately; defer secondary/advanced choices until the passenger expresses the related intent.

Applied here:

- destination search is visible;
- stop search is visible;
- standalone Radar is visible;
- favourite/recent shortcuts are visible when available;
- journey time/preference controls are not visually dominant before a destination is selected;
- detailed nearby-stop comparisons do not occupy the idle first viewport.

Reference:
- Nielsen Norman Group, “Progressive Disclosure”: https://www.nngroup.com/articles/progressive-disclosure/

### Action labels describe the passenger’s task

Use concrete labels:

- **Where are you going?**
- **Find a stop**
- **Find nearest stop**
- **Open stop radar**

Avoid architecture labels:

- Planner
- Journey mode
- Stop mode
- Navigation mode

Reference:
- GOV.UK Design System recommends primary actions whose text is consistent with the action users are being asked to take: https://design-system.service.gov.uk/patterns/start-using-a-service/

### Logical focus/DOM order

Keyboard and screen-reader focus order must follow the same meaningful order presented visually.

Reference:
- WCAG 2.2 Understanding 2.4.3 Focus Order: https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html

### Comfortable controls

Interactive targets must meet WCAG 2.2 minimum target-size requirements and should continue the product’s stronger practical touch-target convention.

Reference:
- WCAG 2.2 Understanding 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

---

## 3. Batch 1 product rule

The Home page contains **three immediately discoverable capabilities**, ordered by passenger intent:

1. **Destination**
2. **Known stop**
3. **Physical nearby-stop orientation**

They are not three modes.

They are three starting actions that feed existing product state.

Conceptually:

```text
HOME
├── Where are you going?
│   └── existing JourneySearch destination selection
│       └── hand off to existing destination flow
│
├── Find a stop
│   └── existing BusStopForm
│       └── existing full departure board
│
└── Near you
    ├── Find nearest stop
    │   └── existing safe nearest-stop behaviour
    └── Open stop radar
        └── standalone StopRadar
            ├── change target locally
            └── Open target stop → full departure board
```

---

## 4. Screen map

### H0 — Idle Home

Conditions:

- no active Ride Mode;
- no final walk;
- no selected/open stop;
- no committed selected journey;
- no currently open Radar.

Primary purpose:

> Let the passenger immediately choose between destination-first, stop-first and nearby physical orientation.

Transitions:

- destination result chosen → **H1 Destination selected / existing planner continuation**
- stop chosen → **S1 Stop board**
- Find nearest stop → current Nearby location result behaviour
- Open stop radar → **R1 Standalone Radar**
- quick destination → H1
- quick stop → S1

### H1 — Destination selected

Batch 1 does not redesign journey results.

Batch 1 responsibility:

- preserve the destination;
- focus the appropriate destination/origin continuation heading;
- remove the idle visual competition;
- hand into the existing destination-aware path.

This is the boundary into later batches.

### S1 — Stop board

Use the existing stop-first experience.

Batch 1 must not make the user pass through destination UI to get here.

Transitions remain:

- board actions;
- manual Get-off alert;
- compact destination entry;
- Nearby;
- standalone Radar where currently available.

### N1 — Nearby result state

Uses existing `NearbyStops` behaviour.

No destination:

- nearest-stop list;
- safe auto-selection rules;
- explicit uncertainty;
- Radar remains available.

Batch 1 may reduce visual weight on idle Home before a location has been requested but must not remove this capability.

### R1 — Standalone Radar

No destination or selected journey is required.

Purpose:

> Help the passenger identify and physically reach a nearby stop.

Transitions:

- Close → return to launch surface/control
- change target → remain R1
- Open target stop → S1
- location permission denied → Radar error state; rest of app remains usable

---

## 5. Mobile Home layout

### Recommended 320–430 px structure

```text
┌──────────────────────────────┐
│ Turku Departures        🌐 ◐ │
├──────────────────────────────┤
│                              │
│ Where are you going?         │
│ ┌──────────────────────────┐ │
│ │ 🔍 Address, place or stop│ │
│ └──────────────────────────┘ │
│ [ Home ] [ Work ] [ Recent ] │
│                              │
│ ──────────────────────────── │
│                              │
│ Find a stop                  │
│ ┌──────────────────────────┐ │
│ │ 🚏 Stop name or number   │ │
│ └──────────────────────────┘ │
│ [ Favourite ] [ Recent ]     │
│                              │
│ Near you                     │
│ Find a nearby stop or use    │
│ the radar to orient yourself.│
│ [ ⌖ Find nearest stop ]      │
│ [ ◉ Open stop radar ]        │
│                              │
│ supporting/recovery content  │
└──────────────────────────────┘
```

This is a hierarchy sketch, not a pixel-perfect visual design.

---

## 6. First viewport contract

On a typical phone viewport, the user should understand **both main jobs** without needing to discover hidden navigation.

Priority target:

- destination heading/input visible;
- stop heading/input visible or its heading plus enough of the control to make the second path obvious;
- Near you may begin below the fold on smaller phones, but must be easy to reach and must not be buried behind unrelated content.

Do not let these push both primary intents below the fold on first visit:

- large install education;
- HomeRecovery card;
- service information;
- advanced routing settings;
- explanatory marketing copy.

If install education remains, it must stay compact enough not to dominate the primary transport actions.

---

## 7. H0 — Destination entry specification

### Heading

> **Where are you going?**

This is the primary novice/unfamiliar-trip question.

### Input placeholder

Recommended:

> **Address, place or stop**

Do not use:

> Plan a journey

because that describes the app feature, not the passenger goal.

### Search capability

Reuse existing `JourneySearch` search intelligence:

- stops;
- saved places;
- OSM POIs;
- OSM addresses/streets;
- local-first/offline behaviour;
- existing provider fallback rules.

### Quick destinations

Show only quick actions that exist and are useful.

Preferred order:

1. Home
2. Work / School if configured
3. most recent useful destinations

Do not render empty placeholders for unset saved places.

### Advanced controls

On idle H0, do **not** make these visually equal to the destination field:

- Leave now / Leave at / Arrive by
- Balanced
- Fewer transfers
- Less walking
- More transfer time

Preferred Batch 1 behaviour:

- default to the current normal planning defaults;
- expose a clear secondary **Trip options** control;
- expand settings in place only when requested.

If refactoring this safely is too large for Batch 1, keep current controls but visually demote them; do not delay the Home reorder solely to build the disclosure component.

### Destination selection transition

After a destination is selected:

- collapse the large H0 destination search into existing compact destination context where appropriate;
- do not keep both the idle search and selected destination panel mounted as competing surfaces;
- move focus to the next meaningful task, not back to page start.

---

## 8. H0 — Stop entry specification

### Heading

> **Find a stop**

### Input

Reuse `BusStopForm`.

Recommended placeholder semantics:

> **Stop name or number**

### Behaviour to preserve exactly

- fuzzy search;
- name/number lookup;
- keyboard combobox interaction;
- Enter/Escape/arrow semantics;
- nearest-stop button safety rules;
- no unsafe auto-selection under:
  - poor location accuracy;
  - ambiguous nearest choices;
  - large distance;
  - outside-network evidence.

### Quick stops

Reuse `QuickStops` but associate it visually with **Find a stop** rather than presenting it as an unrelated Home module.

Preferred grouping:

> **Favourite and recent stops**

Avoid duplicated stop shortcuts in multiple Home areas.

### Stop selection transition

When a stop is selected:

- open the board immediately;
- preserve existing URL canonicalisation;
- move focus using existing board-heading behaviour;
- destination is not required.

This is a hard performance/UX contract.

---

## 9. H0 — Near you specification

### Purpose

Near you is neither the destination planner nor the stop search.

It answers:

> “What transit stops are physically around me?”

and provides standalone physical orientation.

### Idle presentation

Before location has been requested:

> **Near you**

Supporting sentence:

> **Find a nearby stop or use the radar to orient yourself.**

Actions:

- **Find nearest stop**
- **Open stop radar**

Both are explicit location-related actions.

Do not request location when the section becomes visible.

### After Find nearest stop

Reuse existing `NearbyStops` behaviour.

Without a destination:

- sort by nearest;
- preserve ambiguity/accuracy messaging;
- preserve safe automatic stop opening only under current conservative rules;
- keep all useful nearby options visible.

### Relationship to Radar

**Find nearest stop** answers a data/list question.

**Open stop radar** answers a physical orientation question.

Do not merge them into one ambiguous button.

---

## 10. Standalone Radar flow

### 10.1 Entry

From H0/Near you:

> **Open stop radar**

This is explicit enough to request location/compass permissions under the existing Radar contract.

### 10.2 Initial state

If location permission is pending:

```text
Stop radar
Finding your position…
```

Compass permission follows the current explicit-interaction rules.

### 10.3 Initial target

With no destination and no committed journey:

1. currently active/open stop if one exists and is appropriate;
2. otherwise nearest suitable stop after the first live fix.

Do not invent a “best for journey” target when no journey exists.

### 10.4 Radar visual priority

Primary visual hierarchy:

1. target stop identity;
2. distance/direction to target;
3. passenger position + GPS uncertainty;
4. target marker/arrow;
5. surrounding stop markers;
6. street/building context;
7. scale/mode metadata.

Do not let decorative spatial context compete with the target.

### 10.5 Target switching

Passenger can select another stop marker/chip.

Result:

- update Radar target;
- recompute scale/direction;
- do not open the board;
- do not alter destination/journey state.

### 10.6 Open target stop

Explicit action:

> **Open target stop**

Result:

- close Radar;
- open target stop board;
- preserve existing stop URL semantics;
- focus board heading.

### 10.7 Close

Close action:

- stop live Radar sensor work according to current contract;
- return focus to **Open stop radar** or the actual launching control;
- keep a useful final fix for existing Nearby seeding only as currently documented;
- do not persist GPS/compass/target.

### 10.8 Permission denied

Do not turn the page into an error page.

Radar surface says location is unavailable.

The passenger can still:

- Find a stop;
- choose favourite/recent stop;
- choose destination;
- use the rest of the app.

### 10.9 Poor accuracy

Use existing uncertainty semantics.

Do not claim:

> You are at the stop

unless the established distance + accuracy thresholds are satisfied.

### 10.10 No compass

Fallback order remains:

1. valid compass;
2. direction of travel;
3. north-up bearing guidance.

The feature remains useful without compass access.

---

## 11. Desktop/wide layout

Do not design a second information architecture for desktop.

The semantic order remains:

1. Destination
2. Find a stop
3. Near you

Wide layouts may place destination and stop entry surfaces side by side **only if**:

- each remains visually distinct;
- DOM/focus order remains logical;
- neither looks like a selected mode/tab;
- Near you remains secondary below or beside them without becoming equal visual noise.

Recommended wide pattern:

```text
┌──────────────────────┬──────────────────────┐
│ Where are you going? │ Find a stop          │
│ destination search   │ stop search          │
│ quick destinations   │ favourite/recents    │
└──────────────────────┴──────────────────────┘

Near you
[ Find nearest stop ] [ Open stop radar ]
```

On mobile, stack them.

---

## 12. Visual hierarchy rules

### H0 priority tiers

**Tier 1**
- destination search;
- stop search.

**Tier 2**
- quick saved/recent destination/stop actions;
- Near you actions.

**Tier 3**
- installation help;
- generic recovery/support content;
- explanatory copy.

Do not use multiple competing filled/high-emphasis CTA buttons in Tier 1.

Inputs themselves are the primary affordances.

### CTA hierarchy

Within Near you:

- Find nearest stop and Open Radar can share similar secondary prominence;
- do not style one as destructive or misleadingly “primary for the whole page”.

Within a future selected journey, the CTA hierarchy changes — but that belongs to later batches.

---

## 13. Copy rules

Copy should be:

- task-oriented;
- concrete;
- short;
- translatable;
- safe under uncertainty.

Recommended English source strings for Batch 1:

- Where are you going?
- Address, place or stop
- Find a stop
- Stop name or number
- Near you
- Find a nearby stop or use the radar to orient yourself.
- Find nearest stop
- Open stop radar
- Close stop radar
- Open target stop

Avoid:

- Smart journey
- Intelligent route
- Optimal navigation
- Best stop

unless evidence actually supports the specific claim.

Localization review is required for Finnish, Swedish and Ukrainian, not literal string substitution only.

---

## 14. Focus and announcement contract

### Page load H0

Do not autofocus a search input.

Reasons:

- avoids unexpectedly opening the mobile keyboard;
- gives screen-reader users the page heading/context first;
- avoids biasing the user toward one flow through forced focus.

### Destination search interaction

When suggestions open:

- preserve existing combobox semantics;
- keyboard order remains inside the current interaction.

On destination selection:

- focus the next meaningful destination/origin surface.

### Stop selection

Use existing board focus behaviour.

### Radar open

Focus:

- Radar heading after stable mount.

Do not focus a rapidly changing distance label.

### Radar close

Return focus to the control that opened Radar.

### Open target stop

Focus the board heading, not the vanished Radar button.

### Dynamic status

Use polite status for:

- location found;
- checking route/nearby data;
- meaningful Radar distance/direction changes according to existing throttle.

Use alert semantics only for errors/urgent states.

Do not announce every GPS fix.

---

## 15. Target-size and touch ergonomics

WCAG 2.2 requires at least 24×24 CSS px targets or sufficient spacing under the criterion’s exceptions.

For this product, continue a stronger practical mobile target:

> **Aim for ~44 CSS px minimum interactive height for primary controls.**

Particularly:

- destination input;
- stop input;
- quick chips;
- Find nearest stop;
- Open Radar;
- Radar stop chips;
- Close Radar;
- Open target stop.

Do not meet accessibility only through tiny icons with padding that is visually unclear.

---

## 16. Loading rules

### Destination assets loading

The destination field should remain operable for stop/saved-place search while heavier local address/POI assets lazy-load.

Do not block the full Home.

### Stop catalogue loading

Use existing truthful state.

### Radar chunk loading

Keep the existing lazy-loaded Radar boundary.

If the Radar chunk fails:

- show Radar-specific error;
- never replace the whole app;
- keep all non-Radar Home flows usable.

---

## 17. Empty-state rules

### No saved destinations

Do not render disabled Home/Work placeholders.

### No favourite/recent stops

Do not create an empty card consuming first-viewport space.

The stop search remains enough.

### Location unsupported

Near you explains that live location/Radar is unavailable.

Stop search and destination search remain fully visible.

### Stop coordinates unavailable

Keep normal stop search.

Radar/nearest actions report the limited capability without blocking Home.

---

## 18. State-transition table

| From | User action | Result | Must preserve | Focus |
| --- | --- | --- | --- | --- |
| H0 | choose destination | H1/existing destination flow | stop context if legitimately present | destination/origin continuation |
| H0 | choose stop | S1 board | no destination required | board heading |
| H0 | Find nearest stop | N1 | search edits safety | existing Nearby result/focus behaviour |
| H0 | Open Radar | R1 | Home state | Radar heading |
| R1 | select another marker | R1 | all app state | selected Radar target control/context |
| R1 | Close | H0/N1 | prior Home/Nearby context | launch button |
| R1 | Open target stop | S1 | target stop | board heading |
| S1 | Back | prior history state | browser URL semantics | logical restored location |
| H1 | clear destination | H0 or stop-first if stop exists | open stop when applicable | relevant search/heading |

---

## 19. Component mapping

### `App.jsx`

Batch 1 changes:

- idle-state ordering;
- grouping;
- conditional Home supporting content;
- focus wiring if component order changes.

Do not add `homeMode`.

### `JourneySearch.jsx`

Batch 1 changes may include:

- Home presentation variant;
- compact advanced controls;
- quick destinations presentation.

Do not duplicate search engine state.

### `BusStopForm.jsx`

Prefer no behavioural changes.

Presentation only if needed.

### `QuickStops.jsx`

Group under Find a stop.

Do not render redundant empty section.

### `NearbyStops.jsx`

Batch 1 changes:

- clearer idle Near you presentation;
- keep standalone Radar visible;
- avoid destination-specific UI before destination exists;
- preserve all current location/Radar logic.

### `StopRadar.jsx`

No sensor/geometry rewrite.

Only presentation changes required by the new launch context, if any.

### `App.css` and component CSS

Primary layout work lives here.

Avoid CSS reordering that makes visual order diverge from DOM/focus order.

---

## 20. Explicit non-goals for Batch 1

Do not expand scope into:

- new routing algorithms;
- changing transfer search limits;
- automatic boarding;
- journey-specific Radar target;
- new ActiveJourney phases;
- RideSetup redesign;
- final-walk redesign;
- account/profile;
- analytics;
- backend;
- map SDK;
- new external location provider.

If one of those is required merely to make Batch 1 work, the design should be reconsidered.

---

## 21. Regression requirements

All current strong stop-first behaviour must remain.

### Stop-first golden path

```text
Open app
→ Find a stop
→ type D2 / stop name
→ select
→ board opens
→ next departures visible
```

No extra mandatory click.

### Manual alert golden path

```text
Open stop
→ choose departure
→ Get-off alert
→ choose downstream stop
→ Start
```

Unchanged.

### Standalone Radar golden path

```text
Open app
→ Near you
→ Open stop radar
→ target nearest stop
→ switch target
→ Open target stop
→ board
```

No destination required.

### Destination entry golden path

```text
Open app
→ Where are you going?
→ choose destination
→ existing destination/origin flow
```

No need to first select a stop.

---

## 22. Automated acceptance tests

Add or update tests around the changed hierarchy.

### Unit/component

- idle Home renders destination before stop in meaningful DOM order;
- both entry headings are present;
- destination selection calls existing handlers;
- stop selection calls existing stop flow;
- QuickStops remain available when populated;
- empty quick groups do not leave unnecessary blank structure;
- Radar button available without destination;
- Radar target switching does not change active stop until Open target stop;
- Radar close restores focus;
- Radar chunk failure is locally contained.

### E2E mobile

At 320 px and representative phone widths:

1. H0 can identify both main paths;
2. stop user can reach board without destination interaction;
3. destination user can start from destination search;
4. standalone Radar can open with no destination;
5. Radar can switch target;
6. Radar Open target stop reaches board;
7. denied geolocation leaves stop/destination search usable;
8. mobile keyboard/focus does not jump unexpectedly.

### Accessibility

- axe on H0;
- axe on open Radar;
- keyboard-only H0;
- keyboard-only Radar target chooser;
- 200% text scaling;
- 320 CSS px reflow;
- logical heading order;
- logical focus order;
- no unintended autofocus.

---

## 23. Manual UX validation script

Before calling Batch 1 done, run these on real or realistic mobile devices.

### Scenario A — commuter

Prompt:

> “You know your stop. Find D2 and check the next bus.”

Observe:

- do they immediately see Find a stop?
- do they accidentally enter destination search?
- is board access as fast as before?

Success:

- no explanation needed;
- no extra planning step.

### Scenario B — visitor

Prompt:

> “You want to go to Prisma but do not know which stop to use.”

Observe:

- is Where are you going? clearly the natural first action?
- does Find a stop distract them?
- do they understand that they can search a place/address?

### Scenario C — orientation only

Prompt:

> “You are outside and want to find the correct nearby bus stop, but you are not planning a destination.”

Observe:

- can they discover Radar?
- do they understand Radar is about finding a stop?
- can they change target?
- can they open the target stop board?

### Scenario D — denied location

Deny permission.

Observe:

- does the user remain in control?
- are destination and stop flows still obvious?
- is the error local rather than catastrophic?

---

## 24. Batch 1 done definition

Batch 1 is done only when all of these are true:

### Information architecture

- destination and stop entry are both obvious on idle Home;
- neither is hidden in tabs/menu;
- no global mode switch exists;
- Near you/Radar is discoverable without dominating Home.

### Stop-first

- board access remains direct;
- no destination required;
- all existing board strengths remain.

### Destination-first

- destination may be the first passenger action;
- existing search intelligence remains;
- next flow receives destination cleanly.

### Radar

- can open with no destination;
- can choose/switch target;
- can open target stop;
- closing restores context;
- journey state is not required.

### Accessibility

- DOM/focus order is meaningful;
- no autofocus surprise;
- touch targets remain practical;
- 320 px and 200% text work;
- screen-reader announcements remain controlled.

### Engineering

- no backend;
- no new provider dependency;
- no duplicated destination/stop engine;
- no routing rewrite;
- test suite and existing release gates remain green.

---

## 25. Handoff to Batch 2

Batch 1 intentionally stops after the passenger expresses an entry intent.

Batch 2 begins at:

> destination selected, but origin must be resolved.

Batch 2 should implement:

- explicit **Use my location**;
- **Choose a starting stop**;
- current open stop as origin;
- clear privacy semantics;
- no silent GPS prompt.

This separation keeps Batch 1 low-risk and independently releasable.
