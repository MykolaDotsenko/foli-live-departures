# Production readiness

This is the canonical launch checklist for Turku Departures.

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
- unit/integration coverage meets the repository ratchet;
- PWA precache, CSP and bundle budget pass;
- Chromium, Firefox, mobile WebKit and mobile Chromium E2E/accessibility pass.

Production publication paths additionally verify that the exact candidate SHA
is the merge commit of a GitHub pull request merged into `master`; a direct
push with green CI is not sufficient release provenance.

Production Pages deployment is downstream of successful `master` CI. Its artifact is stamped with the exact CI SHA. The privileged deploy job runs only the pinned Pages deployment action; repository code is then checked out in a separate read-only smoke job, and the workflow is not green until that smoke verifies the exact revision plus the HTML entrypoint, module asset, manifest, service worker and fail-closed place-search policy. The live Föli contract smoke is deliberately a separate health signal: it runs after every master push and daily, but a transient external Föli outage does not block deploying an application fix.

## Android

The continuously published `android-latest` artifact is a debug-signed testing/sideload build.

A production Android release additionally requires:

- protected `android-production` environment;
- persistent signing key and secrets, exposed only to the validation/decode/signing steps and cleaned from the runner immediately after signing;
- unique monotonically increasing version code, checked against the complete published production-release history;
- semantic version name;
- production release workflow success;
- exact signed APK emulator verification;
- immutable versioned GitHub release.

See [ANDROID_RELEASE.md](ANDROID_RELEASE.md).

## Pre-field completion policy

Real-bus validation begins only after the planned product scope is implemented
and automated/device gates are green. The current Journey Assistant source of
truth supports direct journeys plus bounded itineraries with up to two
transfers; each committed future transit leg is revalidated independently from
fresh live data, and Ride Mode remains authoritative for the boarded leg.

Before the field-validation freeze, the remaining planned routing/recovery,
time controls, localization (Finnish, English, Ukrainian and Swedish),
accessibility, domain and Android-release work must be closed or explicitly
documented as a verified platform boundary.

## Architectural limits, not unfinished work

- browser background execution is not guaranteed; the backendless web/PWA
  therefore does not promise guaranteed lock-screen get-off alerts;
- walking may hand off externally if the dedicated pedestrian-routing
  feasibility work proves that no reliable backendless production path exists;
  the app must never invent turn-by-turn precision it cannot support.

## Owner-side repository check

The repository API available to automated review cannot confirm classic branch-protection settings. Before broad promotion, verify in GitHub that `master` requires the intended CI checks and cannot be force-pushed or deleted accidentally.
