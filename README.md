# Föli Live Departures

![CI](https://github.com/MykolaDotsenko/foli-live-departures/actions/workflows/ci.yml/badge.svg)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline--ready-5A0FC8)
![Accessibility](https://img.shields.io/badge/accessibility-WCAG%20tested-0A7F5A)
![License](https://img.shields.io/badge/license-MIT-blue)

**A privacy-first transit companion for Turku that turns uncertain public-transport data into clear passenger actions.**

> **Know what leaves next. See disruptions before they matter. Get an alert when it is time to press STOP.**

[**Open the live app →**](https://mykoladotsenko.github.io/foli-live-departures/)
· [Product positioning](docs/PRODUCT_POSITIONING.md)
· [Product audit](docs/PRODUCT_AUDIT.md)
· [Ride Mode design](docs/RIDE_MODE_SPEC.md)

> Independent project using Föli open data. Not made by or affiliated with Föli or the City of Turku.

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

## Why this exists

A normal timetable works when everything goes right. Real passengers also need answers when:

- the bus is delayed or realtime becomes stale;
- a disruption changes the trip;
- the route or stop is unfamiliar;
- GPS or connectivity is unreliable;
- they are worried about missing their stop;
- they need a simple way to get home.

**Föli Live Departures is built for those moments of uncertainty.**

It does not try to look more certain than its data. When evidence weakens, the interface degrades explicitly instead of presenting stale information as truth.

## What the product does

### Live departures that degrade honestly

The board combines Föli realtime with planned GTFS service while keeping the distinction visible.

It handles:

- **Live vs scheduled** departures;
- stale-data detection;
- same-stop fallback after temporary failures;
- cancellation and disruption context;
- offline reopening without pretending cached data is live.

### Get-off Alert

Choose a departure and the stop where you want to get off. The app can tell you when to:

**get ready → press STOP → get off now**

Ride Mode combines three evidence sources:

1. **Föli SIRI realtime**;
2. **exact GTFS trip and stop order**;
3. **optional on-device GPS matched to the trip shape**.

Weak or off-route GPS is ignored. Timetable-only evidence can warn early, but it cannot trigger **"get off now"**.

Exact GTFS stop sequence is preserved, including loop routes that visit the same stop more than once.

### Recovery and familiar places

Home, School and Work are stored as **public stop identities, not street addresses**.

Recovery tools include:

- **Get me Home** route handoff;
- main and backup Home stops;
- a large **Show to driver** card;
- a printable public-stop-only backup card.

### Local-first PWA

The app is installable and keeps useful local information available when connectivity drops.

The service worker caches the application shell, but live Föli responses are intentionally not cached as durable truth.

## Why it is different

Official journey planners are good at finding routes. This project focuses on a narrower problem:

**what should the passenger do when they already have a trip in mind, but the situation becomes uncertain?**

| Alternative | Main job | Gap this project addresses |
| --- | --- | --- |
| Timetable | Planned service | Live / stale / scheduled / unknown states |
| Journey planner | Route from A to B | Assistance during the actual ride |
| Map app | Navigation | Transit-specific stop order and STOP timing |
| Föli Live Departures | Passenger reassurance | Realtime context + disruption + Get-off Alert + recovery |

The differentiator is the **decision layer between provider data and the passenger**.

A countdown may be approximate. **"Press STOP now" requires stronger evidence.**

That principle drives the Ride Mode state machine, stale-data handling and GPS safeguards.

## Engineering

The infrastructure is intentionally small; the behaviour is not.

There is no application backend, map SDK, analytics SDK or global state library.

| Area | Technology |
| --- | --- |
| UI | React 18, CSS Modules |
| Build | Vite 8 |
| Data | Axios, Föli SIRI, GTFS, alerts |
| Local state | React hooks, Web Storage |
| Browser APIs | Geolocation, History, Service Worker, Notifications, Wake Lock, Web Audio |
| Testing | Vitest, Testing Library, Playwright, axe |
| CI/CD | GitHub Actions + GitHub Pages |
| Delivery | Installable local-first PWA |

~~~text
Föli SIRI + GTFS + Alerts
        │
        ▼
Provider boundary
normalization · validation · cache safety
        │
        ▼
React hooks
realtime · disruptions · saved places · connectivity · Ride Mode
        │
        ▼
Passenger UI
departures · alerts · Get-off Alert · recovery
        │
        ▼
Browser platform
Geolocation · Storage · Service Worker · Notifications
~~~

The code explicitly handles edge cases such as:

- responses arriving after a stop switch;
- stale realtime without a hard provider failure;
- cross-stop cache contamination;
- loop routes and repeated stops;
- after-midnight GTFS times;
- poor or off-route GPS;
- stale vehicle positions;
- browser Back/Forward state;
- blocked local storage;
- service-worker deployment under a subpath;
- upstream API contract changes.

See the [Föli API engineering reference](docs/FOLI_API_REFERENCE.md) and [Ride Mode design](docs/RIDE_MODE_SPEC.md) for the deeper reasoning.

## Quality evidence

The project treats quality as executable evidence, not a README claim.

- **512 automated unit/integration tests**
- coverage gates: **82% statements / 75% branches / 85% functions / 86% lines**
- Playwright on **Chromium, Firefox, mobile WebKit and mobile Chromium**
- separate PWA tests with the real service worker enabled
- axe accessibility checks for WCAG A/AA, 2.1 AA and 2.2 AA
- 200% text-scaling and mobile-overflow regression checks
- production bundle budget
- scheduled smoke tests against the live Föli API

CI verifies:

~~~text
lint → tests + coverage → API reference → build
→ PWA verification → bundle budget
→ cross-browser E2E → accessibility
~~~

## Privacy

- No account.
- No ads.
- No analytics.
- Saved places use public stops instead of private addresses.
- Device coordinates are not persisted.
- Optional ride GPS is processed on the device.

GitHub Pages and data.foli.fi still receive the network requests required to serve the app and transit data.

## Honest boundaries

- A browser may suspend an open page in the background or on a locked phone.
- The current Get-off Alert therefore does **not** promise guaranteed lock-screen tracking.
- Reliable background alerts require the documented backend + Web Push phase.
- Föli vehicle coordinates are estimates, not raw GPS truth.
- The product does not replace official ticketing or full journey planning.
- The interface currently supports Finnish and English, not Swedish.

See the [Product audit](docs/PRODUCT_AUDIT.md) for known limitations and the [Product positioning](docs/PRODUCT_POSITIONING.md) for market hypotheses vs. evidence.

## Suomeksi

**Turun bussien lähtöajat, liikennetiedotteet ja muistutus siitä, milloin pitää painaa STOP.**

- reaaliaikaiset ja aikataulun mukaiset lähdöt erotetaan toisistaan;
- Pysäkkihälytys kertoo, milloin kannattaa valmistautua ja painaa STOP;
- liikennetiedotteet näkyvät matkan yhteydessä;
- Koti, koulu ja työ tallennetaan julkisina pysäkkeinä, ei osoitteina;
- hyödylliset paikalliset tiedot säilyvät myös yhteyden katketessa;
- ei käyttäjätiliä, mainoksia tai analytiikkaa.

[**Avaa sovellus →**](https://mykoladotsenko.github.io/foli-live-departures/)

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
npm run test:e2e
~~~

## Documentation

- **[Product positioning](docs/PRODUCT_POSITIONING.md)** — audience, alternatives, value and validation gaps
- **[Product audit](docs/PRODUCT_AUDIT.md)** — UX/product scorecards and remaining limitations
- **[Ride Mode design](docs/RIDE_MODE_SPEC.md)** — evidence model, state machine and Web Push phase
- **[Föli API engineering reference](docs/FOLI_API_REFERENCE.md)** — provider contracts and fallbacks
- **[Localization notes](docs/LOCALIZATION.md)** — language architecture and review rules

## Data attribution

Transit and timetable data is maintained by Turku region public transport and distributed through data.foli.fi under **CC BY 4.0**.

Application source code is available under the **MIT License**.
