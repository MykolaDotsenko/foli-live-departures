# Android production release

The production package identity is:

`io.github.mykoladotsenko.turkudepartures`

The continuously published `android-latest` artifact remains a debug-signed test/sideload build. Do not treat it as the stable upgrade path.

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

The workflow:

1. installs dependencies and runs the high/critical runtime audit;
2. builds the native web payload with the native provider boundary;
3. generates the Android project from canonical `capacitor.config.json`;
4. sets version code/name;
5. builds release APK + AAB;
6. signs both with the persistent production key;
7. verifies signatures;
8. writes SHA-256 checksums;
9. installs the exact signed APK on Android API 35 and verifies the app process/UI launches;
10. uploads the verified artifacts;
11. when `publish=true`, refuses to overwrite an existing tag and creates an immutable `vX.Y.Z` release.

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
