#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/android-e2e

APK="android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="fi.turku.folilivedepartures"

# Android emulator cold boots occasionally accept `geo fix` while the system
# location service is still disabled/not-ready. Make provider readiness an
# explicit test precondition instead of weakening the WebView coordinate check.
enable_emulator_location() {
  adb shell cmd location set-location-enabled true >/dev/null 2>&1 || true
  # Compatibility fallback for emulator images where the cmd subcommand is
  # temporarily unavailable during early boot.
  adb shell settings put secure location_mode 3 >/dev/null 2>&1 || true
  adb shell settings put secure location_providers_allowed +gps,+network \
    >/dev/null 2>&1 || true
}

inject_turku_fix() {
  adb emu geo fix 22.2666 60.4518 >/dev/null 2>&1 || return 1
}

adb wait-for-device
enable_emulator_location
adb install -r "$APK"
adb shell pm path "$PACKAGE" | tee artifacts/android-e2e/package-path.txt

adb shell pm grant "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant "$PACKAGE" android.permission.ACCESS_FINE_LOCATION
adb shell appops set "$PACKAGE" android:coarse_location allow \
  >/dev/null 2>&1 || true
adb shell appops set "$PACKAGE" android:fine_location allow \
  >/dev/null 2>&1 || true
enable_emulator_location
inject_turku_fix

adb logcat -c
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity" \
  | tee artifacts/android-e2e/am-start.txt

# Re-inject the deterministic Turku fix after the cold start. Android Emulator
# can accept a geo fix before the activity starts but still leave the newly
# created WebView waiting for its first provider update.
sleep 2
enable_emulator_location
for _ in 1 2 3 4 5 6; do
  inject_turku_fix || true
  sleep 1
done

# Preserve diagnostics proving the OS location service was enabled before the
# WebView assertion. This is evidence, not a substitute for the coordinate check.
adb shell dumpsys location > artifacts/android-e2e/location-before-webview.txt || true
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

# Keep the emulator's deterministic Turku position alive while the WebView
# asks Android for its first location. On cold boots the emulator can accept
# a geo fix before the provider is fully ready, then never deliver that sample
# to getCurrentPosition(). Re-injecting the same point does not weaken the
# assertion; it only makes provider readiness deterministic.
(
  for tick in $(seq 1 60); do
    # Reassert the OS setting periodically because some cold emulator boots
    # finish location-service initialization after the activity is already up.
    if (( tick == 1 || tick % 10 == 0 )); then
      enable_emulator_location
    fi
    inject_turku_fix || exit 0
    sleep 1
  done
) &
GEO_KEEPALIVE_PID=$!

run_webview_e2e() {
  local attempt="$1"
  node scripts/android-webview-e2e.mjs 2>&1 \
    | tee "artifacts/android-e2e/webview-e2e-attempt-${attempt}.log"
}

E2E_STATUS=0
run_webview_e2e 1 || E2E_STATUS=$?

# Retry only the known emulator-provider readiness failure. This does not
# hide product regressions: wrong coordinates, privacy/network assertions,
# UI failures and every other error remain fatal after the first attempt.
if [[ "$E2E_STATUS" -ne 0 ]] \
  && grep -q "Android fallback geolocation timed out" \
    artifacts/android-e2e/webview-e2e-attempt-1.log; then
  echo "Android location provider was not ready; reasserting deterministic Turku fix once."
  enable_emulator_location
  adb shell appops set "$PACKAGE" android:coarse_location allow \
    >/dev/null 2>&1 || true
  adb shell appops set "$PACKAGE" android:fine_location allow \
    >/dev/null 2>&1 || true
  for _ in $(seq 1 10); do
    inject_turku_fix || true
    sleep 1
  done
  adb shell dumpsys location \
    > artifacts/android-e2e/location-before-retry.txt || true

  E2E_STATUS=0
  run_webview_e2e 2 || E2E_STATUS=$?
fi

cat artifacts/android-e2e/webview-e2e-attempt-*.log \
  > artifacts/android-e2e/webview-e2e.log

kill "$GEO_KEEPALIVE_PID" >/dev/null 2>&1 || true
wait "$GEO_KEEPALIVE_PID" >/dev/null 2>&1 || true

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
