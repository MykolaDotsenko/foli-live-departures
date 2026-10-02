# Production readiness

This is the canonical launch checklist for Turku Departures.

## Release classes

### Quiet web/PWA release

May ship when:

- `master` CI is green;
- production Pages deploy is green;
- live Föli contract smoke is green;
- there is no known safety regression in Ride Mode or transfer recovery.

This class is appropriate for controlled use and field validation.

### Public / city-wide promotion

Do not promote broadly until all of these are explicitly closed:

- [ ] real-bus field validation in [FIELD_VALIDATION.md](FIELD_VALIDATION.md);
- [ ] native Finnish review in [FINNISH_NATIVE_REVIEW.md](FINNISH_NATIVE_REVIEW.md);
- [ ] custom production domain is chosen and configured before significant installs/favourites are accumulated on the GitHub Pages origin;
- [ ] web place-search policy is appropriate for expected traffic: suitable provider arrangement, or `public/place-search-config.json` disables direct address/POI lookup so the app hands off to the official planner;
- [ ] representative physical iPhone and Android lifecycle checks are complete;
- [ ] TalkBack and VoiceOver manual smoke checks are complete.

## Automated gates

Every pull request to `master` must prove:

- runtime dependencies have no high/critical npm audit finding;
- lint and strict JS/type checks pass;
- architecture remains static, backendless and privacy-first;
- workflow actions remain immutable-SHA pinned;
- Android production identity/release invariants remain intact;
- unit/integration coverage meets the repository ratchet;
- PWA precache, CSP and bundle budget pass;
- Chromium, Firefox, mobile WebKit and mobile Chromium E2E/accessibility pass.

Production Pages deployment is downstream of successful `master` CI.

## Android

The continuously published `android-latest` artifact is a debug-signed testing/sideload build.

A production Android release additionally requires:

- protected `android-production` environment;
- persistent signing key and secrets;
- unique monotonically increasing version code;
- semantic version name;
- production release workflow success;
- exact signed APK emulator verification;
- immutable versioned GitHub release.

See [ANDROID_RELEASE.md](ANDROID_RELEASE.md).

## Architectural limits, not unfinished work

These do not block v1:

- browser background execution is not guaranteed; the web app therefore does not promise lock-screen get-off alerts;
- Journey Assistant is intentionally bounded to direct and one-transfer journeys;
- walking is approximate and can hand off externally rather than pretending to provide turn-by-turn pedestrian routing;
- Swedish is a localization expansion, not a correctness dependency for Finnish + English v1.

## Owner-side repository check

The repository API available to automated review cannot confirm classic branch-protection settings. Before broad promotion, verify in GitHub that `master` requires the intended CI checks and cannot be force-pushed or deleted accidentally.
