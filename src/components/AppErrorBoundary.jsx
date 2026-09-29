import React from "react";
import { t } from "../i18n";
import styles from "./AppErrorBoundary.module.css";

// The product name, as the header shows it; never translated.
const PRODUCT_NAME = "Turku Departures";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Turku Departures render failure", error, info);
  }

  reload = () => {
    globalThis.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className={styles.shell}>
        <section className={styles.card} role="alert" aria-live="assertive">
          <p className={styles.kicker} lang="en">
            {PRODUCT_NAME}
          </p>
          <h1>{t("Something went wrong.")}</h1>
          <p>
            {t(
              "Something broke on this screen. Your saved stops are still on this phone."
            )}
          </p>
          <button type="button" onClick={this.reload}>
            {t("Reload app")}
          </button>
          <p className={styles.fallback}>
            {t(
              "If that doesn’t help, use Föli’s own services at foli.fi."
            )}
          </p>
        </section>
      </main>
    );
  }
}
