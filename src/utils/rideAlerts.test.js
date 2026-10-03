import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resetLanguageForTests } from "../i18n";
import {
  announceRideStage,
  playRideTone,
  rideAlertCapabilities,
  repeatNowRideSignal,
  runRideTestAlert,
  showRideNotification,
  speakRideStage,
  stopRideAlerts,
  unlockRideAudio,
  vibrateRideStage,
} from "./rideAlerts";

afterEach(() => {
  resetLanguageForTests("en");
});

describe("ride alerts", () => {
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: originalVibrate,
    });
  });

  it("uses escalating haptic patterns", () => {
    expect(vibrateRideStage("soon")).toBe(true);
    expect(vibrateRideStage("now")).toBe(true);

    expect(navigator.vibrate.mock.calls[0][0]).toEqual([120]);
    expect(navigator.vibrate.mock.calls[1][0].length).toBeGreaterThan(1);
  });

  it("reports browser capabilities without throwing", () => {
    const capabilities = rideAlertCapabilities();
    expect(capabilities).toHaveProperty("audio");
    expect(capabilities).toHaveProperty("vibration");
    expect(capabilities).toHaveProperty("speech");
    expect(capabilities).toHaveProperty("notifications");
    expect(capabilities).toHaveProperty("wakeLock");
  });
});

async function flushUntil(predicate, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return true;
    await Promise.resolve();
  }
  return predicate();
}

describe("ride get-off notifications", () => {
  let created = [];

  class FakeNotification {
    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.onclick = null;
      this.close = vi.fn();
      created.push(this);
    }
  }

  beforeEach(() => {
    created = [];
    FakeNotification.permission = "granted";
    vi.stubGlobal("Notification", FakeNotification);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete navigator.serviceWorker;
  });

  function stubServiceWorker(registration) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: () => Promise.resolve(registration) },
    });
  }

  it("stays silent when permission was never granted", async () => {
    FakeNotification.permission = "default";

    await expect(showRideNotification("now", "Puistokatu")).resolves.toBe(
      false
    );
    expect(created).toHaveLength(0);
  });

  // The phone is locked and the page is backgrounded when it matters most,
  // which is exactly when only a service-worker notification survives.
  it("prefers the service worker and makes the get-off alert unmissable", async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    stubServiceWorker({ showNotification });

    await expect(showRideNotification("now", "Puistokatu")).resolves.toBe(true);
    expect(created).toHaveLength(0);

    const [title, options] = showNotification.mock.calls[0];
    expect(title).toBe("This is your stop: Puistokatu");
    expect(options.requireInteraction).toBe(true);
    expect(options.renotify).toBe(true);
    expect(options.tag).toBe("foli-active-ride");
    expect(options.data?.url).toBe(globalThis.location.href);
    expect(options.lang).toBe("en");
    // A raster icon every notification centre decodes, and a status-bar badge
    // so Android shows the bus rather than the browser's logo.
    expect(options.icon).toMatch(/\/icon-192\.png$/);
    expect(options.badge).toMatch(/\/notification-badge-96\.png$/);
  });

  it("sends a tap on the page-level fallback back to the app", async () => {
    stubServiceWorker(null);
    const focus = vi.fn();
    vi.stubGlobal("focus", focus);
    vi.stubGlobal("Notification", FakeNotification);

    await expect(showRideNotification("now", "Puistokatu")).resolves.toBe(true);
    expect(created).toHaveLength(1);

    expect(typeof created[0].onclick).toBe("function");
    created[0].onclick();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(created[0].close).toHaveBeenCalledTimes(1);
  });

  // Every stage replaces the last under one tag, and a replacement without
  // renotify arrives silently: "Press STOP" reached a locked phone without
  // a sound, and only "Get off now" made one.
  it("makes every stage after the test heard, not just get off now", async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    stubServiceWorker({ showNotification });

    for (const stage of ["test", "soon", "next", "now", "missed"]) {
      await showRideNotification(stage, "Puistokatu", 3);
    }

    expect(
      showNotification.mock.calls.map(([, options]) => [options.tag, options.renotify])
    ).toEqual([
      ["foli-active-ride", false],
      ["foli-active-ride", true],
      ["foli-active-ride", true],
      ["foli-active-ride", true],
      ["foli-active-ride", true],
    ]);
  });

  // "Press STOP now" before the bus has left the stop before the exit would
  // stop it there; until it has, the alert names that stop instead.
  it("tells a locked phone which stop to wait for before pressing STOP", async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    stubServiceWorker({ showNotification });
    const previousStop = { id: "164", name: "Kauppatori" };

    await showRideNotification("next", "Puistokatu", 3, {
      previousStop,
      previousLeft: false,
    });
    await showRideNotification("next", "Puistokatu", 3, {
      previousStop,
      previousLeft: true,
    });

    expect(
      showNotification.mock.calls.map(([title, options]) => [title, options.body])
    ).toEqual([
      ["Get ready to press STOP", "Press STOP when the bus leaves Kauppatori."],
      ["Next stop: Puistokatu", "Press the STOP button now."],
    ]);
  });

  it("calls a stop Föli has not named by its number, in either language", async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    stubServiceWorker({ showNotification });

    await showRideNotification("now", { id: "164", name: "" });
    await showRideNotification("soon", { id: "164", name: "Stop 164" });
    await showRideNotification("soon", "");
    resetLanguageForTests("fi");
    await showRideNotification("now", { id: "164", name: "" });

    expect(showNotification.mock.calls.map(([title, options]) => [title, options.body])).toEqual([
      ["This is your stop: Stop 164", "Get off now."],
      ["Get ready", "Stop 164 is coming up soon."],
      ["Get ready", "Your stop is coming up soon."],
      ["Tämä on pysäkkisi: Pysäkki 164", "Jää pois nyt."],
    ]);
  });

  // It arrives over a locked screen, where the page cannot explain itself.
  it("sends the get-off alert in the language on screen", async () => {
    resetLanguageForTests("fi");
    const showNotification = vi.fn(() => Promise.resolve());
    stubServiceWorker({ showNotification });

    await showRideNotification("now", "Puistokatu");
    await showRideNotification("next", "Puistokatu", 3);

    expect(showNotification.mock.calls.map(([title, options]) => [
      title,
      options.body,
      options.lang,
    ])).toEqual([
      ["Tämä on pysäkkisi: Puistokatu", "Jää pois nyt.", "fi"],
      ["Seuraava pysäkki: Puistokatu", "Paina STOP-nappia nyt.", "fi"],
    ]);
  });

  it("holds every new ride notification until already-started cleanup finishes", async () => {
    let resolveCleanup;
    const showNotification = vi.fn(() => Promise.resolve());
    const getNotifications = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCleanup = () => resolve([]);
        })
    );
    stubServiceWorker({ getNotifications, showNotification });

    const cleanup = stopRideAlerts();
    const notification = showRideNotification("next", "Puistokatu", 3);

    expect(
      await flushUntil(() => typeof resolveCleanup === "function")
    ).toBe(true);
    expect(showNotification).not.toHaveBeenCalled();

    resolveCleanup();
    await cleanup;
    await expect(notification).resolves.toBe(true);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("serializes notification cleanup so an older ride cannot close a replacement alert later", async () => {
    let resolveFirst;
    let call = 0;
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const getNotifications = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve([{ close: firstClose }]);
        });
      }
      return Promise.resolve([{ close: secondClose }]);
    });
    stubServiceWorker({ getNotifications });

    const first = stopRideAlerts();
    const second = stopRideAlerts();

    expect(
      await flushUntil(() => getNotifications.mock.calls.length === 1)
    ).toBe(true);

    resolveFirst();
    await first;
    expect(firstClose).toHaveBeenCalledTimes(1);

    await second;
    expect(getNotifications).toHaveBeenCalledTimes(2);
    expect(secondClose).toHaveBeenCalledTimes(1);
  });

  it("closes the active service-worker ride notification when the ride ends", async () => {
    const close = vi.fn();
    const getNotifications = vi.fn(() =>
      Promise.resolve([{ close }])
    );
    stubServiceWorker({
      showNotification: vi.fn(() => Promise.resolve()),
      getNotifications,
    });

    await showRideNotification("now", "Puistokatu");
    await stopRideAlerts();

    expect(getNotifications).toHaveBeenCalledWith({
      tag: "foli-active-ride",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the page-level fallback notification when the ride ends", async () => {
    stubServiceWorker(null);

    await showRideNotification("now", "Puistokatu");
    expect(created).toHaveLength(1);
    expect(created[0].close).not.toHaveBeenCalled();

    await stopRideAlerts();

    expect(created[0].close).toHaveBeenCalledTimes(1);
  });
});

describe("spoken get-off alerts", () => {
  let spoken = [];
  let cancelled = 0;

  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.voice = null;
    }
  }

  beforeEach(() => {
    spoken = [];
    cancelled = 0;
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      speak: (utterance) => spoken.push(utterance),
      cancel: () => {
        cancelled += 1;
      },
      getVoices: () => [
        { lang: "en-US", name: "English" },
        { lang: "fi-FI", name: "Suomi" },
      ],
      addEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The stop name is the one word the passenger is listening for, and an
  // English engine mangles Finnish street names past recognition.
  it("reads the stop name with a Finnish voice", () => {
    expect(speakRideStage("next", "Puistokatu", 3)).toBe(true);

    const name = spoken.find((utterance) => utterance.text === "Puistokatu");
    expect(name).toBeDefined();
    expect(name.lang).toBe("fi-FI");
    expect(name.voice?.lang).toBe("fi-FI");
  });

  it("tells a bus passenger to press STOP and everyone else to get ready", () => {
    speakRideStage("next", "Puistokatu", 3);
    expect(spoken.map((u) => u.text)).toContain("Press the stop button now.");

    spoken = [];
    speakRideStage("next", "Puistokatu", 0);
    expect(spoken.map((u) => u.text)).toContain(
      "Get ready to exit at the next stop."
    );
  });

  it("escalates from a warning to an unambiguous instruction", () => {
    speakRideStage("soon", "Puistokatu");
    expect(spoken.map((u) => u.text)).toContain(
      "Get ready. Your stop is coming up."
    );

    spoken = [];
    speakRideStage("now", "Puistokatu");
    expect(spoken.map((u) => u.text)).toEqual([
      "This is your stop.",
      "Puistokatu",
      "Get off now.",
    ]);
  });

  it("cancels whatever is still being said before a newer stage speaks", () => {
    speakRideStage("soon", "Puistokatu");
    speakRideStage("now", "Puistokatu");
    expect(cancelled).toBe(2);
  });

  it("does not name a stop that has no name", () => {
    speakRideStage("now", "");
    expect(spoken.map((u) => u.text)).toEqual([
      "This is your stop.",
      "Get off now.",
    ]);
  });

  // Instructions in the language the passenger reads, each by a voice for
  // it; the stop name in Finnish either way, so it stays recognisable.
  it("keeps English instructions with an English voice and the name in Finnish", () => {
    speakRideStage("next", "Puistokatu", 3);

    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ["The next stop is yours.", "en-US"],
      ["Puistokatu", "fi-FI"],
      ["Press the stop button now.", "en-US"],
    ]);
  });

  it("says which stop to wait for, before the bus has left it", () => {
    speakRideStage("next", "Puistokatu", 3, {
      previousStop: { id: "164", name: "Kauppatori" },
      previousLeft: false,
    });

    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ["Your stop comes after", "en-US"],
      ["Kauppatori", "fi-FI"],
      ["Press the stop button when the bus leaves it.", "en-US"],
    ]);

    spoken = [];
    speakRideStage("next", "Puistokatu", 3, {
      previousStop: { id: "164", name: "" },
      previousLeft: false,
    });
    expect(spoken.map((u) => u.text)).toEqual([
      "Press STOP once the bus has left the stop before yours.",
    ]);
  });

  it("speaks to a Finnish reader in Finnish, all with the Finnish voice", () => {
    resetLanguageForTests("fi");
    speakRideStage("now", "Puistokatu", 3);

    expect(spoken.map((u) => u.text)).toEqual([
      "Tämä on pysäkkisi.",
      "Puistokatu",
      "Jää pois nyt.",
    ]);
    expect(spoken.map((u) => [u.lang, u.voice?.lang])).toEqual([
      ["fi-FI", "fi-FI"],
      ["fi-FI", "fi-FI"],
      ["fi-FI", "fi-FI"],
    ]);

    spoken = [];
    speakRideStage("next", "Puistokatu", 3);
    expect(spoken.map((u) => u.text)).toContain("Paina stop-nappia nyt.");
  });

  it("speaks Ukrainian instructions in uk-UA while keeping the Finnish stop name pronounceable", () => {
    resetLanguageForTests("uk");
    speakRideStage("now", "Puistokatu", 3);

    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ["Це ваша зупинка.", "uk-UA"],
      ["Puistokatu", "fi-FI"],
      ["Виходьте зараз.", "uk-UA"],
    ]);
  });

  it("speaks a nameless stop's alert wholly in the reader's language", () => {
    resetLanguageForTests("fi");
    speakRideStage("soon", "");
    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ["Valmistaudu. Pysäkkisi lähestyy.", "fi-FI"],
    ]);
  });

  // A ride saved by an older version may carry "Stop 30" as its name. Read
  // by the Finnish voice it came out as nonsense; it is no name at all.
  it("treats a stored stand-in like a missing name", () => {
    speakRideStage("now", "Stop 30");

    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ["This is your stop.", "en-US"],
      ["Get off now.", "en-US"],
    ]);
  });

  it("reports failure instead of throwing when speech is unavailable", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    expect(speakRideStage("now", "Puistokatu")).toBe(false);
  });
});

describe("ride alert delivery", () => {
  let vibrations = [];

  beforeEach(() => {
    vibrations = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern) => {
        vibrations.push(pattern);
        return true;
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    vi.stubGlobal("Notification", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drives every channel it can for one stage", () => {
    expect(() => announceRideStage("now", "Puistokatu", false, 3)).not.toThrow();
    expect(vibrations).toEqual([[260, 100, 260, 100, 320]]);
  });

  it("repeats the get-off signal without repeating the speech", () => {
    repeatNowRideSignal();
    expect(vibrations).toEqual([[260, 100, 260, 100, 320]]);
  });

  it("runs a start-up test alert so the passenger can trust it later", async () => {
    await expect(runRideTestAlert("Puistokatu", false)).resolves.toBeUndefined();
    expect(vibrations).toEqual([[120, 70, 120]]);
  });

  it("cuts haptics short when the ride ends", () => {
    stopRideAlerts();
    expect(vibrations).toEqual([0]);
  });

  it("ignores an unknown stage rather than buzzing at random", () => {
    expect(vibrateRideStage("not-a-stage")).toBe(false);
    expect(playRideTone("not-a-stage")).toBe(false);
    expect(vibrations).toEqual([]);
  });

  it("reports no audio rather than throwing when the platform has none", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);

    await expect(unlockRideAudio()).resolves.toBe(false);
    expect(playRideTone("now")).toBe(false);
  });
});
