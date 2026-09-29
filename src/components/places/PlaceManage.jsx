// The "Manage" drawer under a saved place: replace it from where the
// passenger stands now, share it with someone they trust, or remove it,
// with the privacy cost of sharing said before the button.
import { useState } from "react";
import { t } from "../../i18n";
import { buildSharedPlaceUrl } from "../../utils/sharedPlaces";
import styles from "../MyPlaces.module.css";
import { PLACE_PHRASES } from "./placePhrases";
import { offerPlaceLink } from "./sharePlace";

export default function PlaceManage({
  place,
  label,
  titleId,
  onReplace,
  onRemove,
  locating = false,
}) {
  // The phrase, worded when shown, so it follows a language switch.
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  const sharePlace = async () => {
    const url = buildSharedPlaceUrl(place);
    if (!url) return;

    setShareFeedback("");
    setShareUrl("");

    const outcome = await offerPlaceLink({ url, place, label });
    if (!outcome) return;

    if (outcome.url) setShareUrl(outcome.url);
    setShareFeedback(outcome.feedback);
  };

  return (
    <details className={styles.manage}>
      <summary>{t(PLACE_PHRASES[place.id].manage)}</summary>
      <p className={styles.sharePrivacyHint}>
        {t(PLACE_PHRASES[place.id].sharing)}
      </p>
      <div className={styles.manageActions}>
        <button
          type="button"
          className={styles.textButton}
          // Busy rather than disabled: a disabled button drops keyboard
          // focus to the page mid-lookup.
          onClick={() => {
            if (!locating) onReplace(place.id);
          }}
          aria-disabled={locating}
          aria-busy={locating}
        >
          {t("Replace using where I am now")}
        </button>
        <button
          type="button"
          className={styles.textButton}
          onClick={sharePlace}
          // The name is what it says; the place it is for is read after.
          aria-describedby={titleId}
        >
          {t("Share this place")}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          aria-describedby={titleId}
          onClick={() => {
            if (window.confirm(t("Remove {label} from My Places?", { label }))) {
              onRemove(place.id);
            }
          }}
        >
          {t("Remove this place")}
        </button>
      </div>
      {shareFeedback && (
        <p className={styles.shareFeedback} role="status">
          {t(shareFeedback)}
        </p>
      )}
      {shareUrl && (
        <input
          className={styles.shareInput}
          aria-label={t("Share link for {label}", { label })}
          readOnly
          value={shareUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </details>
  );
}
