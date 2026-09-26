# Product audit

**Updated:** 2026-09-26
**Scope:** what a passenger meets on the screen, how far the app can be trusted, how useful it is, and how it presents itself before a public release.

## How it was scored

Three reviews were run, each more than once, on the same builds:

- **QA** read the code and tried to break it, with probes where a claim needed proof.
- **UX** judged every screen as a passenger sees it, from screenshots at 360 px, 412 px and 1280 px, in light and dark mode, in English and Finnish.
- **Product and marketing** judged value, first run, copy, brand, trust and the surfaces a passenger sees before opening the app: the link preview, the install sheet and the README.

Each area is scored out of 100. These scores are the reviewers' judgement, not usage data: there is no analytics, by design.

An earlier version of this page gave every area 95–98. Those were self-assessments of how well the code was built. The reviews below score the product as a passenger meets it, and they started much lower.

## Scorecards

Four rounds of review. "First" is the first review of this release, before its fixes. "Verification" is the latest full review.

### Quality (QA)

| Area | First | Re-audit | Pre-release | Verification |
| --- | ---: | ---: | ---: | ---: |
| Get-off alert (Ride Mode) | 60 | 64 | 58 | 72 |
| Departure board | 82 | 74 | 88 | 88 |
| Stop search | 84 | 86 | 88 | 93 |
| Service updates | 85 | 85 | 80 | 82 |
| My Places and Get me Home | 86 | 88 | 86 | 93 |
| Offline | 68 | 80 | 87 | 91 |
| Finnish | — | 86 | 94 | 94 |

The get-off alert fell in the pre-release round because the review found a real fault: "Press STOP now" could come while the bus was still at the stop before the exit, and the press stopped it there. That was fixed. The verification round found the same fault on one more path, a passenger's location read while they still waited at the boarding stop. That was fixed after the round too (see below).

### Design (UX)

| Area | First | Re-audit | Pre-release | Verification |
| --- | ---: | ---: | ---: | ---: |
| Visual design | 70 | 74 | 80 | 86 |
| Copy, English | 63 | 72 | 79 | 85 |
| Copy, Finnish | — | 68 | 77 | 80 |
| Phone ergonomics | 58 | 64 | 76 | 82 |
| Dark theme | — | 84 | 86 | 89 |

In the verification round, 21 of 23 screens scored 80 or more on a phone. The two below were the ride screen going by the timetable (74, its notes contradicted each other) and place setup (70, three controls per stop).

### Product and marketing

| Area | Pre-release | Verification |
| --- | ---: | ---: |
| Value to a passenger | 74 | 80 |
| First run | 70 | 76 |
| Copy | 76 | 80 |
| Brand | 60 | 63 |
| Finnish | 78 | 82 |
| Marketing surface | 62 | 70 |
| Install (PWA) | 80 | 84 |
| Trust and privacy | 78 | 82 |
| Feature completeness | 72 | 82 |
| **Average** | **72** | **78** |

The first product review averaged about 41, and the re-audit about 56, on a coarser list of areas.

The product reviewer's verdict: ready for a quiet release now. Not ready to promote until the name and the domain are settled, and until the get-off alert has been ridden on real buses in the city centre.

## Fixed after the verification round

These came out of the verification round and are not yet re-scored.

**Get-off alert**
- Location raises nothing while the passenger still waits at the boarding stop. It counts once two fixes in a row are on the route, past the boarding stop, and not standing still.
- "Press STOP now" needs two such fixes past the stop before, each past it by its own accuracy, or the bus seen leaving that stop live.
- One name everywhere: **Get-off alert** / **Pysäkkihälytys**, **Alert on**, **Turn off alert**, **Missed your stop?**. Before, the board said "Get-off alert" and the panel said "Ride Mode".
- The "Remaining" tile shows the planned count before departure, and a dash, never "tracking".
- The timetable note no longer contradicts "Following your bus".
- The off-route question's "Turn off alert" asks for a second tap, like the one in the panel.
- Get me Home is hidden during a ride: its route link would leave the page the alert runs in.
- The badge no longer squeezes the title on a small phone.

**Board and service updates**
- A failed service-update check is tried again as soon as Föli answers the board, not five minutes later.
- With a line filter on, a cancelled bus is not listed twice.
- The wheelchair symbol stays with the status, and chips that wrap start flush.
- "Hide stops" is short enough to keep the alert button on the same line.

**Places, offline and first run**
- One location button on a first visit, not two a thumb apart.
- My Places says its promise once, and "Not at the stop?" once, under all three places.
- The offline notice is two lines, and the Home card does not repeat it.
- The printed card labels backup stops in Finnish and English.
- Developer words are gone from the copy: "coordinates", "catalogue", "realtime feed", "stop sequence".

**Trust and first impressions**
- About & privacy and the README say what data.foli.fi is asked (stops and buses), when location is used (on request, and during a ride while Follow my location is on), and that Google Maps may use the phone's location once it opens.
- The install-sheet and README screenshots show a morning at 08:10, not 01:00. The ride screenshot sits over the board of the stop being got off at.

## Still open

**Found by the reviews, not done**
- Place setup still asks for a checkbox and a "Main stop" choice per stop, and a confirmation (UX, 70).
- The board header on a phone stacks Filter lines and Refresh, and error screens offer both Refresh and Try again.
- Next stops mixes "around 01:25" with bare times. Kept, because the difference is Föli's own: only timepoints have exact times.
- There is no install hint on iPhone outside ride setup.
- MISSED ends the alert for good; it does not come back if the bus turns out to be earlier on its route.

**Owner decisions**
1. **One product name.** Five are in use: "Föli departures" (header), "Föli Live Departures" (README), two page and manifest titles, and "Turku Föli" on the home screen. "Turku Föli" reads as the operator's own app, so Föli's written no-objection is worth having first.
2. **Custom domain,** before promoting. Places, favourites and installs belong to the github.io address and do not move with it.
3. **Who makes it, and a contact address.** About says only who does not make it. GitHub issues are the only channel.
4. **A native Finnish review,** starting with the alert, what it says aloud, and the driver card.
5. **The Android app ID** `fi.turku.*` uses the City's namespace.
6. **Swedish.**
7. **GitHub description and topics.**

## Known limitations

These are stated, not hidden.

- **A browser can pause the get-off alert.** A page in the background or on a locked phone may stop running. The panel says so, asks the passenger to keep it open, and plays a test alert first. Guaranteed lock-screen alerts need a small backend with Web Push; that is Phase 2 in [Ride Mode design](RIDE_MODE_SPEC.md).
- **No journey planner inside the app.** Get me Home hands the route to Google Maps. The app does not choose transfers or walking paths.
- **Vehicle direction is unknown.** Stop Monitoring gives a position, not a heading, so the board says "Bus nearby", never "approaching".
- **Connectivity is advisory.** `navigator.onLine` and a same-origin HEAD probe decide the offline notice; whether Föli answered decides what the board claims.
- **A saved place reveals an area.** Places are public stops, never an address, but a stop labelled Home still says roughly where someone lives. Share, import and print say this.
- **Two languages, not three.** Föli publishes Finnish, Swedish and English; the interface is Finnish and English. A service update Föli wrote only in Finnish shows in Finnish in the English interface.
- **No analytics, by design.** Nothing measures adoption or retention; the scores above are reviewers' judgement.

## Release gates

Every pull request to `master` runs:

1. ESLint, including the rule that JSX text must go through the translator
2. Vitest and Testing Library (512 tests, coverage ratchet 82 / 75 / 85 / 86), with a test that every phrase has a Finnish translation and every translation is still used
3. production build, PWA precache and install-sheet checks, and the bundle budget (600 KB)
4. the Föli API reference drift check
5. Playwright on Chromium, Firefox, mobile WebKit and Chromium mobile, with axe WCAG A/AA checks, a Finnish phone and worst-case mobile overflow
6. a Chromium PWA project that installs the real service worker and reopens offline
7. the README's and the install sheet's screenshots, taken by the same flows

## Product principle

The product should optimize for **truthful useful assistance**, not maximum feature count.

When the data does not prove something, the interface should say less.

When a dependency fails, the interface should preserve the smallest useful fallback.

When a child or newcomer is stressed, the primary action should require less interpretation than the normal expert flow.
