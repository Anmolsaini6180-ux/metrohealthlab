import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/hooks/useAuth";
import { BrandingSettingsProvider } from "@/hooks/useBrandingSettings";
import { ToastProvider } from "@/hooks/useToast";
import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BrandingSettingsProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrandingSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Fade out the static splash (logo + company name in index.html) now
// that React has actually rendered, so there's no blank flash between
// the two.
const splash = document.getElementById("app-splash");
if (splash) {
  requestAnimationFrame(() => {
    splash.classList.add("is-hiding");
    setTimeout(() => splash.remove(), 400);
  });
}

// Register the service worker — this is what makes Chrome offer
// "Install app" (a real installable PWA) rather than just a plain
// "Add to Home screen" bookmark shortcut. Only in production builds;
// a service worker during `vite dev` interferes with hot reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
