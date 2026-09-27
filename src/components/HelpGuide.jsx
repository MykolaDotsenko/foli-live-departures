import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "../i18n";
import styles from "./HelpGuide.module.css";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HelpGuide() {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("quick");
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const quickTitleRef = useRef(null);
  const fullTitleRef = useRef(null);

  const openGuide = () => {
    setView("quick");
    setOpen(true);
  };

  const closeGuide = () => setOpen(false);

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
        closeGuide();
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

      if (
        event.shiftKey &&
        (active === dialogRef.current || active === first || !inside)
      ) {
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

  useEffect(() => {
    if (!open) return;

    if (view === "full") {
      fullTitleRef.current?.focus();
    } else {
      quickTitleRef.current?.focus();
    }
  }, [open, view]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="guide-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openGuide}
      >
        {t("How to use")}
      </button>

      {open && (
        <div className={styles.backdrop} onMouseDown={closeGuide}>
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
                <p className={styles.kicker}>
                  {view === "quick" ? t("Start here") : t("Full guide")}
                </p>
                <h2
                  id="app-guide-title"
                  ref={view === "quick" ? quickTitleRef : fullTitleRef}
                  tabIndex={-1}
                >
                  {view === "quick"
                    ? t("Three things to know")
                    : t("How to use Föli departures")}
                </h2>
                <p id="app-guide-intro" className={styles.intro}>
                  {view === "quick"
                    ? t(
                        "Find a stop, check the next bus, then use Get-off Alert if you want help during the ride."
                      )
                    : t(
                        "The full guide explains departures, disruptions, Get-off Alert and saved places."
                      )}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeIcon}
                aria-label={t("Close guide")}
                onClick={closeGuide}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            {view === "quick" ? (
              <>
                <ol className={styles.quickSteps}>
                  <li className={styles.quickStep}>
                    <span className={styles.quickNumber} aria-hidden="true">{1}</span>
                    <div>
                      <h3>{t("Find a stop")}</h3>
                      <p>{t("Search by name or number, or use Nearby stops.")}</p>
                    </div>
                  </li>
                  <li className={styles.quickStep}>
                    <span className={styles.quickNumber} aria-hidden="true">{2}</span>
                    <div>
                      <h3>{t("Check the next bus")}</h3>
                      <p>
                        {t(
                          "Open departures and check whether the time is live or scheduled."
                        )}
                      </p>
                    </div>
                  </li>
                  <li className={styles.quickStep}>
                    <span className={styles.quickNumber} aria-hidden="true">{3}</span>
                    <div>
                      <h3>{t("Use Get-off Alert")}</h3>
                      <p>
                        {t(
                          "Tap Get-off alert on your bus and choose where you want to get off."
                        )}
                      </p>
                    </div>
                  </li>
                </ol>

                <aside className={styles.quickTip}>
                  <strong>{t("That is enough to get started.")}</strong>
                  <span>
                    {t(
                      "The full guide also covers disruptions, offline behaviour and saved places."
                    )}
                  </span>
                </aside>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={closeGuide}
                  >
                    {t("Got it")}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => setView("full")}
                  >
                    {t("See full guide")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <ol className={styles.steps}>
                  <li className={styles.step}>
                    <span className={styles.number} aria-hidden="true">{1}</span>
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
                    <span className={styles.number} aria-hidden="true">{2}</span>
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
                    <span className={styles.number} aria-hidden="true">{3}</span>
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
                    <span className={styles.number} aria-hidden="true">{4}</span>
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
                    <span className={styles.number} aria-hidden="true">{5}</span>
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
                    className={styles.secondary}
                    onClick={() => setView("quick")}
                  >
                    {t("Quick start")}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={closeGuide}
                  >
                    {t("Got it")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
