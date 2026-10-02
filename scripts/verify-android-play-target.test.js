import { expect, test } from "vitest";
import { verifyAndroidPlayTarget } from "./verify-android-play-target.mjs";

const good={
  variables:"minSdkVersion = 24\ncompileSdkVersion = 36\ntargetSdkVersion = 36\n",
  appGradle:'defaultConfig { applicationId "io.github.mykoladotsenko.turkudepartures" }',
  manifest:'<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />'
};

test("accepts the current Capacitor 8 / Google Play API-36 contract",()=>{
  expect(verifyAndroidPlayTarget(good)).toBe(true);
});

test("fails closed on target downgrade or background-location expansion",()=>{
  expect(()=>verifyAndroidPlayTarget({
    ...good,
    variables:"minSdkVersion = 24\ncompileSdkVersion = 36\ntargetSdkVersion = 35\n"
  })).toThrow(/targetSdkVersion/);
  expect(()=>verifyAndroidPlayTarget({
    ...good,
    manifest:good.manifest+'<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />'
  })).toThrow(/ACCESS_BACKGROUND_LOCATION/);
});
