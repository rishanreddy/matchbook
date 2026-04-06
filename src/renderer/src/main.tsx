import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { appTheme } from './theme'
import './index.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setupGlobalErrorHandlers } from './lib/utils/errorHandler'
import { applyConfiguredSurveyJsLicenseKey } from './lib/utils/surveyLicense'

setupGlobalErrorHandlers()

applyConfiguredSurveyJsLicenseKey()

const isElectronRuntime = typeof window !== 'undefined' && window.electronAPI

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications aria-live="polite" />
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
)
