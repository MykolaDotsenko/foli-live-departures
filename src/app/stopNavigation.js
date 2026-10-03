// The open stop lives in the address (?stop=164), so Back, Forward, reload
// and a shared link all agree on it.
import { stopToReopen } from "../hooks/useSavedStops";
import { parseSharedPlaceHash } from "../utils/sharedPlaces";

export function stopFromLocation() {
  const stopFromUrl = new URLSearchParams(window.location.search).get("stop");
  return /^\d+$/.test(stopFromUrl || "") ? stopFromUrl : "";
}

// The home-screen icon opens the bare address, and a daily passenger opens
// it for their own stop: the one they last looked at, or their first
// favourite. A link that names a stop, even one that does not exist, and a
// shared place's link still decide for themselves.
export function openingStop() {
  if (new URLSearchParams(window.location.search).has("stop")) {
    return stopFromLocation();
  }
  if (parseSharedPlaceHash(window.location.hash)) return "";
  return stopToReopen();
}

// A shared-place token belongs to the page it arrived on. Carried into
// every stop URL, it put the "Add Home?" question back one Back press
// after "Not now". So an entry keeps it only while it is the page the link
// opened; leaving for another stop drops it from both entries.
export function stopUrl(stopId, { keepSharedPlace = false } = {}) {
  const url = new globalThis.URL(window.location.href);

  if (/^\d+$/.test(stopId || "")) {
    url.searchParams.set("stop", stopId);
  } else {
    url.searchParams.delete("stop");
  }

  if (!keepSharedPlace && url.hash.startsWith("#place=")) {
    url.hash = "";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function currentHistoryState() {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : {};
}

export function canonicalizeCurrentStop(stopId, options) {
  window.history.replaceState(
    currentHistoryState(),
    "",
    stopUrl(stopId, options)
  );
}
