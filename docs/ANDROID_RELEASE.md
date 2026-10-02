# Android production release

The production package identity is:

`io.github.mykoladotsenko.turkudepartures`

The continuously published `android-latest` artifact remains a debug-signed test/sideload build. Do not treat it as the stable upgrade path.

## Active Ride foreground companion

Native Android builds configure one local Capacitor plugin, `ActiveRide`, and a typed `location` foreground service.

- It starts only from an active Ride Mode after the WebView has received a real GPS fix and the passenger opted into location backup plus ride alerts.
- It receives only an opaque ride ID and expiry timestamp. Route, destination, GPS samples and Ride Mode stages stay in the authoritative JS layer.
- The service is `START_NOT_STICKY`, stops with the task, has a hard six-hour maximum lifetime and is explicitly stopped by End Ride.
- The persistent notification is intentionally neutral and contains no destination, stop or coordinate.
- `ACCESS_BACKGROUND_LOCATION` is intentionally not requested. The service must be promoted while the app is visibly in the foreground with foreground location permission already granted.
- API-35 emulator E2E proves promotion and teardown. Physical screen-off, lock-screen and OEM battery-policy behaviour remains a manual field gate and is not claimed by automation.

## One-time signing setup

Create a long-lived Android signing key offline and keep its original keystore in a secure backup.

Create/protect the GitHub environment:

`android-production`

Add these environment secrets:

- `ANDROID_KEYSTORE_BASE64` — base64 of the binary keystore;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`;
- `ANDROID_KEY_PASSWORD`.

Do not commit a keystore, certificate private key or password to the repository.

## Release workflow

Run **Release Android** from `master`.

Inputs:

- `version_name`: semantic version, for example `1.0.0`;
- `version_code`: positive monotonically increasing integer;
- `publish`: false for a dry verification run, true to create the immutable GitHub release.

The workflow keeps production signing secrets out of dependency installation, web/native builds and emulator checks. Secret values are injected only into the validation/decode/signing steps; the decoded keystore is removed with an always-running cleanup step immediately after signing.

The workflow:

1. verifies before repository code runs that the candidate SHA is the exact merge commit of a pull request merged into `master`;
2. installs dependencies and runs the high/critical runtime audit;
3. refuses a `version_code` that is not strictly higher than every published production release code;
4. requires successful CI for that exact `master` commit;
5. builds the native web payload with the source SHA/version embedded and with the native provider boundary;
6. generates the Android project from canonical `capacitor.config.json` and sets version code/name;
7. builds release APK + AAB;
8. injects signing secrets only for validation/decode/signing, signs both with the persistent production key, records the signing-certificate SHA-256 fingerprint, and removes the decoded keystore immediately afterwards;
9. verifies the signed APK/AAB and writes SHA-256 checksums;
10. writes immutable JSON release metadata containing version name/code, source commit, package ID, signing-certificate fingerprint and APK/AAB hashes;
11. installs the exact signed APK on Android API 35 and verifies the app process/UI launches;
12. uploads the verified artifacts;
13. when `publish=true`, re-downloads the artifact bundle, verifies checksums and metadata again, refuses to overwrite an existing tag and creates an immutable `vX.Y.Z` release.

## Release acceptance

Before publishing:

- [ ] source commit is the intended green `master`;
- [ ] package ID is unchanged;
- [ ] version code is higher than every previous production release;
- [ ] dry release workflow succeeds;
- [ ] physical Android smoke check succeeds;
- [ ] checksum is retained with the artifacts.

After publishing:

- [ ] install over the previous production-signed APK succeeds without uninstalling;
- [ ] saved favourites/places survive the upgrade;
- [ ] Ride Mode can start and exit;
- [ ] address/POI search still hands off to the official planner in native Android;
- [ ] GitHub release tag and artifact checksums match the workflow output.

For Play distribution, upload the verified AAB and complete the store's privacy/data-safety declarations separately.
