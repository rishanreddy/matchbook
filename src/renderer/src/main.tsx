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
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "react-tourlight/styles.css";
import App from "./App.tsx";
import { TourlightRouterBridge } from "./components/TourlightRouterBridge";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { setupGlobalErrorHandlers } from "./lib/utils/errorHandler";
import { setupToastKeyboardDismissal } from "./lib/utils/notify";
import { applyConfiguredSurveyJsLicenseKey } from "./lib/utils/surveyLicense";
// Keep last: production loads app CSS after vendor CSS, and dev has to cascade the same way.
import "./index.css";

setupGlobalErrorHandlers();
setupToastKeyboardDismissal();

applyConfiguredSurveyJsLicenseKey();

const isElectronRuntime = typeof window !== "undefined" && window.electronAPI;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications aria-live="polite" position="bottom-right" limit={3} autoClose={4500} containerWidth={380} />
      {isElectronRuntime ? (
        <HashRouter>
          <TourlightRouterBridge>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </TourlightRouterBridge>
        </HashRouter>
      ) : (
        <BrowserRouter>
          <TourlightRouterBridge>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </TourlightRouterBridge>
        </BrowserRouter>
      )}
    </MantineProvider>
  </StrictMode>,
);
