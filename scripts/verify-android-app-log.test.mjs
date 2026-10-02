import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoFatalAppCrash,
  findFatalAppCrash,
} from "./verify-android-app-log.mjs";

const PACKAGE = "io.github.mykoladotsenko.turkudepartures";

test("ignores a UiAutomation system crash after successful app assertions", () => {
  const log = [
    "10-02 12:54:28.480  3339  3386 E AndroidRuntime: FATAL EXCEPTION: UiAutomation",
    "10-02 12:54:28.480  3339  3386 E AndroidRuntime: Process: com.android.commands.uiautomator, PID: 3339",
    "10-02 12:54:28.480  3339  3386 E AndroidRuntime: java.lang.IllegalStateException: UiAutomation disconnected",
  ].join("\n");

  assert.equal(findFatalAppCrash(log, PACKAGE), null);
  assert.doesNotThrow(() => assertNoFatalAppCrash(log, PACKAGE));
});

test("fails closed on a fatal crash from the Turku Departures process", () => {
  const log = [
    "10-02 13:00:00.000  4000  4000 E AndroidRuntime: FATAL EXCEPTION: main",
    `10-02 13:00:00.001  4000  4000 E AndroidRuntime: Process: ${PACKAGE}, PID: 4000`,
    "10-02 13:00:00.002  4000  4000 E AndroidRuntime: java.lang.RuntimeException: boom",
  ].join("\n");

  const crash = findFatalAppCrash(log, PACKAGE);
  assert.ok(crash);
  assert.match(crash.block, /FATAL EXCEPTION: main/);
  assert.throws(
    () => assertNoFatalAppCrash(log, PACKAGE),
    /Detected fatal Android runtime crash/
  );
});

test("does not match a similarly prefixed package", () => {
  const log = [
    "10-02 13:00:00.000 E AndroidRuntime: FATAL EXCEPTION: main",
    `10-02 13:00:00.001 E AndroidRuntime: Process: ${PACKAGE}.debugger, PID: 1`,
  ].join("\n");

  assert.equal(findFatalAppCrash(log, PACKAGE), null);
});

test("does not associate a distant unrelated process line with an earlier fatal", () => {
  const filler = Array.from({ length: 10 }, (_, i) => `10-02 13:00:${String(i).padStart(2, "0")}.000 I Test: line ${i}`);
  const log = [
    "10-02 13:00:00.000 E AndroidRuntime: FATAL EXCEPTION: UiAutomation",
    "10-02 13:00:00.001 E AndroidRuntime: Process: com.android.commands.uiautomator, PID: 2",
    ...filler,
    `10-02 13:00:20.000 I ActivityManager: Process: ${PACKAGE}, PID: 3`,
  ].join("\n");

  assert.equal(findFatalAppCrash(log, PACKAGE), null);
});
