import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
// Fonts are served from our own origin, not fonts.googleapis.com: loading them from Google sends
// every visitor's IP to Google (a GDPR complaint ground in the EU, a cross-border transfer under 152-FZ).
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "flag-icons/css/flag-icons.min.css";
import "./ui/base.css";
import "./ui/v0/tailwind.css";
import { installDevErrorOverlay } from "./ui/dev-error-overlay";
import { ConfirmProvider } from "./components/ui/confirm-dialog";
import { LanguageProvider } from "./lib/i18n";

installDevErrorOverlay();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <LanguageProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

