import { afterEach, beforeEach, expect, test, vi } from "vitest";

// A Web Audio context as iOS leaves it: unlocked once, then "interrupted"
// by a call or Siri.
class FakeAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    this.resumeCalls = 0;
    this.oscillators = 0;
    FakeAudioContext.last = this;
  }
  resume() {
    this.resumeCalls += 1;
    if (FakeAudioContext.canResume) this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    this.oscillators += 1;
    return { type: "", frequency: {}, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
}

let rideAlerts;

beforeEach(async () => {
  FakeAudioContext.canResume = true;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.resetModules();
  rideAlerts = await import("./rideAlerts");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("unlocking also wakes a context an interruption left behind", async () => {
  expect(await rideAlerts.unlockRideAudio()).toBe(true);
  FakeAudioContext.last.state = "interrupted";

  expect(await rideAlerts.unlockRideAudio()).toBe(true);
  expect(FakeAudioContext.last.state).toBe("running");
});

test("an alert tone after an interruption wakes the context and still sounds", async () => {
  await rideAlerts.unlockRideAudio();
  const context = FakeAudioContext.last;
  context.state = "interrupted";
  const before = context.oscillators;

  rideAlerts.playRideTone("now");
  await Promise.resolve();
  await Promise.resolve();

  expect(context.resumeCalls).toBeGreaterThan(1);
  expect(context.oscillators).toBeGreaterThan(before);
});

test("a context that will not wake drops only the tone, quietly", async () => {
  await rideAlerts.unlockRideAudio();
  const context = FakeAudioContext.last;
  context.state = "interrupted";
  FakeAudioContext.canResume = false;

  expect(rideAlerts.playRideTone("now")).toBe(false);
  await Promise.resolve();
  expect(context.oscillators).toBe(0);
});
