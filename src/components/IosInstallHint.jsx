import { useState } from "react";
import { t } from "../i18n";

const DISMISSED_KEY = "turku-departures-ios-install-hint-v1";

export function isIosLike({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
} = {}) {
  return (
    /iPad|iPhone|iPod/i.test(String(userAgent)) ||
    (String(platform) === "MacIntel" && Number(maxTouchPoints) > 1)
  );
}

function installedStandalone() {
  try {
    if (globalThis.navigator?.standalone === true) return true;
    if (globalThis.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    if (globalThis.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    return false;
  }
  return false;
}

function wasDismissed() {
  try {
    return globalThis.localStorage?.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function IosInstallHint() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const nav = globalThis.navigator;
  const eligible =
    !dismissed &&
    isIosLike({
      userAgent: nav?.userAgent,
      platform: nav?.platform,
      maxTouchPoints: nav?.maxTouchPoints,
    }) &&
    !installedStandalone();

  if (!eligible) return null;

  const dismiss = () => {
    try {
      globalThis.localStorage?.setItem(DISMISSED_KEY, "1");
    } catch {
      // A blocked storage write should not trap the passenger in the hint.
    }
    setDismissed(true);
  };

  return (
    <aside className="ios-install-hint" aria-labelledby="ios-install-title">
      <div>
        <strong id="ios-install-title">{t("Install on iPhone")}</strong>
        <p>
          {t(
            "For iPhone notifications, add Turku Departures to your Home Screen: Share → Add to Home Screen. Keep this app open during a get-off alert."
          )}
        </p>
      </div>
      <button type="button" onClick={dismiss}>
        {t("Dismiss")}
      </button>
    </aside>
  );
}
