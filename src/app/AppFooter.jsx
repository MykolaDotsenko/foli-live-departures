import { t } from "../i18n";
import BuildIdentity from "../components/BuildIdentity";
import HelpGuide from "../components/HelpGuide";
import LocalStateBackup from "../components/LocalStateBackup";

const MAKER_NAME = "Mykola Dotsenko";

// Who makes this, where the data comes from, what stays on the phone and
// what leaves it, and how to reach the maker.
export default function AppFooter() {
  return (
    <footer className="source-note">
      <p className="source-line">
        {t("Independent app · Data: Föli open data")} ·{" "}
        <a href="https://data.foli.fi/" target="_blank" rel="noreferrer">
          data.foli.fi
        </a>{" "}
        ·{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
      </p>

      <div className="maker-row">
        <span>
          {t("Built by")}{" "}
          <a
            href="https://github.com/MykolaDotsenko"
            target="_blank"
            rel="noreferrer"
          >
            {MAKER_NAME}
          </a>
        </span>
        <nav className="project-links" aria-label={t("Project links")}>
          <a
            href="mailto:docnikolaj1990@gmail.com?subject=Turku%20Departures%20feedback"
            aria-label={t("Contact the maker by email")}
          >
            {t("Contact")}
          </a>
          <a
            href="https://github.com/MykolaDotsenko/foli-live-departures/issues/new?template=bug_report.yml"
            target="_blank"
            rel="noreferrer"
          >
            {t("Report a problem (GitHub)")}
          </a>
          <a
            href="https://github.com/MykolaDotsenko/foli-live-departures"
            target="_blank"
            rel="noreferrer"
          >
            {t("Source code")}
          </a>
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>
            {t("Privacy policy")}
          </a>
        </nav>
      </div>

      {/* Trust needs one place that says who makes this, what stays on
          the phone and what leaves it. The facts were spread over a
          dozen fine-print lines, and a one-line disclaimer was all a
          passenger saw without scrolling to the bottom. */}
      <div className="footer-actions">
        <HelpGuide />
        <details className="about">
          <summary>{t("About & privacy")}</summary>
        <dl>
          <dt>{t("Who makes it")}</dt>
          <dd>
            {t(
              "Turku Departures is an independent project by Mykola Dotsenko. It uses Föli open data but is not made by or affiliated with Föli or the City of Turku. For tickets and official journey planning, use Föli’s own services."
            )}{" "}
            {/* It is a companion to the official services, not a stand-in
                for them, so it points the way. */}
            <a href="https://www.foli.fi/" target="_blank" rel="noreferrer">
              {t("Föli’s website")}
            </a>
          </dd>
          <dt>{t("Release")}</dt>
          <BuildIdentity />
          <dt>{t("Where the times come from")}</dt>
          <dd>
            {t(
              "Föli open data at data.foli.fi, under CC BY 4.0, as processed by this app. Live times are estimates from the buses and can change."
            )}
          </dd>
          <dt>{t("What stays on this phone")}</dt>
          <dd>
            {t(
              "Favourites, recent stops and when you last looked at them, each stop’s line filter, My Places (public stop numbers and names, never an address), the last few departure boards for up to 15 minutes, a ride in progress for up to six hours, and recent place-search results for this browser session only. Clearing this site’s data removes all of it."
            )}
          </dd>
          <dt>{t("What leaves the phone")}</dt>
          {/* One fact per entry: a single paragraph ran to 90 words. */}
          <dd>
            {t(
              "The app is loaded from GitHub Pages, which sees your IP address. The stops you look up and the buses whose stops you open are fetched from data.foli.fi, which sees your IP address and what was asked for. During a ride, so are your exit stop and the one before it."
            )}
          </dd>
          <dd>
            {t(
              "Your location is used to find a stop when you ask, and during a ride while Follow my location is on. It stays on the phone and is never saved."
            )}
          </dd>
          <dd>
            {t(
              "Direct address and place lookup is disabled in the production web app. Address and place text stays on this device, and the app offers the official Turku journey planner instead. Föli stop search remains available inside Turku Departures."
            )}
          </dd>
          <dd>
            {t(
              "Google Maps opens only when you tap a route link. It gets the stop you chose and may then use your location to plan the route."
            )}
          </dd>
          <dt>{t("What it doesn’t have")}</dt>
          <dd>{t("No account, no ads, no analytics.")}</dd>
        </dl>
        <LocalStateBackup />
        </details>
      </div>
    </footer>
  );
}
