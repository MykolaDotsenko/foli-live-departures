import { getLanguage, t } from "../i18n";
import { rideExitInstruction } from "./rideInstructions";
import { realStopName } from "./stopNames";

/**
 * @import { Language } from "../i18n"
 * @import {
 *   RequestStopInstruction,
 *   RideStage,
 *   RideStopDetails,
 * } from "../types/ride"
 */

/**
 * What an alert can announce: a stage past boarding, or the start-up test.
 * @typedef {"test" | Exclude<RideStage, "boarded">} RideAlertStage
 */

/**
 * @typedef {object} RideAlertPattern
 * @property {number[]} tones Frequencies in Hz, played one after another.
 * @property {number[]} vibration A navigator.vibrate() pattern, in ms.
 */

/**
 * The exit stop as callers pass it: a saved plan stop, anything with its
 * name and number, or just the name.
 * @typedef {string | { name?: string | null, id?: string | number | null } | null | undefined} RideAlertStop
 */

/**
 * What NEXT needs to know about the stop before the exit.
 * @typedef {object} RideAlertContext
 * @property {Pick<RideStopDetails, "id" | "name"> | null} [previousStop]
 * @property {boolean | null} [previousLeft] Whether the bus has been seen
 *   leaving previousStop; `false` only once it is known not to have.
 */

/**
 * Safari before 14.1 has only the prefixed constructor.
 * @typedef {{ webkitAudioContext?: typeof AudioContext }} PrefixedAudioGlobals
 */

/** @type {Record<RideAlertStage, RideAlertPattern>} */
const ALERT_PATTERNS = {
  test: {
    tones: [660, 880],
    vibration: [120, 70, 120],
  },
  soon: {
    tones: [660],
    vibration: [120],
  },
  next: {
    tones: [660, 880],
    vibration: [180, 90, 180],
  },
  now: {
    tones: [880, 1040, 880],
    vibration: [260, 100, 260, 100, 320],
  },
  missed: {
    tones: [520, 420],
    vibration: [300, 120, 300],
  },
};

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {Notification | null} */
let activePageRideNotification = null;

/** @returns {typeof AudioContext | null} */
function AudioContextConstructor() {
  return (
    globalThis.AudioContext ||
    /** @type {PrefixedAudioGlobals} */ (globalThis).webkitAudioContext ||
    null
  );
}

/** @returns {AudioContext | null} */
function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContext = AudioContextConstructor();
  if (!AudioContext) return null;

  try {
    audioContext = new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

/** @returns {Promise<boolean>} Whether audio can play now. */
export async function unlockRideAudio() {
  const context = getAudioContext();
  if (!context) return false;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    return context.state === "running";
  } catch {
    return false;
  }
}

/**
 * @param {RideAlertStage} stage
 * @returns {boolean}
 */
export function playRideTone(stage) {
  const pattern = ALERT_PATTERNS[stage];
  const context = getAudioContext();
  if (!pattern || !context || context.state !== "running") return false;

  try {
    const startAt = context.currentTime + 0.02;
    pattern.tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.23;
      const noteEnd = noteStart + 0.15;

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.09, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {RideAlertStage} stage
 * @returns {boolean}
 */
export function vibrateRideStage(stage) {
  const pattern = ALERT_PATTERNS[stage]?.vibration;
  if (!pattern || typeof globalThis.navigator?.vibrate !== "function") {
    return false;
  }

  try {
    return globalThis.navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function speechSupported() {
  return (
    typeof globalThis.SpeechSynthesisUtterance === "function" &&
    typeof globalThis.speechSynthesis?.speak === "function"
  );
}

// `getVoices()` is empty until the engine has loaded its list, which lands
// after a `voiceschanged` event. The start-up test alert fires immediately,
// so without caching across that event the stop name is read by an English
// voice at exactly the moment the passenger is checking the alert.
/** @type {SpeechSynthesisVoice[]} */
let cachedVoices = [];
let voicesListenerAttached = false;

function refreshCachedVoices() {
  try {
    const voices = globalThis.speechSynthesis?.getVoices?.() || [];
    if (voices.length > 0) cachedVoices = voices;
  } catch {
    // Voice discovery is best effort.
  }
}

/** @returns {boolean} Whether any voices are known yet. */
export function primeRideVoices() {
  if (!speechSupported()) return false;

  refreshCachedVoices();

  if (!voicesListenerAttached) {
    try {
      globalThis.speechSynthesis.addEventListener?.(
        "voiceschanged",
        refreshCachedVoices
      );
      voicesListenerAttached = true;
    } catch {
      // Older engines expose no event; the direct read above still works.
    }
  }

  return cachedVoices.length > 0;
}

/** @returns {SpeechSynthesisVoice | null} */
function finnishVoice() {
  primeRideVoices();

  return (
    cachedVoices.find(
      (voice) => String(voice.lang || "").toLowerCase() === "fi-fi"
    ) ||
    cachedVoices.find((voice) =>
      String(voice.lang || "").toLowerCase().startsWith("fi")
    ) ||
    null
  );
}

/**
 * @param {string} text
 * @param {string} lang A BCP 47 tag, such as "fi-FI".
 * @param {SpeechSynthesisVoice | null} [voice]
 */
function speakUtterance(text, lang, voice = null) {
  const utterance = new globalThis.SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.92;
  if (voice) utterance.voice = voice;
  globalThis.speechSynthesis.speak(utterance);
}

// The instructions are spoken in the language the passenger reads, by a
// voice for that language. The stop name is read by the Finnish voice in
// either language: it is the word the passenger is listening for, and an
// English voice mangles a Finnish name past recognition.
/** @type {Record<Language, string>} */
const SPEECH_LANG = { en: "en-US", fi: "fi-FI" };

// Whether "Press STOP now" would be premature: the bus has not been seen
// leaving the stop before the exit yet, on a trip with a STOP button.
/**
 * @param {number | null} routeType
 * @param {RideAlertContext} [context]
 * @returns {boolean}
 */
function waitingForPrevious(routeType, context) {
  return (
    context?.previousLeft === false &&
    rideExitInstruction(routeType).kind === "request-stop"
  );
}

/**
 * @param {RideAlertStage} stage
 * @param {RideAlertStop} stop
 * @param {number | null} [routeType] The trip's GTFS route_type.
 * @param {RideAlertContext} [context]
 * @returns {boolean} Whether anything was spoken.
 */
export function speakRideStage(stage, stop, routeType = null, context = {}) {
  if (!speechSupported()) return false;

  // An earlier version could save a stand-in ("Stop 30") with the ride; it
  // is not a name to read out with the Finnish voice.
  const realName = realStopName(exitStop(stop).name);
  const fiVoice = finnishVoice();
  const lang = SPEECH_LANG[getLanguage()] || SPEECH_LANG.en;
  const voice = lang === SPEECH_LANG.fi ? fiVoice : null;
  const say = (/** @type {string} */ text) => speakUtterance(text, lang, voice);
  // Every lead-in already says "your stop", so a stop with no name is
  // simply not named again: "This is your stop. Your stop." was an echo.
  const sayName = () => {
    if (realName) speakUtterance(realName, SPEECH_LANG.fi, fiVoice);
  };

  try {
    globalThis.speechSynthesis.cancel();

    if (stage === "test") {
      say(t("Your get-off alert is working."));
      sayName();
      return true;
    }

    if (stage === "soon") {
      say(t("Get ready. Your stop is coming up."));
      sayName();
      return true;
    }

    if (stage === "next") {
      const exit = rideExitInstruction(routeType);
      const previousName = realStopName(exitStop(context?.previousStop).name);
      // waitingForPrevious() holds only for a request-stop instruction.
      const requestStop = /** @type {RequestStopInstruction} */ (exit);
      if (waitingForPrevious(routeType, context) && previousName) {
        say(t(requestStop.afterPreviousLead));
        speakUtterance(previousName, SPEECH_LANG.fi, fiVoice);
        say(t(requestStop.afterPreviousVoice));
        return true;
      }
      if (waitingForPrevious(routeType, context)) {
        say(t(requestStop.unnamedPreviousText));
        return true;
      }
      say(t("The next stop is yours."));
      sayName();
      say(t(exit.nextVoice));
      return true;
    }

    if (stage === "now") {
      say(t("This is your stop."));
      sayName();
      say(t("Get off now."));
      return true;
    }

    if (stage === "missed") {
      say(t("It looks like your stop is behind you. Get off at the next stop."));
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/** @returns {Promise<boolean>} Whether notifications may be shown. */
export async function requestRideNotificationPermission() {
  const NotificationApi = globalThis.Notification;
  if (!NotificationApi) return false;

  if (NotificationApi.permission === "granted") return true;
  if (NotificationApi.permission === "denied") return false;

  try {
    return (await NotificationApi.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

// A ride's exit stop as the alerts need it: Föli's name, and its number to
// fall back on. Callers pass the stop, or just its name.
/**
 * @param {RideAlertStop} stop
 * @returns {{ name: string, id: string }}
 */
function exitStop(stop) {
  return typeof stop === "string" || !stop
    ? { name: stop || "", id: "" }
    : { name: stop.name || "", id: stop.id ? String(stop.id) : "" };
}

/**
 * @param {string} text
 * @returns {string}
 */
function capitalized(text) {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

// In the language of the moment it is sent, like everything on screen. A
// stop Föli has not named is called by its number, the one on its sign:
// "This is your stop: your stop" told a locked screen nothing.
/**
 * @param {RideAlertStage} stage
 * @param {RideAlertStop} stop
 * @param {number | null} [routeType]
 * @param {RideAlertContext} [context]
 * @returns {{ title: string, body: string }}
 */
function notificationCopy(stage, stop, routeType = null, context = {}) {
  const { name: rawName, id } = exitStop(stop);
  const name =
    realStopName(rawName) || (id ? t("Stop {id}", { id }) : t("your stop"));

  if (stage === "soon") {
    return {
      title: t("Get ready"),
      body: capitalized(t("{name} is coming up soon.", { name })),
    };
  }
  if (stage === "next") {
    const exit = rideExitInstruction(routeType);
    const previousName = realStopName(exitStop(context?.previousStop).name);
    if (waitingForPrevious(routeType, context)) {
      // waitingForPrevious() holds only for a request-stop instruction.
      const requestStop = /** @type {RequestStopInstruction} */ (exit);
      return previousName
        ? {
            title: t(requestStop.afterPreviousTitle, { name: previousName }),
            body: t(requestStop.afterPreviousText, { name: previousName }),
          }
        : { title: t("Get ready"), body: t(requestStop.unnamedPreviousText) };
    }
    return {
      title: t("Next stop: {name}", { name }),
      body: t(exit.nextNotification),
    };
  }
  if (stage === "now") {
    return {
      title: t("This is your stop: {name}", { name }),
      body: t("Get off now."),
    };
  }
  if (stage === "missed") {
    return {
      title: t("Your stop may be behind you"),
      body: t("Get off at the next stop and open its departures in the app."),
    };
  }
  return {
    title: t("Your get-off alert is working"),
    body: capitalized(name),
  };
}

/**
 * @param {RideAlertStage} stage
 * @param {RideAlertStop} stop
 * @param {number | null} [routeType]
 * @param {RideAlertContext} [context]
 * @returns {Promise<boolean>} Whether a notification was shown.
 */
export async function showRideNotification(
  stage,
  stop,
  routeType = null,
  context = {}
) {
  const NotificationApi = globalThis.Notification;
  if (!NotificationApi || NotificationApi.permission !== "granted") {
    return false;
  }

  const copy = notificationCopy(stage, stop, routeType, context);
  const options = {
    body: copy.body,
    // Remember the exact app page that produced the alert. If several Turku
    // Departures tabs are open, the service worker can return the passenger
    // to this one instead of focusing an unrelated stop board first.
    data: {
      url:
        typeof globalThis.location?.href === "string"
          ? globalThis.location.href
          : "",
    },
    // So a phone reading notifications aloud picks the right voice.
    lang: getLanguage(),
    tag: "foli-active-ride",
    // Every stage replaces the one before under one tag, and a replacement
    // without renotify is silent: "Press STOP" reached a locked phone
    // without a sound. Only the start-up test stays quiet.
    renotify: stage !== "test",
    requireInteraction: stage === "now",
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}notification-badge-96.png`,
  };

  try {
    const registration =
      typeof globalThis.navigator?.serviceWorker?.getRegistration === "function"
        ? await globalThis.navigator.serviceWorker.getRegistration()
        : null;

    if (registration?.showNotification) {
      await registration.showNotification(copy.title, options);
      return true;
    }

    if (typeof NotificationApi === "function") {
      // Without a service worker the tap lands on the page, and it has to be
      // sent somewhere: a get-off alert that does nothing when pressed costs
      // the passenger the seconds it was meant to buy them.
      try {
        activePageRideNotification?.close?.();
      } catch {
        // Replacing an older fallback notification is best effort.
      }

      const notification = new NotificationApi(copy.title, options);
      activePageRideNotification = notification;
      notification.onclick = () => {
        try {
          globalThis.focus?.();
          notification.close?.();
        } catch {
          // Focusing is best effort; the alert has already been delivered.
        } finally {
          if (activePageRideNotification === notification) {
            activePageRideNotification = null;
          }
        }
      };
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

// `context` carries the stop before the exit and whether the bus has been
// seen leaving it, which decides what NEXT asks the passenger to do.
/**
 * @param {RideAlertStage} stage
 * @param {RideAlertStop} stop
 * @param {boolean} [notificationsEnabled]
 * @param {number | null} [routeType]
 * @param {RideAlertContext} [context]
 */
export function announceRideStage(
  stage,
  stop,
  notificationsEnabled = true,
  routeType = null,
  context = {}
) {
  playRideTone(stage);
  vibrateRideStage(stage);
  speakRideStage(stage, stop, routeType, context);

  if (notificationsEnabled) {
    void showRideNotification(stage, stop, routeType, context);
  }
}

export function repeatNowRideSignal() {
  playRideTone("now");
  vibrateRideStage("now");
}

/**
 * @param {RideAlertStop} stop
 * @param {boolean} [notificationsEnabled]
 * @returns {Promise<void>}
 */
export async function runRideTestAlert(stop, notificationsEnabled = true) {
  await unlockRideAudio();
  playRideTone("test");
  vibrateRideStage("test");
  speakRideStage("test", stop);

  if (notificationsEnabled) {
    void showRideNotification("test", stop);
  }
}

/** @returns {Promise<void>} */
async function closeRideNotifications() {
  const pageNotification = activePageRideNotification;
  activePageRideNotification = null;

  try {
    pageNotification?.close?.();
  } catch {
    // A fallback page notification may already have been dismissed.
  }

  try {
    const registration =
      typeof globalThis.navigator?.serviceWorker?.getRegistration === "function"
        ? await globalThis.navigator.serviceWorker.getRegistration()
        : null;
    const notifications =
      typeof registration?.getNotifications === "function"
        ? await registration.getNotifications({ tag: "foli-active-ride" })
        : [];

    for (const notification of notifications || []) {
      try {
        notification?.close?.();
      } catch {
        // One stale notification must not block cleanup of the others.
      }
    }
  } catch {
    // Notification cleanup is best effort and must never block ending a ride.
  }
}

/** @returns {Promise<void>} Settles once notifications are closed. */
export function stopRideAlerts() {
  try {
    globalThis.navigator?.vibrate?.(0);
  } catch {
    // Best-effort haptic cleanup only.
  }

  try {
    globalThis.speechSynthesis?.cancel?.();
  } catch {
    // Speech is optional.
  }

  return closeRideNotifications();
}

/**
 * @returns {{
 *   audio: boolean,
 *   vibration: boolean,
 *   speech: boolean,
 *   notifications: boolean,
 *   wakeLock: boolean,
 * }}
 */
export function rideAlertCapabilities() {
  return {
    audio: Boolean(AudioContextConstructor()),
    vibration: typeof globalThis.navigator?.vibrate === "function",
    speech: speechSupported(),
    notifications: Boolean(globalThis.Notification),
    wakeLock: Boolean(globalThis.navigator?.wakeLock?.request),
  };
}
