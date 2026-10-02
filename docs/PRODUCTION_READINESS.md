# Production readiness

This is the canonical launch checklist for Turku Departures.

## Current automated state — 2026-10-02

PR #142 completes checklist items **1–24**, so the numbered implementation
progress remains **24/47**. Track E is tracked separately from that count:
PR #144 merged the Android foreground Ride Mode feasibility/bridge work (E01/E02),
and PR #145 adds the automated Google Play release surface (E03).

PR #142's supported toolchain-refresh verification measured:

- complete shipped JS/CSS: **580,581 raw / 162,788 gzip bytes** vs unchanged
  **625,000 / 180,000** limits;
- shared-key + FI/UK/SV locale data stayed inside the unchanged
  **180,000 raw / 55,000 gzip** aggregate limits;
- zero runtime npm vulnerability findings at the configured high/critical gate.

PR #144 was merged only after exact-head CI/browser QA, installable APK and
API-35 emulator foreground-service lifecycle checks were green; its exact merge
SHA then passed master CI, Android APK/E2E, live Föli smoke, production Pages
deployment and exact-revision live smoke. This automated evidence does **not**
close physical screen-off/lock-screen/OEM-battery acceptance.

PR #145 is merge-gated on the same exact-head CI/browser/Android path. It adds
the public privacy-policy surface, conservative Data Safety worksheet, verified
Play listing/contact/release-note contracts, reproducible store graphics and an
API-36 generated-Android target check. Play Console publication, Data Safety
final submission, native-language listing review, production signing, physical
upgrade testing and track promotion remain manual evidence.

No automated check closes native-language, physical-device, real-bus,
custom-domain or production-signing gates.

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

## Android

The continuously published `android-latest` artifact is a debug-signed testing/sideload build.

A production Android release additionally requires:

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
repository-owned Google Play listing/privacy/asset surface.

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
