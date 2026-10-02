import test from "node:test";
import assert from "node:assert/strict";
import { verifyAndroidPlayTarget } from "./verify-android-play-target.mjs";

const good = {
  variables: "minSdkVersion = 24\ncompileSdkVersion = 36\ntargetSdkVersion = 36\n",
  appGradle:
    'defaultConfig { applicationId "io.github.mykoladotsenko.turkudepartures" }',
  manifest:
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />',
};

test("accepts the current Capacitor 8 / Google Play API-36 contract", () => {
  assert.equal(verifyAndroidPlayTarget(good), true);
});

test("fails closed on target downgrade or background-location expansion", () => {
  assert.throws(
    () =>
      verifyAndroidPlayTarget({
        ...good,
        variables:
          "minSdkVersion = 24\ncompileSdkVersion = 36\ntargetSdkVersion = 35\n",
      }),
    /targetSdkVersion/
  );
  assert.throws(
    () =>
      verifyAndroidPlayTarget({
        ...good,
        manifest:
          good.manifest +
          '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />',
      }),
    /ACCESS_BACKGROUND_LOCATION/
  );
});
