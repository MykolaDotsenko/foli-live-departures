# Production readiness

This is the canonical launch checklist for Turku Departures.

## Current automated state — 2026-10-03

The numbered roadmap implementation count remains **24/47**. That count is a
feature-plan measure, not a quality score: later work deliberately hardened the
already-implemented product without pretending bug fixes were new roadmap
features.

Track E remains separate from the 47-item count:

- PR #144 merged the Android foreground Ride Mode feasibility/bridge work;
- PR #145 merged the repository-owned Google Play listing/privacy/Data Safety
  and API-36 release surface;
- PRs #149–#152 hardened physical-occurrence identity, Ride continuation and
  cross-tab persistence, notification cleanup/permission races, transfer-leg
  hysteresis, destination-aware polling freshness, rolling timetable horizons
  and scheduled journey-time expiry.

The latest verified application-code baseline passes:

- **120/120 test files and 1305/1305 tests**;
- coverage: **88.83% statements / 81.29% branches / 90.8% functions / 91.49% lines**;
- complete shipped JS/CSS: **609,579 raw / 172,389 gzip bytes** vs unchanged
  **625,000 / 180,000** limits;
- locale packs: **177,609 raw / 45,505 gzip bytes** vs unchanged
  **180,000 / 55,000** aggregate limits;
- zero runtime npm vulnerability findings at the configured high/critical gate;
- green master CI, cross-browser/accessibility, Android APK build/E2E, live
  Föli contract smoke, tested APK publication and production Pages deployment
  with exact-revision smoke.

English, Finnish, Ukrainian and Swedish are implemented. Automation still does
**not** close native-language, physical-device, real-bus, custom-domain,
production-signing, physical-upgrade or Play Console review gates. The
machine-checked ledger currently keeps all **14 manual gates** open until dated
human/owner evidence exists.

## Release classes

### Quiet web/PWA release

May ship when:

- `master` CI is green;
- production Pages deploy is green, including the exact-revision post-deploy live smoke;
- the latest live Föli contract smoke is green (it runs after every master push and daily);
- there is no known safety regression in Ride Mode or transfer recovery.

This class is appropriate for controlled use and field validation.

### Public / city-wide promotion

Do not promote broadly until all of these are explicitly closed:

- [ ] real-bus field validation in [FIELD_VALIDATION.md](FIELD_VALIDATION.md);
- [ ] native Finnish review in [FINNISH_NATIVE_REVIEW.md](FINNISH_NATIVE_REVIEW.md);
- [ ] custom production domain is chosen and configured before significant installs/favourites are accumulated on the GitHub Pages origin; complete local-state backup/export-import is already available for the unavoidable cross-origin migration;
- [x] web place-search policy is fail-closed for broad promotion: `public/place-search-config.json` disables direct address/POI lookup by default, and the app hands off to the official Turku journey planner; CI prevents accidental re-enabling without an explicit policy change;
- [ ] representative physical iPhone and Android lifecycle checks are complete;
- [ ] TalkBack and VoiceOver manual smoke checks are complete.

## Automated gates

Every pull request to `master` must prove:

- runtime dependencies have no high/critical npm audit finding;
- lint and strict JS/type checks pass;
- architecture remains static, backendless and privacy-first;
- workflow actions remain immutable-SHA pinned;
- production place-search policy stays fail-closed unless deliberately reviewed;
- Android production identity/release invariants remain intact;
- the Google Play listing/privacy/Data Safety/asset contract stays internally consistent;
- generated Android builds keep the current API-36 Play target and do not gain background-location permission;
- unit/integration coverage meets the repository ratchet;
- PWA precache, CSP and bundle budget pass;
- Chromium, Firefox, mobile WebKit and mobile Chromium E2E/accessibility pass.

Production publication paths additionally verify that the exact candidate SHA
is the merge commit of a GitHub pull request merged into `master`; a direct
push with green CI is not sufficient release provenance.

Production Pages deployment is downstream of successful `master` CI. Its artifact is stamped with the exact CI SHA. The privileged deploy job runs only the pinned Pages deployment action; repository code is then checked out in a separate read-only smoke job, and the workflow is not green until that smoke verifies the exact revision plus the HTML entrypoint, module asset, manifest, service worker, fail-closed place-search policy and public Play privacy-policy disclosures. The live Föli contract smoke is deliberately a separate health signal: it runs after every master push and daily, but a transient external Föli outage does not block deploying an application fix.

### Redeploying the current revision

To redeploy an unchanged current `master`, re-run the successful `master` CI
workflow. Its fresh successful completion triggers a **new** downstream
`Deploy production site` workflow and therefore a single fresh
`github-pages` artifact.

Do **not** re-run the completed deploy workflow's `build` job as the normal
redeploy mechanism. GitHub keeps artifacts from the earlier attempt; another
`upload-pages-artifact` in the same workflow run can leave two artifacts named
`github-pages`, and `deploy-pages` then fails closed because it cannot choose
between them. This operational limitation does not alter the already deployed
site, but the CI-triggered path is the supported idempotent redeploy procedure.

## Android

The continuously published `android-latest` artifact is a debug-signed testing/sideload build.

A production Android release additionally requires:

- `publish=false` remains available for the signing dry run while manual gates are open;
- `publish=true` is blocked unless the machine-checked `android-publish` manual-evidence profile is closed;
- protected `android-production` environment;
- persistent signing key and secrets, exposed only to the validation/decode/signing steps and cleaned from the runner immediately after signing;
- unique monotonically increasing version code, checked against the complete published production-release history;
- semantic version name;
- generated compile/target API 36 verification with no `ACCESS_BACKGROUND_LOCATION`;
- production release workflow success;
- exact signed APK emulator verification;
- immutable versioned GitHub release.

Google Play distribution additionally requires final Play Console/Data Safety
review, the exact verified AAB uploaded to Internal testing, Play-distributed
physical install/upgrade evidence and resolution of Play pre-launch/policy
findings before promotion. Repository automation prepares and verifies the
release surface; it does not claim those owner-side steps are complete.

See [ANDROID_RELEASE.md](ANDROID_RELEASE.md) and [../play/README.md](../play/README.md).

## Release-candidate evidence ledger

Manual release gates are tracked in `config/release-gates.json` and checked by `npm run verify:release-readiness`. Automation validates the ledger shape but cannot close physical/native/domain/Play gates without dated evidence. The production origin/base path is versioned in `config/production-site.json`; see [DOMAIN_CUTOVER.md](DOMAIN_CUTOVER.md).

## Pre-field completion policy

Real-bus validation begins only after the planned product scope is implemented
and automated/device gates are green. The current Journey Assistant source of
truth supports direct journeys plus bounded itineraries with up to two
transfers; each committed future transit leg is revalidated independently from
fresh live data, and Ride Mode remains authoritative for the boarded leg.

Routing/recovery through two transfers, leave-at/arrive-by, routing
preferences, entrance-aware destination handling, the pedestrian-routing
production boundary, Ukrainian and Swedish locale implementation/automated QA,
exact-vs-approximate Next-stops semantics, telemetry-free health alerting, the
dormant-provider CSP boundary and the supported toolchain refresh are implemented
through PR #142. PR #144 adds the automated Android foreground Ride Mode
companion without changing JS Ride Mode authority; PR #145 prepares the
repository-owned Google Play listing/privacy/asset surface. PRs #149–#152 add
the latest reliability hardening: service-date/loop physical-occurrence
matching, durable Ride continuation without cross-tab rollback, serialized
notification cleanup scoped to the active ride, transfer evidence isolated by
leg identity, scheduled transfer search that preserves later occurrences of the
same GTFS trip, fresh walking-distance inputs on recurring Journey Assistant
polls, bounded refresh for an empty timetable horizon and live expiry of custom
leave-at/arrive-by targets.

Stop Radar adds lazy-loaded on-device walking guidance to nearby public stops
with trustworthy compass, recent direction-of-travel and north-up fallbacks.
Changing the radar target never changes the board or itinerary unless the
passenger explicitly opens that target stop.


Remaining pre-field work is dominated by explicit manual evidence: native
Finnish/Ukrainian/Swedish review, physical VoiceOver/TalkBack and Android/iPhone
lifecycle/background checks, real-bus validation, final custom-domain cutover,
production signing/upgrade evidence and actual Play Console upload/review.
Those gates remain open until they are actually performed.

## Architectural limits, not unfinished work

- browser background execution is not guaranteed; the backendless web/PWA
  therefore does not promise guaranteed lock-screen get-off alerts;
- walking may hand off externally if the dedicated pedestrian-routing
  feasibility work proves that no reliable backendless production path exists;
  the app must never invent turn-by-turn precision it cannot support.

## Owner-side repository check

The repository API available to automated review cannot confirm classic branch-protection settings. Before broad promotion, verify in GitHub that `master` requires the intended CI checks and cannot be force-pushed or deleted accidentally.
