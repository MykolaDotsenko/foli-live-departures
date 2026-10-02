import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  configureAndroidActiveRide,
  verifyAndroidActiveRide,
} from "./configure-android-active-ride.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foli-active-ride-"));
  roots.push(root);
  const javaDir = path.join(
    root,
    "android/app/src/main/java/io/github/mykoladotsenko/turkudepartures",
  );
  fs.mkdirSync(javaDir, { recursive: true });
  fs.mkdirSync(path.join(root, "android/app/src/main"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "android/app/src/main/AndroidManifest.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Turku Departures">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
</manifest>
`,
  );
  fs.writeFileSync(
    path.join(javaDir, "MainActivity.java"),
    "package io.github.mykoladotsenko.turkudepartures;\n",
  );
  return root;
}

test("configures an idempotent typed foreground location bridge without background location", () => {
  const root = fixture();
  configureAndroidActiveRide(root);
  configureAndroidActiveRide(root);
  verifyAndroidActiveRide(root);

  const manifest = fs.readFileSync(
    path.join(root, "android/app/src/main/AndroidManifest.xml"),
    "utf8",
  );
  assert.equal(
    (manifest.match(/android\.permission\.FOREGROUND_SERVICE_LOCATION/g) || []).length,
    1,
  );
  assert.equal((manifest.match(/ActiveRideForegroundService/g) || []).length, 1);
  assert.match(manifest, /android:foregroundServiceType="location"/);
  assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);

  const service = fs.readFileSync(
    path.join(
      root,
      "android/app/src/main/java/io/github/mykoladotsenko/turkudepartures/ActiveRideForegroundService.java",
    ),
    "utf8",
  );
  assert.match(service, /START_NOT_STICKY/);
  assert.match(service, /MAX_LIFETIME_MS/);
  assert.match(service, /Open Turku Departures for current stop guidance/);
  assert.doesNotMatch(service, /targetStop|latitude|longitude/);
});

test("enables WebView debugging only for the emulator fixture", () => {
  const root = fixture();
  configureAndroidActiveRide(root, { webViewDebug: true });
  verifyAndroidActiveRide(root, { webViewDebug: true });

  const main = fs.readFileSync(
    path.join(
      root,
      "android/app/src/main/java/io/github/mykoladotsenko/turkudepartures/MainActivity.java",
    ),
    "utf8",
  );
  assert.match(main, /registerPlugin\(ActiveRidePlugin\.class\)/);
  assert.match(main, /setWebContentsDebuggingEnabled\(true\)/);
});

test("all Android build paths install the same bridge configurator", () => {
  const root = process.cwd();
  const apk = fs.readFileSync(path.join(root, ".github/workflows/android-apk.yml"), "utf8");
  const e2e = fs.readFileSync(path.join(root, ".github/workflows/android-e2e.yml"), "utf8");
  const release = fs.readFileSync(path.join(root, ".github/workflows/android-release.yml"), "utf8");

  assert.match(apk, /npm run configure:android-active-ride/);
  assert.match(e2e, /npm run configure:android-active-ride -- --webview-debug/);
  assert.match(release, /npm run configure:android-active-ride/);
});
