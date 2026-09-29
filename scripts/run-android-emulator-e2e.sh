#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/android-e2e

APK="android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="fi.turku.folilivedepartures"

adb wait-for-device
adb install -r "$APK"
adb shell pm path "$PACKAGE" | tee artifacts/android-e2e/package-path.txt

adb shell pm grant "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant "$PACKAGE" android.permission.ACCESS_FINE_LOCATION
adb emu geo fix 22.2666 60.4518

adb logcat -c
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity" \
  | tee artifacts/android-e2e/am-start.txt

# Re-inject the deterministic Turku fix after the cold start. Android Emulator
# can accept a geo fix before the activity starts but still leave the newly
# created WebView waiting for its first provider update.
sleep 2
for _ in 1 2 3; do
  adb emu geo fix 22.2666 60.4518
  sleep 1
done
sleep 1

adb shell dumpsys activity activities \
  > artifacts/android-e2e/activity-dump.txt
grep -q "$PACKAGE" artifacts/android-e2e/activity-dump.txt

adb shell uiautomator dump /sdcard/window.xml || true
adb pull /sdcard/window.xml artifacts/android-e2e/window.xml || true
adb exec-out screencap -p > artifacts/android-e2e/cold-start.png

PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
test -n "$PID"

SOCKET=""
for _ in $(seq 1 30); do
  SOCKET="$(
    adb shell cat /proc/net/unix \
      | tr -d '\r' \
      | awk -v pid="$PID" '
          $8 ~ ("webview_devtools_remote_" pid "$") && found == "" { found = $8 }
          END { if (found != "") print found }
        '
  )"
  if [[ -n "$SOCKET" ]]; then
    break
  fi
  sleep 1
done

test -n "$SOCKET"
SOCKET="${SOCKET#@}"

adb forward tcp:9222 "localabstract:$SOCKET"

CDP_READY=0
for _ in $(seq 1 40); do
  if curl --silent --show-error --fail --retry 1 --retry-all-errors \
    http://127.0.0.1:9222/json/list \
    -o artifacts/android-e2e/cdp-targets.json \
    && [[ -s artifacts/android-e2e/cdp-targets.json ]]; then
    CDP_READY=1
    break
  fi
  sleep 0.5
done

test "$CDP_READY" -eq 1
cat artifacts/android-e2e/cdp-targets.json

E2E_STATUS=0
node scripts/android-webview-e2e.mjs \
  | tee artifacts/android-e2e/webview-e2e.log \
  || E2E_STATUS=$?

adb shell uiautomator dump /sdcard/window-final.xml || true
adb pull /sdcard/window-final.xml artifacts/android-e2e/window-final.xml || true
adb exec-out screencap -p > artifacts/android-e2e/final-state.png

adb logcat -d > artifacts/android-e2e/logcat.txt
if grep -E "FATAL EXCEPTION|Process: fi\.turku\.folilivedepartures" \
  artifacts/android-e2e/logcat.txt; then
  echo "Detected fatal Android runtime crash"
  exit 1
fi

adb shell dumpsys package "$PACKAGE" \
  > artifacts/android-e2e/package-dump.txt

grep -q "ACCESS_FINE_LOCATION: granted=true" \
  artifacts/android-e2e/package-dump.txt
grep -q "ACCESS_COARSE_LOCATION: granted=true" \
  artifacts/android-e2e/package-dump.txt

if [[ "$E2E_STATUS" -ne 0 ]]; then
  echo "Android WebView E2E failed with exit code $E2E_STATUS"
  exit "$E2E_STATUS"
fi
