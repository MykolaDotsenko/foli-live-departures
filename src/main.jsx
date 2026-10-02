import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { initializeLanguage } from "./i18n";

async function renderApp() {
  await initializeLanguage();
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

void renderApp();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(async () => {
        // A reload landing inside the first install leaves this document
        // uncontrolled for good: the worker claimed the page it replaced.
        // Without asking, the visit has no offline shell at all — which is
        // the visit where someone boards and rides into a tunnel.
        const registration = await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          registration.active?.postMessage({ type: "foli-claim-clients" });
        }
      })
      .catch(() => {
        // Installation support must never block live departures.
      });
  });
}
