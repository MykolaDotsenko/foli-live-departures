import { t } from "../i18n";
import styles from "./ConnectivityStatus.module.css";

function ConnectivityStatus({ online }) {
  if (online) return null;

  return (
    <aside className={styles.banner} role="status" aria-live="polite">
      <strong>{t("Offline")}</strong>
      <span>
        {t(
          "Your saved places and the driver card still work. Live times and directions need a connection."
        )}
      </span>
    </aside>
  );
}

export default ConnectivityStatus;
