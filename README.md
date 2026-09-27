# Föli Live Departures

![CI](https://github.com/MykolaDotsenko/foli-live-departures/actions/workflows/ci.yml/badge.svg)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline--ready-5A0FC8)
![Accessibility](https://img.shields.io/badge/accessibility-WCAG%20tested-0A7F5A)
![License](https://img.shields.io/badge/license-MIT-blue)

## Public transport is easy when everything goes right. This app is built for when it does not.

**Föli Live Departures is a privacy-first transit companion for Turku that helps passengers answer three practical questions:**

**What leaves next? · Is anything disrupting my trip? · When do I need to press STOP?**

It combines live Föli data, planned GTFS service, disruption information and on-device location signals into one installable PWA — with explicit fallbacks for stale data, weak connectivity, unfamiliar routes and browser limitations.

**Try the live app:** https://mykoladotsenko.github.io/foli-live-departures/

> Independent project using Föli open data. Not made by or affiliated with Föli or the City of Turku.

<p>
  <a href="#the-problem"><strong>Problem</strong></a>
  ·
  <a href="#the-product"><strong>Product</strong></a>
  ·
  <a href="#why-it-is-different"><strong>Differentiation</strong></a>
  ·
  <a href="#engineering-depth"><strong>Engineering</strong></a>
  ·
  <a href="#quality-evidence"><strong>Quality</strong></a>
  ·
  <a href="#suomeksi"><strong>Suomeksi</strong></a>
</p>

<p align="center">
  <img
    src="docs/assets/foli-mobile.png"
    alt="A phone showing Kauppatori stop with live and scheduled departures, delay information and a service disruption"
    width="260"
  >
  &nbsp;
  <img
    src="docs/assets/foli-ride-now.png"
    alt="The get-off alert telling the passenger that this is their stop"
    width="260"
  >
  &nbsp;
  <img
    src="docs/assets/foli-mobile-fi.png"
    alt="The same departure experience in Finnish"
    width="260"
  >
</p>

---

<a id="the-problem"></a>

## The problem

A timetable app solves the happy path. Real passengers often need help with the failure cases around it.

A useful transit companion should still make sense when:

- the passenger does not know the area or the stop names;
- the bus is delayed and planned time no longer reflects reality;
- realtime data becomes stale or temporarily disappears;
- a detour or cancellation affects the trip;
- the passenger is worried about missing the stop and keeps checking a map;
- GPS is too inaccurate to make a confident decision;
- the closest stop is not necessarily the stop for the correct direction;
- connectivity drops;
- a child, newcomer, visitor or tired passenger needs a simple way to get home;
- the phone language, bus-sign language and local language are not the same.

The product is designed around those moments of uncertainty rather than treating them as edge cases.

## Product thesis

**Transit software should reduce passenger uncertainty, not merely display transport data.**

Föli Live Departures therefore turns raw public-transport signals into conservative, passenger-facing decisions:

| Passenger question | Product response |
| --- | --- |
| What leaves next? | Live + scheduled departure board with clear freshness semantics |
| Can I trust this countdown? | Monitored realtime is distinguished from timetable data and stale data |
| Is my trip disrupted? | Stop- and route-relevant service updates appear with the affected departures |
| Where is the right stop? | Search, nearest-stop discovery, uncertainty checks and alternatives |
| When should I press STOP? | Get-off Alert combines trip order, realtime and optional on-device GPS |
| What if realtime disappears? | Timetable fallback is used without pretending it is live |
| What if the network disappears? | Saved places, recovery tools and recent board data remain available offline |
| How do I get home? | Home stop, route handoff, backup stops, driver card and printable backup |
| What data do I have to give the app? | No account; saved places are public stop identities, not private addresses |

---

<a id="the-product"></a>

## The product

### 1. Live departures that degrade honestly

The board prefers Föli realtime estimates when the provider is actively monitoring a trip and falls back to planned GTFS service when necessary.

It is deliberately conservative:

- stale realtime is never silently presented as fresh;
- a failed refresh can keep useful same-stop information visible without relabelling it as live;
- cached data from one stop is never shown under another;
- cancelled trips are marked instead of continuing to count down;
- a missing timetable check is reported as unknown rather than as "no buses".

The goal is not to look confident. The goal is to be trustworthy.

### 2. Get-off Alert: ride without constantly watching a map

Choose a concrete departure, select the stop where you want to get off and keep the ride screen open.

The alert can tell the passenger when to:

- **get ready;**
- **press STOP;**
- **get off now;**
- recover if the target stop appears to have been missed.

Ride Mode combines three independent evidence sources:

1. **Föli SIRI realtime** at the target and previous stop;
2. **GTFS trip order and timetable** as a degraded fallback;
3. **optional on-device GPS map-matched to the exact GTFS trip shape.**

This matters because no single signal is reliable enough in every situation.

Weak GPS is ignored. Off-route GPS is not treated as proof. Timetable-only evidence is never allowed to claim **"get off now"**.

Exact GTFS stop sequence is preserved, including loop routes where the same stop can appear more than once.

### 3. Disruption-aware travel

Service information is not a separate news screen that the passenger has to remember to check.

Relevant notices are connected to the current stop and routes so that detours, cancellations and emergency messages can appear where the passenger is already making a travel decision.

### 4. Privacy-first Home, School and Work

Saved places use **public stop identities instead of a private street address**.

A place can contain a main stop and approved backups. One-time location may help discover nearby stops, but the exact setup position is discarded.

A shared place also contains public stop information only and requires explicit confirmation before replacing local data.

### 5. Recovery, not just navigation

For a passenger who is lost, unsure or simply wants the shortest path back to familiar territory, **Get me Home** provides several independent recovery options:

- public-transit handoff to the saved Home stop;
- reopen Home departures inside the app;
- backup Home stops;
- a large **Show to driver** card with a simple Finnish request;
- a printable public-stop-only backup card for a flat battery.

### 6. Local-first PWA

The app is installable and useful even when connectivity degrades.

The service worker caches the application shell, while live Föli responses are intentionally **not** cached as if they were durable truth.

Recent same-stop board data can be retained briefly and shown with stale/offline messaging.

---

## Who it is useful for

The design is useful beyond a power commuter who already knows every stop.

It explicitly supports scenarios involving:

- regular commuters who want a faster departure view;
- visitors and newcomers unfamiliar with Turku;
- passengers travelling in a second language;
- children or family members using preselected safe stops;
- people who find continuous map-watching stressful or inconvenient;
- passengers travelling in weak-connectivity conditions;
- anyone who needs a clearer distinction between **live**, **planned** and **unknown**.

The current implementation is Turku-specific, but the product pattern — **realtime + disruption context + conservative ride assistance + recovery** — can be adapted to other transit systems exposing compatible realtime and GTFS data.

---

<a id="why-it-is-different"></a>

## Why it is different

This is not a journey planner replacement and it is not another thin API-to-table demo.

The differentiator is the **decision layer between provider data and the passenger**.

### Provider data is treated as uncertain

Realtime feeds fail, GPS drifts, planned times become stale and route geometry can be ambiguous.

The app normalizes provider contracts at the boundary and keeps uncertainty visible instead of hiding it behind a polished interface.

### Safety-critical language requires stronger evidence

A countdown can be approximate.

**"Press STOP now" cannot.**

Ride Mode therefore uses asymmetric confidence rules: weak evidence may warn early, but stronger evidence is required for actions that could make the passenger react immediately.

### Offline does not pretend to be online

The PWA preserves useful local information while clearly separating cached state from live transit information.

### Privacy is a product constraint

There is:

- no user account;
- no advertising;
- no analytics SDK;
- no persisted GPS history;
- no need to save a Home street address.

Location is used only when the passenger asks for it and, during an active ride, stays on the device.

### Accessibility is part of release quality

Accessibility is tested in CI rather than left as a manual checklist.

The UI includes semantic live regions, keyboard interaction, large touch targets, visible focus, reduced-motion support, forced-colors support, responsive text scaling and runtime contrast correction for provider-supplied line colours.

---

## Product opportunity

The current application is an independent portfolio product, not a claim of commercial traction.

The broader product opportunity is the layer around public-transit data that traditional timetable interfaces often underserve:

**trust, reassurance, recovery and action at the moment a passenger is uncertain.**

Potential product directions include:

- stronger locked-phone ride alerts through an ephemeral backend + Web Push;
- additional supported transit networks through provider adapters;
- Swedish localization;
- caregiver/family workflows built around public stop identities rather than private addresses;
- accessibility-focused transit assistance;
- more resilient disruption and recovery flows.

The architecture intentionally keeps these options open without requiring accounts or a heavy backend for the current product.

---

<a id="engineering-depth"></a>

## Engineering depth

The infrastructure is intentionally small. The behavioural complexity is not.

There is no application backend, map SDK, analytics SDK or global state library. Instead, the project focuses on explicit data contracts, browser lifecycle behaviour and testable product rules.

### Stack

| Area | Technology |
| --- | --- |
| UI | React 18, CSS Modules |
| Build | Vite 8 |
| Realtime/data | Axios, Föli SIRI, GTFS and alerts APIs |
| Local state | React hooks, Web Storage |
| Browser APIs | Geolocation, History, Visibility, Service Worker, Notifications, Wake Lock, Web Audio, Speech Synthesis, Web Share, Clipboard, AbortController |
| Unit/integration | Vitest, Testing Library |
| Browser QA | Playwright |
| Accessibility | axe |
| CI/CD | GitHub Actions + GitHub Pages |
| Delivery | Installable local-first PWA |

### Architecture

~~~text
Föli SIRI + GTFS + Alerts
        │
        ▼
Provider boundary
normalization · validation · bounded caches · dataset pinning
        │
        ▼
Product hooks
├─ realtime board + stale-data safety
├─ stop and route catalogues
├─ disruption matching
├─ saved stops and places
├─ service-area checks
├─ connectivity state
└─ Ride Mode
   ├─ realtime identity matching
   ├─ GTFS trip/stop sequence
   ├─ GPS shape matching
   ├─ evidence evaluation
   └─ alert state machine
        │
        ▼
Passenger UI
search · departures · alerts · Get-off Alert · recovery · offline state
        │
        ▼
Browser platform
History · Geolocation · Storage · Service Worker · Notifications
~~~

### Engineering problems solved

The repository contains explicit handling and regression coverage for problems such as:

- realtime data becoming stale without an obvious hard failure;
- responses arriving after the user has switched to another stop;
- preserving same-stop information during transient outages without cross-stop contamination;
- loop routes that visit the same stop more than once;
- after-midnight GTFS times;
- the same vehicle appearing in multiple runs;
- poor or off-route GPS;
- stale vehicle positions;
- provider data disagreeing with the timetable;
- browser Back/Forward state;
- blocked local storage;
- service-worker deployment under a GitHub Pages subpath;
- unreliable background browser execution;
- provider API contracts changing over time.

The detailed provider behaviour is documented in **[Föli API engineering reference](docs/FOLI_API_REFERENCE.md)** and the ride evidence model in **[Ride Mode design](docs/RIDE_MODE_SPEC.md)**.

---

<a id="quality-evidence"></a>

## Quality evidence

The project treats quality as executable evidence rather than a README claim.

### Automated test suite

The current release gates include:

- **512 Vitest / Testing Library tests**;
- coverage ratchet: **82% statements / 75% branches / 85% functions / 86% lines**;
- Playwright product flows across **Chromium, Firefox, mobile WebKit and mobile Chromium**;
- a separate Chromium PWA project with the real service worker enabled;
- axe checks covering WCAG 2 A/AA, 2.1 AA and 2.2 AA serious/critical violations;
- mobile overflow and 200% text-scaling regression checks;
- deterministic screenshot generation;
- production bundle budget;
- generated PWA asset/precache verification.

### CI pipeline

Every pull request to master runs:

~~~text
ESLint
  ↓
Vitest + coverage gate
  ↓
Föli API reference verification
  ↓
Production build
  ↓
PWA verification
  ↓
Bundle budget
  ↓
Production-subpath build
  ↓
Chromium / Firefox / WebKit / mobile E2E
  ↓
axe accessibility checks
~~~

A separate scheduled workflow probes the live Föli API contracts so upstream changes can be detected independently of mocked CI.

### Examples of regression behaviour under test

The test suite includes cases such as:

- a failed poll cannot keep an old vehicle position fresh enough to say "get off now";
- location says nothing while the passenger is still waiting at the boarding stop;
- a loop route targets the exact visit of the selected stop;
- stale data from one stop can never appear under another;
- an untracked timetable row is not treated as a live bus;
- an offline reopen preserves saved places and driver help;
- a 320 px screen keeps core controls reachable;
- 200% text scaling remains usable;
- a browser that blocks site data still gets departures.

This is the part of the project that best represents the engineering goal: **designing for failure modes before they become user failures.**

---

## Reliability model

Key production rules include:

- 30-second visible-tab departure refresh;
- immediate refresh when returning to the tab;
- exponential retry backoff after repeated failures;
- AbortController cancellation during stop changes;
- 8-second provider HTTP timeout;
- strict same-stop stale-data isolation;
- bounded provider caches;
- GTFS dataset pinning and cache invalidation when the dataset changes;
- live API responses excluded from service-worker caching;
- offline application-shell fallback;
- explicit live / delayed / scheduled / offline states.

Föli's APIs are not treated as perfectly stable. Current contracts are documented, normalized at the application boundary and checked by a scheduled live smoke workflow.

---

## Honest product boundaries

Trust also means documenting what the app cannot guarantee.

- A browser may suspend an open page in the background or on a locked phone. The current client-only Get-off Alert therefore **does not promise guaranteed lock-screen tracking**.
- Reliable background alerts require a Phase 2 backend + Web Push design.
- Föli vehicle coordinates are provider estimates, not raw GPS truth.
- The product does not replace official ticketing or journey planning.
- The app currently supports Finnish and English, not Swedish.
- Saved places can reveal an approximate area because a public stop is still a location.

See **[Product audit](docs/PRODUCT_AUDIT.md)** for the current QA scorecards, fixed risks and remaining limitations.

---

## Privacy

- No account.
- No ads.
- No analytics.
- Favourites, recent stops, line filters and My Places stay in browser storage.
- My Places stores public stop identities, not street addresses.
- Device coordinates are not persisted.
- During an active ride, optional GPS processing happens on the device.
- GitHub Pages and data.foli.fi necessarily receive network requests and therefore see the user's IP address.
- Google Maps is opened only after an explicit route action.

---

<a id="suomeksi"></a>

## Suomeksi

**Turun bussien lähtöajat, liikennetiedotteet ja muistutus siitä, milloin pitää painaa STOP.**

Föli Live Departures auttaa erityisesti silloin, kun matkustaminen ei mene täysin suunnitelman mukaan: bussi on myöhässä, reaaliaikatieto puuttuu, pysäkki on vieras, yhteys katkeaa tai oma poistumispysäkki jännittää.

- **Reaaliaikaiset ja aikataulun mukaiset lähdöt** erotetaan toisistaan.
- **Pysäkkihälytys** kertoo, milloin kannattaa valmistautua ja painaa STOP.
- **Liikennetiedotteet** näkyvät matkustuspäätöksen yhteydessä.
- **Koti, koulu ja työ** tallennetaan julkisina pysäkkeinä, ei kotiosoitteena.
- **Vie minut kotiin** tarjoaa reitin, kotipysäkin, varapysäkit ja kuljettajalle näytettävän kortin.
- **Offline-tila** säilyttää hyödylliset paikalliset tiedot ilman, että vanhaa tietoa väitetään reaaliaikaiseksi.
- Ei käyttäjätiliä, mainoksia tai analytiikkaa.

**Avaa sovellus:** https://mykoladotsenko.github.io/foli-live-departures/

> Epävirallinen sovellus. Sen tekijä ei ole Föli eikä Turun kaupunki, eikä sovellus liity niihin.

---

## Run locally

Requires Node.js 20.19+.

~~~bash
npm ci
npm run dev
~~~

Production verification:

~~~bash
npm run lint
npm run test:coverage
npm run verify:api-reference
npm run build
npm run verify:pwa
npm run verify:bundle
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
~~~

Optional provider-compatible API overrides:

~~~bash
VITE_FOLI_API_URL=https://example.test/siri/sm npm run dev
VITE_FOLI_ALERTS_URL=https://example.test/alerts npm run dev
VITE_FOLI_GTFS_URL=https://example.test/gtfs/ npm run dev
VITE_FOLI_STOPS_URL=https://example.test/gtfs/stops npm run dev
VITE_FOLI_ROUTES_URL=https://example.test/gtfs/routes npm run dev
~~~

---

## Repository map

~~~text
src/
├─ api/          provider normalization and HTTP boundary
├─ components/   passenger-facing product UI
├─ hooks/        realtime, persistence and browser lifecycle logic
├─ i18n/         interface language and Finnish translations
└─ utils/        geo, time, ride, route, alert and sharing logic

e2e/             cross-browser product and accessibility QA
scripts/         PWA, bundle and provider-contract verification
docs/            product audit, API reference, ride spec and screenshots
.github/         CI, deployment and live contract smoke checks
~~~

## Documentation

- **[Product audit](docs/PRODUCT_AUDIT.md)** — current UX/product scorecards, fixed risks and open limitations
- **[Ride Mode design](docs/RIDE_MODE_SPEC.md)** — state machine, evidence model and Phase 2 reliability boundary
- **[Föli API engineering reference](docs/FOLI_API_REFERENCE.md)** — documented vs live-observed provider contracts
- **[Localization notes](docs/LOCALIZATION.md)** — language architecture and review rules

## Data attribution

Transit and timetable data is maintained by Turku region public transport and distributed through data.foli.fi under **CC BY 4.0**.

Application source code is available under the **MIT License**.

---

**Built as an independent product engineering project around a real public transport system, real provider uncertainty and real passenger recovery scenarios.**
