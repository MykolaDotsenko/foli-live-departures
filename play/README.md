# Google Play release surface

This directory is the repository source for the Google Play listing and release-review worksheet. It does **not** mean the app is published on Google Play.

## Current official constraints captured here

- App name: maximum 30 characters.
- Short description: maximum 80 characters.
- Full description: maximum 4,000 characters.
- Release notes: maximum 500 Unicode characters per language.
- At least two screenshots are required; this repository generates four JPEG 9:16 phone screenshots at >=1080 px.
- Feature graphic: generated at exactly 1024×500.
- Store icon source: `public/icon-512.jpg`, exactly 512×512.
- From 31 August 2026, new apps and updates must target Android 16 / API 36. The pinned Capacitor 8 Android toolchain is verified against that generated target.

Official references:
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/9859348
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://capacitorjs.com/docs/android/setting-target-sdk

## Files

- `listings/en-US/` — canonical default listing. Additional localized listings stay blocked by the existing native-language review gates.
- `release-notes/en-US/default.txt` — default release note source.
- `DATA_SAFETY.md` — conservative pre-submission worksheet; it is deliberately not a self-approving “no data” declaration.
- `artifacts/play-store/` — generated in browser CI:
  - `app-icon.png`;
  - `feature-graphic.jpg`;
  - four phone screenshots.

## Generate marketing assets locally

```bash
npm ci
npx playwright install chromium
npm run test:e2e -- --project=chromium-mobile e2e/play-store-screenshots.spec.js
npm run build:play-store-assets
npm run verify:play-assets
```

## AAB / Play Console procedure

1. Finish the manual gates first: native-language review, physical TalkBack/VoiceOver, physical Android/iPhone QA, real-bus validation, custom-domain decision, production signing secrets and physical Android upgrade testing.
2. From exact green `master`, run **Release Android** with a semantic `version_name`, strictly increasing `version_code`, and `publish=false`.
3. Confirm the workflow's signed APK emulator verification and the immutable APK/AAB/certificate SHA-256 metadata.
4. Download the verified AAB artifact. Do not rebuild locally for Play.
5. In Play Console, create the app using package ID `io.github.mykoladotsenko.turkudepartures`.
6. Enter the canonical listing, privacy-policy URL, support email and current Data Safety answers.
7. Upload the exact verified AAB to **Internal testing** first.
8. Resolve every Play pre-launch/policy warning. Run a physical install/upgrade from the Play-distributed build.
9. Only after those checks, promote the same reviewed release through the desired Play track. GitHub release publication and Google Play publication are separate evidence.

Production signing material remains outside the repository. No Play service-account credential is introduced by E03.
