// Handing a place's link on: the phone's own share sheet where there is
// one, the clipboard where there is not, and otherwise the link itself for
// the passenger to copy. Nothing is sent anywhere by the app.
import { msg, t } from "../../i18n";
import { PLACE_PHRASES } from "./placePhrases";

// Resolves to the feedback phrase to show and the link to show for manual
// copying (empty when it was shared or copied), or null when the passenger
// closed the share sheet themselves.
export async function offerPlaceLink({ url, place, label }) {
  try {
    if (typeof navigator?.share === "function") {
      await navigator.share({
        title: t("{label} · My Places", { label }),
        text: t(PLACE_PHRASES[place.id].shareText),
        url,
      });
      return { feedback: msg("Link shared."), url: "" };
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { feedback: msg("Share link copied."), url: "" };
    }
  } catch (error) {
    if (error?.name === "AbortError") return null;
  }

  return { feedback: msg("Copy the share link below."), url };
}
