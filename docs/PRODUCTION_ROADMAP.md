# Production roadmap

**Planning baseline:** rolling `master`; implementation state and verification state are tracked separately, and exact revisions are recorded by CI/deployment metadata  
**Updated:** 2026-10-02  
**Purpose:** ordered PR-by-PR plan from the current production-grade baseline to a broadly promoted, multilingual and more capable Turku Departures without weakening the static, backendless, privacy-first architecture.

This roadmap is intentionally stricter than a feature wishlist. Each PR has a narrow purpose, explicit acceptance criteria and a test contract. Do not combine unrelated milestones merely to reduce PR count.

## Current baseline

Already implemented and considered part of the baseline:

- live + scheduled departure board with stale/unknown/cancelled states;
- service alerts, line filters, Nearby and destination-aware Nearby;
- saved Home / Work / School stops, backups, Get me Home and Show to driver;
- Ride Mode / Get-off alert with exact trip identity, route-order awareness, live SIRI, GPS fail-closed rules, persisted recovery and false-MISSED correction;
- direct Journey Assistant plus bounded itineraries with up to two transfers;
- generic ordered itinerary state, multi-leg Active Journey orchestration and fresh live revalidation of every committed future transit leg;
- explicit bounded recovery that may include another transfer, while preserving the destination and requiring the passenger to choose any replacement;
- PWA/offline shell, GitHub Pages deployment, CSP and backendless architecture gates;
- iPhone install discovery that never displaces an active departure board or Ride Mode;
- independent Android package ID `io.github.mykoladotsenko.turkudepartures`;
- debug APK E2E publication chain that publishes only the exact tested artifact;
- production Android APK/AAB signing workflow, gated on exact green master CI;
- runtime high/critical dependency audit, Android release invariants and dual raw/gzip bundle budgets;
- production direct address/POI search fail-closed by default, with official Turku journey-planner handoff;
- leave-now / leave-at / arrive-by controls with deterministic day-boundary handling;
- routing preferences for fewer transfers, less walking and larger transfer buffer;
- entrance-aware destination normalization where trustworthy provider geometry is available, with fail-closed centroid/external-handoff fallback;
- an explicit pedestrian-routing production decision: no unverified turn-by-turn routing is fabricated in the backendless client;
- generic locale registry with lazy dictionaries and Ukrainian (`uk-UA`) implementation across the passenger UI;
- live Föli contract smoke after each master merge and daily.

PR #137 (batch 1), PR #139 (batch 2) and the bundle-headroom slice in PR #140 are merged. The implementation count is therefore **17/47**: items 1–16 plus item 21. Verification remains deliberately separate. The current `master` merge SHA `4f88d851e5eb5ebf0fab555e8725551a209f893e` has green CI including cross-browser/accessibility, bundle/PWA/CSP, Android build/E2E, live Föli smoke, tested Android APK publication and production Pages deployment with exact-revision smoke. The verified PR payload is **578,177 raw / 161,897 gzip JS/CSS bytes** against unchanged **625,000 / 180,000** limits.

The Ukrainian localization implementation is present in code and currently reachable through the locale registry/language switch for pre-field testing. Native-language, physical-device accessibility and speech review remain explicit manual release gates; they are not inferred from the presence of the dictionary.

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

**Implementation status:** implemented on `master` with versioned, privacy-safe export/import and browser regression coverage.

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

**Implementation status (PR #137):** implemented and merged; the report remains local/user-triggered and excludes raw coordinates/saved-place labels.

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

**Implementation status (PR #137):** repository-side governance contract is implemented. The actual owner/admin branch-protection settings remain an explicit manual blocker because the connected GitHub app cannot verify or enforce them.

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

## PR-B00 — Ukrainian localization design contract

**Priority:** 82/100  
**Status:** complete on `master`.

The design contract is now accompanied by the implementation from PR #139. Remaining work is QA/review and release hardening, not initial dictionary creation.

---

## PR-B01 — Generalize locale registry

**Implementation status (PR #139): implemented and merged.**

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

**Implementation status (PR #139): implemented and merged; native-language/speech review remains manual.**

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

**Implementation status (PR #139): implemented and merged; broad-release QA is not yet closed.**

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

PR #139 already made Ukrainian reachable through the generic pre-field language switch so the full flow can be exercised. This item now owns the automated QA hardening and release-readiness evidence; native-language/physical-device accessibility/speech review remains a later manual gate and is not marked complete here.

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
**Implementation status (PR #140): blocker fixed and merged; further optimization remains useful.**

PR #140 restored the unchanged complete-app gate by moving canonical FI/UK
string translations into generated same-origin lazy JSON packs while keeping
function-valued plural/count grammar in small lazy runtime modules. The build
also added independent locale-pack raw/gzip budgets so this optimization cannot
hide unbounded translation growth.

Current verified PR measurements:

- complete shipped JS/CSS: **578,177 raw / 161,897 gzip bytes**;
- JS/CSS limits: **625,000 / 180,000**;
- FI/UK locale packs: **161,165 raw / 43,526 gzip bytes**;
- locale-pack limits: **180,000 / 55,000**.

The original budgets remain intentionally strict. Continue reducing actual
runtime footprint before another major feature wave.

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

- [x] both complete-app JS/CSS budgets regain meaningful headroom without being raised;
- [x] moved locale payload has its own explicit raw/gzip budget;
- [x] canonical dictionaries remain the source of truth and generated packs fail closed on invalid loading;
- [x] mobile/browser/Android regression suites pass on the exact PR head;
- [ ] continue toward the stretch target below without increasing CPU/startup cost.

The approximate **<560 KB raw / <155 KB gzip** target remains a stretch target,
not a release gate; PR #140 restored release headroom but did not yet reach it.

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

Under the current pre-field policy, planned product breadth is completed before
real-bus validation. Expansion still must preserve the same fail-closed safety
contracts and may not weaken Ride Mode authority.

## PR-D01 — Generalized N-leg itinerary model

**Implementation status (PR #137): implemented and merged in pre-field batch 1. The current master still contains the implementation; release verification remains governed by the current exact-SHA gates.**

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

**Implementation status (PR #137): implemented and merged in pre-field batch 1. The current master still contains the implementation; release verification remains governed by the current exact-SHA gates.**

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

**Implementation status (PR #137): implemented and merged in pre-field batch 1. The current master still contains the implementation; release verification remains governed by the current exact-SHA gates.**

**Priority:** 82/100  
**Dependency:** D02.

### Scope

Generalize:

`leg 1 → transfer → leg 2 → transfer → leg 3 → final walk`.

Urgent current-leg instructions always outrank future-leg information.

---

## PR-D04 — Future-leg live revalidation

**Implementation status (PR #137): implemented and merged in pre-field batch 1. The current master still contains the implementation; release verification remains governed by the current exact-SHA gates.**

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

**Implementation status (PR #139): implemented and merged in pre-field batch 2.**

**Priority:** 86/100  
**Dependency:** D04.

Recovery is now generalized: it remains bounded and explicit and may offer one additional transfer when needed. The destination is preserved and the passenger must explicitly choose any replacement.

### Acceptance

Recovery search itself remains bounded and explicit. Passenger chooses the replacement.

---

## PR-D06 — Leave-at / arrive-by

**Implementation status (PR #139): implemented and merged in pre-field batch 2.**

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

**Implementation status (PR #139): implemented and merged in pre-field batch 2.**

**Priority:** 70/100  
**Dependency:** D06 recommended.

Start with a small set:

- fewer transfers;
- less walking;
- larger transfer buffer.

Do not expose preferences that the routing engine cannot faithfully honor.

---

## PR-D08 — Entrance-aware POI destination

**Implementation status (PR #139): implemented within the trustworthy provider geometry available to the static client, with fail-closed fallback.**

**Priority:** 64/100

Improve large malls/hospitals/campuses where centroid routing is misleading.

### Constraint

No confidential-key provider. If entrance data cannot be obtained reliably in the static architecture, keep honest external handoff.

---

## PR-D09 — Pedestrian-routing feasibility spike

**Implementation status (PR #139): production boundary decided. The app keeps approximate walking plus explicit external handoff rather than shipping unverified client-side turn-by-turn routing.**

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

# Current pre-field execution order

The current project policy supersedes the older “field first, expansion later”
sequence: real-bus rides are the final acceptance layer after the planned
product is complete.

Work is merged in verified batches of eight checklist items:

1. **Batch 1 / PR #137:** release provenance, Android release monotonicity,
   repository-governance contract, privacy-safe field diagnostics, generalized
   itinerary model, bounded two-transfer search, multi-leg Active Journey and
   future-leg live revalidation.
2. **Batch 2 / PR #139:** multi-leg recovery, leave-now/leave-at/arrive-by,
   routing preferences, entrance-aware destinations, pedestrian-routing
   production boundary, generic locale architecture, Ukrainian safety layer
   and full Ukrainian UI. The implementation is merged.
3. **Batch 3 / items 17–24:** Ukrainian automated QA/enablement hardening,
   Swedish dictionary, Swedish QA/enablement hardening, exact-vs-approximate
   Next-stops semantics, bundle headroom restoration, external health alerting
   without passenger analytics, dormant-provider CSP tightening, and the final
   supported dependency/toolchain refresh. **Item 21 is implemented in PR
   #140 and post-merge verified on `4f88d851e5eb5ebf0fab555e8725551a209f893e`.**
   Items 17–20 and 22–24 remain open; PR #140 also added useful locale-loader
   regression coverage and a browser locale-cycle check, but that partial QA
   work does not by itself close item 17.
4. Later batches cover release/version identity polish, Android native
   background feasibility/implementation, physical-device accessibility and
   language review, domain/Play/release readiness and the final pre-field audit.
5. Freeze one exact release-candidate SHA only after all planned pre-field
   gates are closed.
6. Run real-bus validation after that freeze; subsequent changes are remediation
   fixes with deterministic regression coverage, not new feature scope.

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

Two-transfer routing is now part of the pre-field baseline. Native background work remains a later pre-field batch and must not weaken the static/backendless web architecture.
