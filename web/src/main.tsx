import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
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

