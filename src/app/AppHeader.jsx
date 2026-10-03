import { t } from "../i18n";
import LanguageSwitch from "../components/LanguageSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

// The product name, as the page title and icons carry it; never translated.
const PRODUCT_NAME = "Turku Departures";

// The banner: the mark, the name, the language and theme switches, and the
// connection state a screen reader hears change.
/**
 * @param {{ stopId: string, firstRun: boolean, online: boolean }} props
 */
export default function AppHeader({ stopId, firstRun, online }) {
  return (
    <header className="topbar">
      <div className="brandLockup">
        {/* The favicon, and the source scripts/build-icons.mjs renders the
            home-screen and get-off notification icons from, so the mark
            someone tapped is the mark that greets them. Decorative here:
            the wordmark beside it already carries the name, so a second
            "Turku Departures" for a screen reader would only repeat it. */}
        <img
          className="brandMark"
          src={`${import.meta.env.BASE_URL}foli-icon.svg`}
          alt=""
          width="48"
          height="48"
          decoding="async"
        />
        <div className="brandText">
          {/* Turku is officially bilingual, and the pairing is itself a
              local signal. The independence disclaimer keeps its place in
              the footer; this line has one job, which is "you are here". */}
          {/* The language switch rides on this short line's spare end: in a
              row of its own it cost every phone screen a line of board. */}
          <div className="eyebrow-row">
            <p className="eyebrow">
              <span lang="fi">Turku</span> · <span lang="sv">Åbo</span>
            </p>
            <div className="header-controls">
              <ThemeSwitch />
              <LanguageSwitch />
            </div>
          </div>
          {/* The name stays English in either interface, and is read so.
              Before a stop is open it is the page's heading: a first
              visit had no h1 at all. With a stop open, the stop's name on
              the board is the h1, and a page has only one. */}
          {stopId ? (
            <p className="brand" lang="en">
              {PRODUCT_NAME}
            </p>
          ) : (
            <h1 id="app-title" className="brand" lang="en" tabIndex={-1}>
              {PRODUCT_NAME}
            </h1>
          )}
          <p
            className="context"
            data-firstrun={firstRun ? "true" : "false"}
          >
            {t("Live bus times, disruptions and get-off alerts.")}
          </p>
        </div>
      </div>
      {/* Out of sight, and always in the page, so a change of connection
          is announced: a live region added at that moment often is not.
          The Offline banner below is what the eye gets. */}
      <span className="live-pill" aria-live="polite">
        {online ? t("Online") : t("Offline mode")}
      </span>
    </header>
  );
}
