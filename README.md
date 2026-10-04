# Turku Departures

![CI](https://github.com/MykolaDotsenko/foli-live-departures/actions/workflows/ci.yml/badge.svg)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)
![License](https://img.shields.io/badge/license-MIT-blue)

**Live departures, disruptions and get-off alerts for Turku — privacy-first, no account, no ads.**

[**Open Turku Departures →**](https://mykoladotsenko.github.io/foli-live-departures/) ·
[**Download Android APK ↓**](https://github.com/MykolaDotsenko/foli-live-departures/releases/download/android-latest/Turku-Departures.apk) ·
[Suomeksi](#suomeksi) ·
[Report a problem](https://github.com/MykolaDotsenko/foli-live-departures/issues/new?template=bug_report.yml)

> Independent project using Föli open data. Not made by or affiliated with Föli or the City of Turku.

### Current interface

<p align="center">
  <img
    src="docs/assets/turku-departures-mobile.png"
    alt="Turku Departures showing live and scheduled departures from Kauppatori"
    width="260"
  >
  &nbsp;
  <img
    src="docs/assets/turku-departures-ride-now.png"
    alt="Turku Departures get-off alert telling the passenger to get off now"
    width="260"
  >
  &nbsp;
  <img
    src="docs/assets/turku-departures-mobile-fi.png"
    alt="Turku Departures in Finnish"
    width="260"
  >
</p>

## Android APK

An installable Android sideload build is published from `master`:

[**Download Turku-Departures.apk →**](https://github.com/MykolaDotsenko/foli-live-departures/releases/download/android-latest/Turku-Departures.apk) ·
[SHA-256 checksum](https://github.com/MykolaDotsenko/foli-live-departures/releases/download/android-latest/Turku-Departures.apk.sha256)

The APK uses the same web application and Android permissions exercised by the repository's Android emulator E2E workflow. It is a GitHub-built prerelease for direct installation, not a Google Play release. Android may ask you to allow installs from your browser or file manager.

The stable `android-latest` prerelease is replaced only after the **exact APK** from a merged `master` revision completes Android emulator E2E and checksum verification. This keeps the download tied to tested release evidence rather than to an unverified build.

The `android-latest` download remains a debug-signed sideload build for testing. The repository now also contains a separate production-release workflow that uses the independent package ID `io.github.mykoladotsenko.turkudepartures`, persistent signing secrets, APK + AAB output, SHA-256 checksums and emulator verification of the exact signed APK before an immutable version release. It intentionally cannot publish a production build until the owner configures the signing environment and secrets described in [Android release](docs/ANDROID_RELEASE.md).

## What the app does

| Passenger question | What the app does |
| --- | --- |
| What leaves next? | Live and scheduled times, each clearly marked |
| Is the trip disrupted? | Service updates shown with your stop and lines |
| Which stop is nearest? | Nearby stops from a one-time location check |
| When should I press STOP? | A get-off alert that tells you when to get ready, press STOP and get off |
| How do I get home? | Your saved Home stop, backup stops and Show to driver |
| Can I search for an address or place? | Yes. Stops, 1,055 named POIs, 33,288 addresses and 7,213 streets are searched locally from shipped OpenStreetMap data; destination text stays on the device |
| How do I get there? | Journey Assistant ranks direct and bounded one- or two-transfer itineraries, prefers meaningfully different alternatives, keeps the boarded leg authoritative, and requires an explicit choice before any recovery replacement |
| Can I trust the suggested bus? | Boarding guidance shows categorical High / Medium / Low confidence from realtime freshness, catchability and transfer margin instead of inventing a percentage |
| What happens after I get off? | Final-walk guidance can show approximate distance and compass direction offline, with external pedestrian navigation only as an explicit handoff |
| When should I leave? | Leave now / leave at / arrive by controls, with bounded routing preferences |
| What if the connection drops? | An installable app that says plainly what still works offline |

## Get-off alert

The alert follows your bus in Föli’s live data, knows the order of the stops on your trip, and can use your phone’s location if you allow it.

The alert moves through three steps:

```text
get ready → press STOP → get off now
```

A weak or off-route location is not trusted. The timetable alone can warn you early, but it never triggers **Get off now**.

The exact stop order is kept, including loop routes that visit the same stop more than once.

## Privacy and limits

- no account, ads or analytics;
- saved places are public stops, never street addresses;
- your location is not stored;
- your location during a ride stays on the phone;
- GitHub Pages and data.foli.fi receive the network requests needed to load the app and the bus data;
- direct public Nominatim lookup is disabled in production; Föli stops, **1,055 named places, 33,288 addresses and 7,213 streets** are searched locally from shipped OpenStreetMap datasets, so destination text stays on this device; the official Turku journey planner remains the wider-search fallback;
- the packaged Android app follows the same fail-closed rule and does **not** call public Nominatim directly;
- a Content-Security-Policy lets the page run only its own code and talk only to same-origin assets and approved Föli endpoints; the dormant public place-search provider is not in production `connect-src`; the policy is checked on every build and in every browser test.

A browser can pause a page in the background or on a locked phone, so the get-off alert does **not** promise lock-screen alerts. Reliable background alerts would need a server and Web Push.

Turku Departures is not a ticketing app and does not replace Föli's official journey planner. Turn-by-turn pedestrian routing is intentionally not claimed: the backendless production build keeps walking approximate and hands off externally when precise pedestrian routing is needed.

## Suomeksi

**Turku Departures näyttää bussien reaaliaikaiset ajat ja häiriöt sekä kertoo, milloin painaa STOP-nappia.**

> Itsenäinen projekti, joka käyttää Fölin avointa dataa. Sovellus ei ole Fölin tai Turun kaupungin tekemä eikä niihin sidoksissa. Liput ja virallinen reittiopas: foli.fi.

- reaaliaikaiset ja aikataulun mukaiset lähdöt erotetaan toisistaan;
- pysäkkihälytys auttaa valmistautumaan oikeaan aikaan;
- tallennetut paikat ovat julkisia pysäkkejä, eivät osoitteita;
- ”Vie minut kotiin” ja varapysäkit auttavat, jos tavallinen matka ei onnistu;
- sijaintia käytetään vain pyydettäessä tai pysäkkihälytyksen aikana, jos sallit sen;
- ei käyttäjätiliä, mainoksia tai analytiikkaa.

[**Avaa Turku Departures →**](https://mykoladotsenko.github.io/foli-live-departures/) ·
[Ilmoita ongelmasta](https://github.com/MykolaDotsenko/foli-live-departures/issues/new?template=bug_report.yml)

## For developers

### The problem

Transit data is easy when everything is fresh and the passenger already knows the route. Real use is messier:

- realtime can become stale without the provider being completely down;
- GTFS trips can cross midnight or visit the same stop more than once;
- GPS can be weak, delayed or off-route;
- a passenger may need a useful fallback while offline;
- scheduled and realtime departures must not look equally certain.

Turku Departures keeps **live, scheduled, stale and unknown** states distinct instead of flattening them into one timestamp.

### How the get-off alert decides

The alert combines three independent signals:

1. **Föli's live bus data** (SIRI);
2. **the trip's exact stop order** from the timetable (GTFS), including loop routes that visit the same stop more than once;
3. **optional GPS on the phone, matched to the bus route**; weak or off-route fixes are ignored.

Timetable-only estimates can raise the early steps but never **Get off now**.

### Engineering edge cases

The code explicitly handles:

- responses arriving after the user switches stops;
- cross-stop cache contamination;
- stale realtime without a hard provider failure;
- loop routes, repeated stops and the same GTFS trip definition occurring on different service dates;
- one-to-one realtime/scheduled occurrence matching instead of deduping on bare trip IDs;
- after-midnight GTFS times;
- poor/off-route GPS and stale vehicle positions;
- cross-tab Ride continuation/settings races and reload restoration;
- late notification permission/cleanup work from a replaced Ride session;
- transfer revalidation evidence leaking across committed legs;
- changing walking distance without restarting a destination-aware polling identity;
- long-running empty timetable horizons and leave-at/arrive-by expiry;
- blocked local storage;
- service-worker deployment under a GitHub Pages subpath;
- upstream Föli API contract drift.

### Architecture

| Area | Technology |
| --- | --- |
| UI | React 18, CSS Modules |
| Build | Vite 8 |
| Types | TypeScript strict `checkJs` over JSDoc for the data layer (`src/api`, `src/utils`, `src/types`) |
| Transit data | Föli SIRI, GTFS, service alerts |
| Local destination data | OpenStreetMap ODbL POI + street/address packs |
| HTTP | Browser `fetch` through a small timeout/cancellation client |
| Local state | React hooks, Web Storage |
| Browser APIs | Geolocation, History, Service Worker, Notifications, Wake Lock, Web Audio |
| Testing | Vitest, Testing Library, Playwright, axe |
| Delivery | GitHub Actions + GitHub Pages, installable PWA |

```text
Föli SIRI + GTFS + Alerts
        │
        ▼
Provider boundary
normalization · validation · cache safety · typed contracts
        │
        ▼
React hooks
realtime · disruptions · places · connectivity · Ride Mode
        │
        ▼
Passenger UI
departures · alerts · get-off alerts · recovery
```

### Quality evidence

The verification suite covers:

- unit/integration tests with coverage reporting;
- Chromium, Firefox, mobile WebKit and mobile Chromium journeys;
- real service-worker/PWA behaviour;
- axe accessibility checks;
- 320–430 px mobile layouts and horizontal-overflow regression;
- 200% text scaling and touch-target checks;
- production JS/CSS bundle budgets for both raw parse footprint and deterministic gzip transfer size;
- live Föli API contract smoke tests;
- branding/reference consistency;
- high/critical runtime dependency audit;
- Android package/signing/release-contract invariants;
- deterministic simulated-phone Ride Mode flows, including weak GPS, reload recovery, arrival and missed-stop evidence;
- offline OSM POI/address-pack schema, attribution, bounds and size gates;
- reviewed scheduled OSM refresh automation that opens a PR and never auto-merges.

CI follows the same path:

```text
runtime dependency audit → lint → typecheck → brand/reference checks
→ Android release-contract verification → tests + coverage
→ production build → PWA + bundle verification
→ cross-browser E2E → accessibility
```

The production GitHub Pages deployment is triggered only after that CI workflow completes successfully on `master`.

**Current verified status (2026-10-04):** the production baseline on `master` passes **128/128 test files and 1,399/1,399 tests** with **88.85% statements / 81.56% branches / 90.60% functions / 91.50% lines** coverage. The browser matrix runs **393 scenarios** across desktop Chromium/Firefox and mobile Chromium/WebKit: **220 passed, 173 intentionally skipped by project applicability, 0 failed**. The shipped OSM datasets are **1,055 POIs (79,543 B)** and **33,288 addresses + 7,213 streets (1,825,393 B)**. Startup JS/CSS is **614,929 raw / 172,203 gzip B** against **625,000 / 180,000** budgets; complete shipped JS/CSS is **636,988 / 179,653 B** against **640,000 / 180,000**; locale packs are **182,592 / 46,772 B** against **185,000 / 55,000**. English, Finnish, Ukrainian and Swedish are implemented. CI also verifies the offline address pack, OSM refresh workflow, Android release surface, CSP, PWA precache, exact merged-PR provenance and live production deployment. Physical VoiceOver/TalkBack, real-bus field validation, custom-domain evidence and production Android signing remain explicit manual gates.

### Run locally

Requires Node.js 20.19+.

```bash
npm ci
npm run dev
```

Full verification:

```bash
npm run lint
npm run typecheck
npm run verify:brand
npm run test:coverage
npm run verify:api-reference
npm run build
npm run verify:pwa
npm run verify:bundle
npm run verify:csp
npm run test:e2e
```

### Documentation

- [Product audit](docs/PRODUCT_AUDIT.md)
- [Production roadmap](docs/PRODUCTION_ROADMAP.md)
- [Journey Assistant specification](docs/JOURNEY_ASSISTANT_SPEC.md)
- [Journey Assistant UX implementation audit](docs/JOURNEY_ASSISTANT_UX_AUDIT.md)
- [Destination-aware Nearby design appendix](docs/DESTINATION_AWARE_NEARBY_SPEC.md)
- [Ride Mode design](docs/RIDE_MODE_SPEC.md)
- [Föli API reference](docs/FOLI_API_REFERENCE.md)
- [Localization notes](docs/LOCALIZATION.md)
- [Brand guide](docs/BRAND_GUIDE.md)

Transit/timetable data is maintained by Turku region public transport and distributed through data.foli.fi under **CC BY 4.0**.

Application source code is under the **MIT License**.


## Production readiness

The architecture and safety model are suitable for controlled pre-field use, and the latest verified `master` has completed the repository's automated unit/coverage, cross-browser accessibility, PWA/CSP/bundle, Android emulator, live Föli contract and exact-revision production deployment path. Broad public release is still intentionally blocked by unfinished pre-field product scope plus explicit physical-device, native-language, field-validation, domain and production-signing gates that automation cannot honestly replace. See:

- [Production readiness](docs/PRODUCTION_READINESS.md)
- [Full PR-by-PR production roadmap](docs/PRODUCTION_ROADMAP.md)
- [Real-bus field validation](docs/FIELD_VALIDATION.md)
- [Android production release](docs/ANDROID_RELEASE.md)
- [Finnish native-language review](docs/FINNISH_NATIVE_REVIEW.md)

These checklists deliberately keep implementation, automated verification and external/manual gates separate instead of treating merged code as release completion.
