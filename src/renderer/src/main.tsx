import "./lib/styles/hide-banner.css";
// Fonts are bundled, not fetched. Matchbook runs at venues with no usable internet,
// where a Google Fonts stylesheet would simply never resolve and every screen would
// silently fall back to a system face.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { appTheme } from "./theme";
import "./index.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { setupGlobalErrorHandlers } from "./lib/utils/errorHandler";
import { applyConfiguredSurveyJsLicenseKey } from "./lib/utils/surveyLicense";

setupGlobalErrorHandlers();

applyConfiguredSurveyJsLicenseKey();

const isElectronRuntime = typeof window !== "undefined" && window.electronAPI;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications aria-live="polite" position="bottom-right" limit={4} autoClose={5000} />
      {isElectronRuntime ? (
        <HashRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </HashRouter>
      ) : (
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      )}
    </MantineProvider>
  </StrictMode>,
);
