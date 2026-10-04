# Google Play Data Safety worksheet

**Status:** pre-submission worksheet — factual app behaviour is verified in code, but final Play Console selections must be rechecked against the current Google Play form and the current server/logging practices of GitHub Pages and Föli immediately before submission.

Google Play defines **collection** as transmitting user data off-device, including to a third-party server. On-device-only access does not count as collection. Ephemeral processing still belongs in the form flow even when it may not be displayed publicly. Do not submit a blanket **“No data collected or shared”** answer from this repository alone.

Official reference:
https://support.google.com/googleplay/android-developer/answer/10787469

## Verified app facts

| Area | App behaviour | Play worksheet treatment |
| --- | --- | --- |
| Precise / approximate device location | Optional Android/browser location is used on-device for nearby stops and Ride Mode. Raw coordinates are not sent by Turku Departures to the developer or Föli and are not persisted. | **Not collected by the app** under the on-device-processing rule. Permission access is still visible separately in Play. |
| Android background location | `ACCESS_BACKGROUND_LOCATION` is absent. Optional native Ride Mode uses a user-initiated temporary `location` foreground service. | Do **not** declare background-location permission. Keep the foreground-service use prominent in the listing/privacy policy. |
| In-app stop search text | Text submitted to Föli stop search is sent over HTTPS to `data.foli.fi`. | Conservatively review as **In-app search history → collected for App functionality**. Do not mark ephemeral until provider retention/logging is confirmed. |
| Destination place/address search | Shops, schools, health care, named streets and street addresses are matched on-device against OpenStreetMap datasets shipped with the app (`public/places/foli-places.json` and `public/addresses/foli-addresses.json`). The typed text is not sent anywhere. Sorting by distance uses one location fix on explicit request, kept in memory for the visit only. | Not collected while it remains on-device. |
| Stop / trip / exit-stop identifiers | Public transit identifiers selected or used by the passenger are sent to Föli endpoints to fetch departures/trip evidence. | Conservatively review as **App activity / App interactions → collected for App functionality**. Sharing treatment must be confirmed against Play's user-initiated-action exception and Föli's role. |
| IP/network metadata | GitHub Pages (web/PWA) and Föli receive ordinary network requests and therefore can receive IP-level request metadata. | Play notes that IP can map to different data types depending on how it is used. Confirm current provider handling before final Console answers; do not guess a data type from IP alone. |
| Crash logs / analytics / advertising IDs | No automatic crash SDK, analytics SDK, ad SDK or advertising identifier integration. | No automatic collection declared by Turku Departures for these categories. |
| Local favourites, recent stops, My Places, ride state | Stored locally only. My Places uses public stop IDs/names rather than addresses. | Not collected while it remains on-device. |
| Field diagnostics | Generated locally; leave the device only after an explicit copy/share action by the user. | User-initiated export; no automatic collection by Turku Departures. |
| Google Maps / official journey planner links | External service opens only after a user taps the link. | Treat as user-initiated navigation to an external service; the destination service's policies apply. |

## Security / account answers

- Data in automatic app network requests is sent over HTTPS.
- No user account exists.
- No developer-side user profile/database exists for this app.
- Local data can be removed by app controls, clearing site/app storage or uninstalling Android.
- The privacy policy URL for Play Console is:
  `https://mykoladotsenko.github.io/foli-live-departures/privacy.html`

## Submission blocker

Before the first Play submission, the publisher must re-open the current Data Safety form and confirm:

1. current Föli/GitHub request logging and retention relevant to the categories above;
2. whether the user-initiated-action sharing exception applies to each direct third-party transfer;
3. whether any Play Console wording/schema changed since this worksheet was last reviewed;
4. that the installed AAB contains no new SDK/permission/network destination not represented here.

Until those four checks are complete, Data Safety is **prepared, not approved**.
