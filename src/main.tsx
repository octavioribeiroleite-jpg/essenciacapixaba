import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent service worker issues in preview/iframe contexts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else {
  // Production: register the PWA service worker and auto-reload when a new
  // version is available so the user always sees the latest deploy.
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // New SW is waiting -> activate it and reload to pick up the new build
        updateSW(true);
      },
      onRegisteredSW(_swUrl, registration) {
        // Poll for updates every 60s so long-lived sessions pick up new deploys
        if (registration) {
          setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 1000);
        }
      },
    });

    // Also check for updates whenever the tab regains focus
    window.addEventListener("focus", () => {
      navigator.serviceWorker?.getRegistration().then((r) => r?.update());
    });

    // Reload once when the controlling SW changes (new version took over)
    let reloaded = false;
    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
