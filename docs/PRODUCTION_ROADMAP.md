# Production roadmap

**Baseline:** `master@7a76521aa71c`  
**Updated:** 2026-10-02  
**Purpose:** ordered PR-by-PR plan from the current production-grade baseline to a broadly promoted, multilingual and more capable Turku Departures without weakening the static, backendless, privacy-first architecture.

This roadmap is intentionally stricter than a feature wishlist. Each PR has a narrow purpose, explicit acceptance criteria and a test contract. Do not combine unrelated milestones merely to reduce PR count.

## Current baseline

Already implemented and considered part of the baseline:

- live + scheduled departure board with stale/unknown/cancelled states;
- service alerts, line filters, Nearby and destination-aware Nearby;
- saved Home / Work / School stops, backups, Get me Home and Show to driver;
- Ride Mode / Get-off alert with exact trip identity, route-order awareness, live SIRI, GPS fail-closed rules, persisted recovery and false-MISSED correction;
- direct Journey Assistant plus conservative one-transfer journeys;
- live revalidation of the committed second leg and explicit transfer recovery without silent auto-switching;
- PWA/offline shell, GitHub Pages deployment, CSP and backendless architecture gates;
- iPhone install discovery that never displaces an active departure board or Ride Mode;
- independent Android package ID `io.github.mykoladotsenko.turkudepartures`;
- debug APK E2E publication chain that publishes only the exact tested artifact;
- production Android APK/AAB signing workflow, gated on exact green master CI;
- runtime high/critical dependency audit, Android release invariants and dual raw/gzip bundle budgets;
- production direct address/POI search fail-closed by default, with official Turku journey-planner handoff;
- live Föli contract smoke after each master merge and daily.

Open planning work already exists in **PR #128 — Add Ukrainian interface implementation plan**. Treat it as the localization design input, not as the implementation itself.

## Non-negotiable PR rules

Every implementation PR must preserve these contracts:

1. **Static + backendless + privacy-first.**
   - no database;
   - no account/session backend;
   - no confidential browser secrets;
   - no analytics by default;
   - location remains local unless the user explicitly opens an external service.

2. **Ride Mode remains authoritative after boarding.**
   - no secondary card or install prompt may displace an urgent get-off action;
   - stale, schedule-only or ambiguous evidence may never create a stronger definitive claim;
   - no silent journey replacement.

3. **Fail closed.**
   - provider failure means unknown/degraded, not fabricated certainty;
   - unsupported routing means a truthful handoff, not invented directions.

4. **A PR is not done because its unit tests pass.**
   Depending on touched paths it must also satisfy:
   - coverage ratchet;
   - Chromium / Firefox / mobile WebKit / mobile Chromium;
   - axe WCAG A/AA;
   - 320–430 px and 200% text where UI changes;
   - PWA/offline verification where app-shell behaviour changes;
   - Android APK + emulator E2E where packaged payload/config changes;
   - docs and user-facing copy updated in the same PR.

5. **Prefer small mergeable PRs.**
   A PR should ideally change one product invariant. If a review discovers a different defect, fix it in a follow-up unless the defect blocks the current invariant.

---

# Track A — public-launch blockers

These come before major feature expansion.

## PR-A01 — Custom-domain migration contract

**Priority:** 100/100  
**Dependency:** owner chooses and controls the final domain.

### Scope

- add the final `CNAME`;
- update manifest `start_url`, canonical/share metadata and public links if required;
- document the origin migration explicitly;
- verify base-path/service-worker behaviour on the new origin;
- keep the GitHub Pages project-path deployment usable until cutover is confirmed;
- add a migration notice/export path for local state that cannot move cross-origin automatically.

### Important constraint

Browser storage cannot be migrated automatically between `github.io` and a new domain. Do not imply otherwise.

### Acceptance

- final domain serves the exact green production build over HTTPS;
- installability and offline reopen work on the new origin;
- saved-place/favourite export/import path is documented and tested;
- no public link in README/manifest/share metadata points to the retired origin after cutover;
- rollback procedure is documented.

### Tests

- base-path/canonical URL build tests;
- real service-worker PWA install/offline E2E on the final origin;
- link/reference consistency gate.

---

## PR-A02 — Complete local-state backup for origin migration

**Priority:** 96/100  
**Dependency:** can be implemented before A01; should merge before domain cutover.

### Scope

Create one privacy-preserving export/import format for all user-owned local state that matters across an origin change:

- saved places and backup stops;
- favourite stops;
- line filters/preferences where meaningful;
- language/theme preferences if safe and useful.

Do **not** export transient Ride Mode/live journey state.

### Acceptance

- export contains no GPS coordinates, live ride telemetry or hidden browser identifiers;
- import is versioned, schema-validated and fail-closed;
- partial/old imports never erase valid current state;
- user can inspect what will be imported before confirmation.

### Tests

- schema/version migrations;
- malformed/tampered input;
- duplicate merge semantics;
- Finnish/English UI;
- 320 px + 200% text.

---

## PR-A03 — Field-validation support bundle

**Priority:** 100/100  
**Dependency:** none.

### Scope

Add a **local, user-triggered field-test report** for Ride Mode/Journey Assistant that can be copied/downloaded after a test ride.

Include only non-sensitive debugging evidence such as:

- app/build version;
- route/stop/trip identifiers already public;
- stage transitions and their evidence class;
- whether SIRI/GPS was fresh/stale/unknown;
- transfer revalidation state;
- provider failures.

Exclude:

- raw GPS coordinates;
- saved Home/Work/School labels;
- device advertising IDs;
- unrelated browsing/storage data.

### Acceptance

- nothing is sent automatically;
- report generation is explicit;
- report can reproduce enough state to diagnose false STOP/NOW/MISSED behaviour;
- privacy copy states exactly what the report contains.

### Tests

- no coordinate leakage;
- no saved-place leakage;
- deterministic report serialization;
- restored Ride Mode;
- transfer recovery cases.

---

## PR-A04 — Real-bus validation remediation

**Priority:** 100/100  
**Dependency:** A03 preferred.

**This PR is created only after the manual rides in `FIELD_VALIDATION.md`.**

### Scope

Fix every reproducible issue found during:

- 5+ direct rides;
- 5+ one-transfer rides;
- 5+ degraded/recovery scenarios;
- physical Android and iPhone;
- city-centre GPS and normal suburban segments.

### Merge rule

Do not merge a “validation complete” PR with unresolved safety defects. A reproducible false definitive instruction is a release blocker.

### Required evidence

- field matrix attached to the PR;
- before/after scenario for each code change;
- deterministic regression test for every discovered bug.

---

## PR-A05 — Native Finnish safety-copy review

**Priority:** 98/100  
**Dependency:** native Finnish reviewer.

### Scope

Review and remediate, in this order:

1. Get ready;
2. Press STOP;
3. Get off now;
4. MISSED recovery;
5. transfer catchability/recovery;
6. degraded/stale/provider-error copy;
7. speech strings;
8. Show to driver.

### Acceptance

- no translated-English phrasing in safety-critical copy;
- imperative strength matches actual certainty;
- stop names are not incorrectly inflected;
- spoken copy is understandable at normal phone speech speed;
- every changed phrase remains covered by locale completeness/unused-string tests.

---

## PR-A06 — Manual VoiceOver + TalkBack remediation

**Priority:** 96/100  
**Dependency:** physical iPhone + Android.

### Scope

Run the release flows with VoiceOver and TalkBack and fix:

- focus order;
- focus restoration after dialogs;
- announcement duplication;
- inaccessible stage changes;
- ambiguous buttons;
- active Ride Mode priority;
- transfer recovery focus;
- saved-place setup.

### Acceptance

A passenger can complete these without sight:

- open a stop;
- understand the next departure;
- start/stop a get-off alert;
- hear STOP/NOW changes;
- recover from MISSED;
- choose an explicit replacement after a broken transfer;
- save Home;
- use Get me Home.

---

## PR-A07 — Master protection / repository governance

**Priority:** 94/100  
**Dependency:** owner/admin GitHub settings; current connector cannot enforce it.

### Owner-side settings

- require PR before merge;
- require current CI checks;
- disallow force-push/delete on `master`;
- require branch to be up to date if that remains practical;
- restrict environment secrets for `android-production`;
- require manual approval for production signing if desired.

### Repo-side addition

Add a short `docs/REPOSITORY_GOVERNANCE.md` that names the required checks/settings so the configuration is auditable.

---

## PR-A08 — Android production signing dry run

**Priority:** 100/100 for Android production release  
**Dependency:** owner creates long-lived signing key and protected secrets.

### Scope

No new signing implementation should be invented; the workflow already exists.

Run it with:

- production keystore;
- protected `android-production` environment;
- `publish=false`;
- candidate version code/name.

### Acceptance

- exact signed APK installs on emulator;
- AAB and APK signatures verify;
- certificate fingerprint is recorded in secure release documentation;
- checksum artifacts exist;
- package ID is unchanged;
- no key material appears in logs/artifacts.

---

## PR-A09 — Android v1.0.0 immutable release

**Priority:** 98/100  
**Dependency:** A08 + physical Android smoke.

### Scope

- run production release with `publish=true`;
- create immutable `v1.0.0`;
- install over the previous production-signed candidate;
- verify local data survives upgrade.

### Acceptance

- version code monotonic;
- exact signed APK was emulator-tested before publication;
- AAB/APK/checksum match workflow outputs;
- favourites/places survive upgrade;
- Ride Mode starts and exits;
- native address/POI handoff remains fail-closed.

---

## PR-A10 — Final public-release re-audit

**Priority:** 100/100  
**Dependency:** A01, A04, A05, A06; Android items if Android is launched simultaneously.

### Scope

Re-run the full product audit instead of editing old scores by intuition.

### Re-score

- Ride Mode;
- board/search/service updates;
- My Places;
- Journey Assistant;
- phone ergonomics;
- Finnish copy;
- accessibility;
- first run/install;
- trust/privacy;
- public marketing surface.

### Acceptance

- audit date reflects the tested build;
- every score cites a real tested state;
- no stale “still open” item that is already implemented;
- release checklist links to evidence.

---

# Track B — localization

## PR-B00 — Merge PR #128 localization design

**Priority:** 82/100  
**Status:** already open as PR #128.

Merge it only if it remains documentation/design-only and current with `master`.

---

## PR-B01 — Generalize locale registry

**Priority:** 86/100  
**Dependency:** B00.

### Scope

Remove Finnish-specific assumptions from locale plumbing:

- registry of enabled locales;
- language detection;
- persistence;
- locale-specific number/time formatting;
- locale-specific speech language;
- plural-rule helper;
- completeness/unused-string tests iterate all enabled locales.

### Acceptance

English and Finnish behaviour is byte-for-byte/user-equivalent unless intentionally documented.

---

## PR-B02 — Ukrainian safety-critical locale

**Priority:** 84/100  
**Dependency:** B01.

Translate and review first:

- Ride Mode stages;
- STOP/NOW/MISSED;
- transfer revalidation/recovery;
- offline/degraded/provider errors;
- permission explanations;
- safety confirmations.

Do not expose the locale publicly yet.

---

## PR-B03 — Ukrainian full interface

**Priority:** 80/100  
**Dependency:** B02.

Complete:

- board/search;
- Journey Assistant;
- Places/Home recovery;
- alerts;
- help/privacy/about;
- install/offline/PWA;
- Android-facing web UI.

Provider-owned stop/destination/service text remains provider text.

---

## PR-B04 — Ukrainian QA and enablement

**Priority:** 82/100  
**Dependency:** B03 + native Ukrainian review.

### Required matrix

- 320/360/412 px;
- 200% text;
- dark theme;
- Chromium + mobile WebKit;
- PWA/offline;
- Android smoke;
- axe;
- speech pronunciation review.

Only this PR adds Ukrainian to the visible language selector.

---

## PR-B05 — Swedish dictionary

**Priority:** 76/100  
**Dependency:** B01.

Use the generalized locale infrastructure. Keep provider-owned Swedish text separate from UI translation.

---

## PR-B06 — Swedish QA and enablement

**Priority:** 78/100  
**Dependency:** B05 + native Swedish review.

Same enablement rule as Ukrainian: complete dictionary + mobile/accessibility review before exposing the selector.

---

# Track C — UX, performance and operational polish

## PR-C01 — Exact vs approximate “Next stops” time semantics

**Priority:** 72/100

### Problem

The UI intentionally mixes exact timepoints with approximate non-timepoints. The data semantics are correct, but the visual language is not self-explanatory.

### Scope

- preserve Föli/GTFS truth;
- make exact vs approximate meaning visually consistent;
- do not manufacture precision.

### Acceptance

A first-time passenger can tell why one time says “around” and another does not.

---

## PR-C02 — Bundle headroom reduction

**Priority:** 84/100

Current budgets are intentionally strict. Reduce actual runtime footprint before another major feature wave.

### Target

Aim for approximately:

- **< 560 KB raw JS/CSS**
- **< 155 KB deterministic gzip**

without weakening functionality.

### Work

- dependency graph audit;
- dead CSS removal;
- dead translation/code paths;
- repeated constants/copy structures;
- large optional UI modules;
- avoid adding a dependency merely to save source lines.

### Acceptance

- both bundle budgets gain meaningful headroom;
- no higher CPU/startup cost hidden behind smaller transfer bytes;
- mobile first interaction remains stable.

---

## PR-C03 — External health alerting without user analytics

**Priority:** 78/100

The live Föli smoke exists. Improve operator awareness without collecting passenger data.

### Scope

- workflow summary with failing contract;
- optional deduplicated GitHub issue only after sustained failure;
- automatic close/update on recovery;
- no passenger telemetry.

### Acceptance

A transient single upstream failure does not spam issues or block deploying an app fix.

---

## PR-C04 — Tighten dormant provider CSP boundary

**Priority:** 82/100  
**Dependency:** production place-search policy remains disabled.

### Scope

Evaluate removing public Nominatim from production `connect-src`.

If removed, future direct-provider activation must deliberately change:

- runtime policy;
- CSP;
- provider review;
- tests.

### Acceptance

Production cannot contact the dormant provider even if a UI bug attempts to.

---

## PR-C05 — Final dependency/toolchain refresh

**Priority:** 68/100

Upgrade only packages with supported peer ranges. Do not force unsupported ESLint/plugin combinations.

### Acceptance

- no `--force` or `--legacy-peer-deps`;
- CI unchanged or stronger;
- runtime vulnerability gate stays green.

---

## PR-C06 — Release notes / version identity in UI

**Priority:** 66/100

Expose a small build/version identifier in About & privacy / diagnostics so field reports can name the exact release without adding analytics.

---

# Track D — Journey Assistant expansion

Do not start this track until Track A safety/manual blockers are substantially closed. Feature breadth must not outrun field trust.

## PR-D01 — Generalized N-leg itinerary model

**Priority:** 88/100  
**Risk:** high.

### Scope

Refactor the current direct/one-transfer representation into a generic ordered itinerary model while preserving existing behaviour.

### Acceptance

- existing direct and one-transfer snapshots remain equivalent;
- each leg retains concrete trip/stop occurrence identity;
- Ride Mode still owns the currently boarded leg;
- no UI change required in this PR.

---

## PR-D02 — Bounded two-transfer topology search

**Priority:** 78/100  
**Dependency:** D01.

### Scope

Add **at most two transfers**, with hard caps for:

- candidate stops;
- candidate trips;
- walking radius;
- transfer buffer;
- search time.

### Acceptance

- no unbounded combinatorial search;
- direct > one-transfer > two-transfer preference remains understandable;
- unreliable connection is not recommended.

---

## PR-D03 — Multi-leg Active Journey orchestration

**Priority:** 82/100  
**Dependency:** D02.

### Scope

Generalize:

`leg 1 → transfer → leg 2 → transfer → leg 3 → final walk`.

Urgent current-leg instructions always outrank future-leg information.

---

## PR-D04 — Future-leg live revalidation

**Priority:** 90/100  
**Dependency:** D03.

Each committed future transit leg gets the same conservative principles already proven for the second leg:

- exact run matching;
- fresh-only SIRI;
- cancellation;
- disappearance confirmation;
- early/delay catchability;
- provider failure = unknown;
- no silent itinerary switch.

---

## PR-D05 — Recovery that may include one more transfer

**Priority:** 86/100  
**Dependency:** D04.

Current recovery deliberately returns bounded direct replacements. Extend it only after multi-leg orchestration is reliable.

### Acceptance

Recovery search itself remains bounded and explicit. Passenger chooses the replacement.

---

## PR-D06 — Leave-at / arrive-by

**Priority:** 80/100  
**Dependency:** generic itinerary timing model from D01.

### Scope

- leave now;
- leave at;
- arrive by.

### Acceptance

Time-zone/day-boundary/after-midnight GTFS cases are deterministic and tested.

---

## PR-D07 — Routing preferences

**Priority:** 70/100  
**Dependency:** D06 recommended.

Start with a small set:

- fewer transfers;
- less walking;
- larger transfer buffer.

Do not expose preferences that the routing engine cannot faithfully honor.

---

## PR-D08 — Entrance-aware POI destination

**Priority:** 64/100

Improve large malls/hospitals/campuses where centroid routing is misleading.

### Constraint

No confidential-key provider. If entrance data cannot be obtained reliably in the static architecture, keep honest external handoff.

---

## PR-D09 — Pedestrian-routing feasibility spike

**Priority:** 55/100

This is a **research PR**, not a promise to ship turn-by-turn walking.

Evaluate:

- static/open pedestrian graph size;
- public browser-safe routing APIs;
- CORS/terms/rate limits;
- accessibility/entrance quality;
- offline implications.

### Decision rule

If no provider/data path meets the privacy/backendless/reliability contract, explicitly keep approximate walking + external maps. “Not implemented” is preferable to false precision.

---

# Track E — optional native/background Phase 2

These are not v1 blockers and may intentionally change product architecture.

## PR-E01 — Android foreground Ride Mode feasibility

**Priority:** 60/100  
**Architecture impact:** medium/high.

Research whether the Capacitor Android wrapper can keep a native foreground service for active Ride Mode while preserving:

- no backend;
- explicit user consent;
- visible persistent notification;
- battery-responsible behaviour.

Do not claim lock-screen guarantees until physical-device testing proves them.

---

## PR-E02 — Native Android active-ride bridge

**Priority:** 58/100  
**Dependency:** E01 approves the approach.

Bridge only the minimum state needed for an active ride. Do not migrate general app state into native storage without reason.

---

## PR-E03 — Google Play release surface

**Priority:** 62/100  
**Dependency:** A09.

### Scope

- store listing;
- screenshots;
- privacy/data-safety answers;
- support/contact links;
- AAB upload procedure;
- release notes.

No tracker/SDK is added merely for store presence.

---

# Intentionally not planned as “missing features”

These should not become accidental backlog items:

- **Guaranteed browser lock-screen alert** — browsers can suspend pages; solving this requires a different architecture. The web app must keep stating the limitation.
- **Analytics / retention tracking** — intentionally absent for privacy. Add only after a separate product/privacy decision.
- **Ticketing/payment** — outside the product.
- **A private proxy just to hide a public API key** — violates the current backendless contract.
- **Automatic cross-origin storage migration** — browsers intentionally prevent it.
- **Translating provider-owned stop names/service text** — preserve source data.

---

# Recommended merge order

## Release-critical sequence

1. **PR #128** — localization design docs, if still current.
2. **PR-A02** — full local-state backup/import.
3. **PR-A03** — field-validation support bundle.
4. **Manual field rides → PR-A04** — remediation.
5. **PR-A05** — native Finnish safety-copy remediation.
6. **PR-A06** — VoiceOver/TalkBack remediation.
7. **PR-A01** — final domain cutover once owner chooses domain.
8. **PR-A07** — branch/environment governance.
9. **PR-A08** — Android production-signing dry run.
10. **PR-A09** — immutable Android v1.0.0.
11. **PR-A10** — full public-release re-audit.

## Then quality/localization

12. **PR-C04** — tighten dormant provider CSP.
13. **PR-C02** — recover bundle headroom.
14. **PR-C01/C03/C05/C06** — smaller polish/operations.
15. **PR-B01 → B04** — Ukrainian implementation and enablement.
16. **PR-B05 → B06** — Swedish.

## Then routing expansion

17. **PR-D01 → D05** — generalized multi-leg + live safety/recovery.
18. **PR-D06 → D08** — time controls/preferences/POI.
19. **PR-D09** — walking-routing decision.
20. Optional **Track E** only after v1 is stable in real use.

---

# Definition of “production ready”

## Web/PWA public promotion

All must be true:

- master CI and production deploy green;
- live Föli contract smoke healthy or a known upstream incident is documented;
- real-bus validation complete;
- native Finnish review complete;
- VoiceOver/TalkBack smoke complete;
- final domain chosen and tested;
- direct public place-search policy remains fail-closed or has a separately approved provider arrangement;
- no known reproducible unsafe Ride Mode/transfer instruction;
- final re-audit complete.

## Android production release

In addition:

- protected production signing secrets configured;
- signed release dry run green;
- physical upgrade test green;
- immutable versioned APK/AAB release published;
- package ID and signing certificate stable.

## Feature expansion readiness

Only after the public-release safety gates are healthy should 2+ transfer routing or native background work become the top engineering priority.
