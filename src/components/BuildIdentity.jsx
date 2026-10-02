import { t, useLanguage } from "../i18n";
import { BUILD_IDENTITY } from "../utils/buildIdentity";

const COMMIT_URL =
  "https://github.com/MykolaDotsenko/foli-live-departures/commit/";

/**
 * A support identifier, not telemetry: it reads only immutable build-time
 * metadata and never writes or sends anything.
 *
 * @param {{identity?: typeof BUILD_IDENTITY}} props
 */
export default function BuildIdentity({ identity = BUILD_IDENTITY }) {
  useLanguage();

  return (
    <dd
      className="build-identity"
      data-build-version={identity.version}
      data-build-sha={identity.sha}
      data-build-platform={identity.platform}
    >
      <span>{t("Version {version}", { version: identity.version })}</span>
      {" · "}
      {identity.sha ? (
        <a
          href={`${COMMIT_URL}${identity.sha}`}
          target="_blank"
          rel="noreferrer"
          title={identity.sha}
          aria-label={t("Source revision {revision}", {
            revision: identity.sha,
          })}
        >
          {t("Build {revision}", { revision: identity.shortSha })}
        </a>
      ) : (
        <span>{t("Local build")}</span>
      )}
    </dd>
  );
}
