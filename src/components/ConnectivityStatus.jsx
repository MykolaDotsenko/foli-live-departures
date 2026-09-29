import { t } from "../i18n";
import styles from "./ConnectivityStatus.module.css";

// What the eye gets when the connection goes. It is not a live region: the
// header's always-present status line (App.jsx) announces the change, and
// with this banner and the board's notice also speaking, a screen reader
// said "offline" three times at once. Nor is it an <aside>: without its
// status role that made it a landmark of its own inside the main content.
function ConnectivityStatus({ online }) {
  if (online) return null;

  return (
    <div className={styles.banner}>
      <strong>{t("Offline")}</strong>
      <span>
        {t(
          "Saved places and Show to driver still work. Live times and directions need a connection."
        )}
      </span>
    </div>
  );
}

export default ConnectivityStatus;
