import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "../i18n";
import styles from "./HelpGuide.module.css";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HelpGuide() {
  useLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = globalThis.document?.body?.style.overflow || "";
    if (globalThis.document?.body) {
      globalThis.document.body.style.overflow = "hidden";
    }

    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [
        ...(dialogRef.current?.querySelectorAll(FOCUSABLE) || []),
      ].filter((element) => !element.hasAttribute("hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = globalThis.document?.activeElement;
      const inside = dialogRef.current?.contains(active);

      if (event.shiftKey && (active === dialogRef.current || active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === dialogRef.current || active === last || !inside)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    globalThis.document?.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.document?.removeEventListener("keydown", handleKeyDown);
      if (globalThis.document?.body) {
        globalThis.document.body.style.overflow = previousOverflow;
      }
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="guide-switch"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t("Guide")}
      </button>

      {open && (
        <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
          <section
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-guide-title"
            aria-describedby="app-guide-intro"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.header}>
              <div>
                <p className={styles.kicker}>{t("Quick guide")}</p>
                <h2 id="app-guide-title">{t("How to use Föli departures")}</h2>
                <p id="app-guide-intro" className={styles.intro}>
                  {t(
                    "Start with a stop. The app then helps you understand departures, disruptions and when to press STOP."
                  )}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeIcon}
                aria-label={t("Close guide")}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.number} aria-hidden="true">1</span>
                <div>
                  <h3>{t("Find your stop")}</h3>
                  <p>
                    {t(
                      "Search by stop name or number, use a favourite, or find nearby stops."
                    )}
                  </p>
                </div>
              </li>

              <li className={styles.step}>
                <span className={styles.number} aria-hidden="true">2</span>
                <div>
                  <h3>{t("Check what leaves next")}</h3>
                  <p>
                    {t(
                      "Live departures are separated from timetable data, and stale information is marked instead of presented as live."
                    )}
                  </p>
                </div>
              </li>

              <li className={styles.step}>
                <span className={styles.number} aria-hidden="true">3</span>
                <div>
                  <h3>{t("Use Get-off Alert")}</h3>
                  <p>
                    {t(
                      "Tap Get-off alert on your bus, choose where you want to get off, then keep the ride screen open. It tells you when to get ready, press STOP and get off."
                    )}
                  </p>
                </div>
              </li>

              <li className={styles.step}>
                <span className={styles.number} aria-hidden="true">4</span>
                <div>
                  <h3>{t("Watch for disruptions")}</h3>
                  <p>
                    {t(
                      "Relevant service updates appear with the stop and routes you are using."
                    )}
                  </p>
                </div>
              </li>

              <li className={styles.step}>
                <span className={styles.number} aria-hidden="true">5</span>
                <div>
                  <h3>{t("Save familiar places")}</h3>
                  <p>
                    {t(
                      "Save Home, School or Work as public stops. Get me Home, backup stops and the driver card can help when the normal trip goes wrong."
                    )}
                  </p>
                </div>
              </li>
            </ol>

            <aside className={styles.tip}>
              <strong>{t("Good to know")}</strong>
              <p>
                {t(
                  "The app works without an account. Some saved information remains available offline, but live departures and directions still need a connection."
                )}
              </p>
            </aside>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => setOpen(false)}
              >
                {t("Got it")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
