# Production domain cutover

This runbook prepares PR-A01 but does **not** choose or configure the final domain. The manual `custom-domain` gate stays open until the owner controls the domain and the cutover has real evidence.

## Source of truth

`config/production-site.json` is the versioned production-origin contract.

The current state deliberately points to the GitHub Pages project URL:

- site URL: `https://mykoladotsenko.github.io/foli-live-departures/`;
- base path: `/foli-live-departures/`;
- custom domain: not configured.

Production CI/deploy must use `npm run build:production-site`. Do not hardcode a production base path in a workflow.

## Browser-storage constraint

**Browser storage cannot move cross-origin automatically.** A change from the GitHub Pages origin to a custom domain creates a new browser storage partition. The app must never claim otherwise.

Before cutover, passengers who need saved data must use **Download backup** from the old origin. The backup excludes GPS, recent stops and live Ride Mode/Journey state.

## Cutover PR

After the owner chooses and controls the final hostname:

1. Keep the old origin live.
2. Record the old URL in `legacySiteUrls`.
3. Change `siteUrl` to the HTTPS custom-domain root and `basePath` to `/`.
4. Set `customDomain` to the bare hostname.
5. Add `public/CNAME` containing exactly that hostname.
6. Update public-facing README and Play listing/contact links to the new origin.
7. Run `npm run verify:release-readiness`, `npm run build:production-site`, PWA/CSP checks and the full browser suite.
8. Merge only an **exact green** PR head. Do not edit the domain out-of-band first.
9. Configure/confirm the same custom domain in GitHub Pages and wait for HTTPS enforcement.
10. Confirm the exact merge SHA via the production deploy smoke on the new URL.
11. Perform a real install/offline reopen check and a backup import from the old origin.
12. Only then close the `custom-domain` release gate with dated evidence.

The stale-origin verifier fails if public README/Play metadata still exposes a URL listed in `legacySiteUrls`.

## Rollback

**Rollback must preserve access to the old origin until the new origin is proven.**

If the new domain has DNS/TLS/PWA failures:

1. stop broad promotion;
2. revert the cutover PR so versioned production config/public links return to the old origin;
3. remove/disable the custom-domain setting in GitHub Pages as part of the same rollback decision;
4. redeploy an exact green rollback merge commit;
5. verify the old origin with the exact production smoke;
6. if testers created newer data on the custom domain, export a backup there and import it on the old origin.

The old origin does not automatically receive local state created on the new origin.

## Evidence to retain

Retain the final hostname, merge SHA, HTTPS/custom-domain evidence, exact production smoke, PWA install/offline reopen result, cross-origin backup export/import result and any rollback result.
